import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection
from backend.services.concepts import calcular_conceito, identificar_disciplina

historico_bp = Blueprint('historico', __name__, url_prefix='/api/historico')


@historico_bp.route('', methods=['GET'])
def listar_historico():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola')
    turma_id = request.args.get('turma')
    aluno_id = request.args.get('aluno_id')
    prova_id = request.args.get('prova_id')
    try: limit = int(request.args.get('limit', 100))
    except: limit = 100
    limit = max(1, min(limit, 1000))
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT h.*, a.nome as aluno_nome, p.titulo as prova_titulo,
            p.disciplina, p.serie as prova_serie, t.serie,
            t.nome as turma_nome, e.nome as escola_nome,
            t.id as turma_id, e.id as escola_id,
            p.quantidade_questoes as total_questoes, p.tipo_questoes, p.bncc
            FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id
            LEFT JOIN provas p ON h.prova_id = p.id
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_sessao is not None:
            params.append(escola_sessao); query += " AND a.escola_id = %s"
        elif escola_param and escola_param not in ('', 'null'):
            try: params.append(int(escola_param)); query += " AND e.id = %s"
            except: pass
        if turma_id and turma_id not in ('', 'null'):
            try: params.append(int(turma_id)); query += " AND t.id = %s"
            except: pass
        if aluno_id and aluno_id not in ('', 'null'):
            try: params.append(int(aluno_id)); query += " AND h.aluno_id = %s"
            except: pass
        if prova_id and prova_id not in ('', 'null'):
            try: params.append(int(prova_id)); query += " AND h.prova_id = %s"
            except: pass
        query += f" ORDER BY h.data_correcao DESC LIMIT {limit}"
        cur.execute(query, params)
        historico = cur.fetchall(); cur.close()
        result = []
        for item in historico:
            d = dict(item)
            total = d.get('total_questoes') or 20
            acertos = d.get('acertos', 0) or 0
            pct = round((acertos / total) * 100) if total > 0 else 0
            conceito = calcular_conceito(pct)
            d['conceito'] = conceito['nome']
            d['conceito_rotulo'] = conceito['rotulo']
            d['conceito_cor'] = conceito['cor']
            d['porcentagem'] = pct
            if not d.get('tipo_avaliacao'):
                d['tipo_avaliacao'] = identificar_disciplina(
                    d.get('prova_titulo', ''), d.get('disciplina', ''), d.get('serie', ''))
            result.append(d)
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ listar_historico: {e}"); traceback.print_exc()
        return jsonify([])
    finally:
        if conn:
            try: conn.close()
            except: pass


@historico_bp.route('/agrupado', methods=['GET'])
def historico_agrupado():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola')
    turma_id = request.args.get('turma')
    aluno_id = request.args.get('aluno_id')
    serie = request.args.get('serie')
    prova_id = request.args.get('prova')
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT h.*, a.nome as aluno_nome, p.titulo as prova_titulo,
            p.disciplina, p.serie as prova_serie, p.gabarito as prova_gabarito,
            p.quantidade_questoes, p.bncc as prova_bncc,
            t.serie, t.nome as turma_nome, e.nome as escola_nome
            FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id
            LEFT JOIN provas p ON h.prova_id = p.id
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_sessao is not None:
            params.append(escola_sessao); query += " AND a.escola_id = %s"
        elif escola_param and escola_param not in ('', 'null'):
            try: params.append(int(escola_param)); query += " AND e.id = %s"
            except: pass
        if turma_id and turma_id not in ('', 'null'):
            try: params.append(int(turma_id)); query += " AND t.id = %s"
            except: pass
        if aluno_id and aluno_id not in ('', 'null'):
            try: params.append(int(aluno_id)); query += " AND h.aluno_id = %s"
            except: pass
        if serie and serie not in ('', 'null'):
            params.append(serie); query += " AND t.serie = %s"
        if prova_id and prova_id not in ('', 'null'):
            try: params.append(int(prova_id)); query += " AND h.prova_id = %s"
            except: pass
        query += " ORDER BY a.nome, h.data_correcao DESC"
        tem_f = bool((turma_id and turma_id not in ('', 'null')) or
                     (aluno_id and aluno_id not in ('', 'null')) or
                     (prova_id and prova_id not in ('', 'null')))
        if not tem_f: query += " LIMIT 1000"
        cur.execute(query, params)
        historico = cur.fetchall(); cur.close()
        alunos_map = {}
        for item in historico:
            item = dict(item)
            key = item.get('aluno_id') or item.get('aluno_nome')
            if not key: continue
            if key not in alunos_map:
                alunos_map[key] = {'aluno_id': item.get('aluno_id'),
                                    'aluno_nome': item.get('aluno_nome', 'Aluno'),
                                    'serie': item.get('serie', ''), 'turma': item.get('turma_nome', ''),
                                    'escola': item.get('escola_nome', ''), 'avaliacoes': {}}
            disc = item.get('disciplina', ''); pt = item.get('prova_titulo', '')
            tipo = identificar_disciplina(pt, disc, item.get('serie', ''))
            dl = (disc or '').lower(); pl = (pt or '').lower()
            is_red = ('reda' in dl or 'reda' in pl or item.get('tipo_correcao') == 'ia_redacao')
            is_pm = item.get('tipo_correcao') == 'manual_producao'
            if is_pm: tipo = 'Producao'
            if is_red or is_pm:
                nr = float(item.get('nota') or 0)
                ar = int(item.get('acertos') or 0)
                tr = int(item.get('total') or 10)
                er = max(0, tr - ar)
                qs = [{'numero': 1, 'resposta': f'Nota {nr}', 'gabarito': '10.0',
                       'acertou': nr >= 6, 'respondida': True, 'bncc': '', 'status': f'📝 Nota {nr}'}]
                dados = {'nota': nr, 'acertos': ar, 'erros': er, 'total': tr,
                         'prova': pt, 'data': item.get('data_correcao',''), 'disciplina': disc,
                         'questoes_status': qs, 'bncc': [''], 'respostas': [f'Nota {nr}'], 'gabarito': ['10.0']}
                if tipo not in alunos_map[key]['avaliacoes']:
                    alunos_map[key]['avaliacoes'][tipo] = dados
                elif item.get('data_correcao','') > alunos_map[key]['avaliacoes'][tipo].get('data',''):
                    alunos_map[key]['avaliacoes'][tipo] = dados
                continue
            respostas = item.get('respostas', []) or []
            gabarito = item.get('prova_gabarito', []) or item.get('gabarito', []) or []
            tq = item.get('quantidade_questoes', 20)
            if len(respostas) < tq: respostas = list(respostas) + [''] * (tq - len(respostas))
            if len(gabarito) < tq: gabarito = list(gabarito) + [''] * (tq - len(gabarito))
            bncc_l = item.get('prova_bncc', []) or []
            if len(bncc_l) < tq: bncc_l = list(bncc_l) + [''] * (tq - len(bncc_l))
            qs = []; ac = 0; er = 0
            for i in range(tq):
                r = str(respostas[i] if i < len(respostas) else '').strip().upper()
                g = str(gabarito[i] if i < len(gabarito) else '').strip().upper()
                v = r and r not in ('', '—', '-')
                c = v and r == g and g != ''
                cb = bncc_l[i] if i < len(bncc_l) and bncc_l[i] else ''
                if c: ac += 1
                else: er += 1
                qs.append({'numero': i+1, 'resposta': r or '—', 'gabarito': g or '—',
                           'acertou': c, 'respondida': v, 'bncc': cb,
                           'status': '✅ ACERTOU' if c else ('❌ ERROU' if v else '— NÃO RESPONDEU')})
            dados = {'nota': float(item.get('nota', 0)), 'acertos': ac, 'erros': er, 'total': tq,
                     'prova': pt, 'data': item.get('data_correcao',''), 'disciplina': disc,
                     'questoes_status': qs, 'bncc': [q['bncc'] for q in qs],
                     'respostas': [q['resposta'] for q in qs], 'gabarito': [q['gabarito'] for q in qs]}
            if tipo not in alunos_map[key]['avaliacoes']:
                alunos_map[key]['avaliacoes'][tipo] = dados
            elif item.get('data_correcao','') > alunos_map[key]['avaliacoes'][tipo].get('data',''):
                alunos_map[key]['avaliacoes'][tipo] = dados
        resultado = []
        for _, d in alunos_map.items():
            av = d['avaliacoes']
            default = {'nota': 0, 'acertos': 0, 'erros': 0, 'total': 0, 'questoes_status': [], 'bncc': [], 'respostas': [], 'gabarito': [], 'sem_avaliacao': True}
            port = dict(av.get('Portugues', default))
            mat = dict(av.get('Matematica', default))
            prod = dict(av.get('Producao', default))
            ch = dict(av.get('CH', default))
            cn = dict(av.get('CN', default))
            notas = [port.get('nota',0), mat.get('nota',0), prod.get('nota',0), ch.get('nota',0), cn.get('nota',0)]
            soma = sum(notas); media = soma / 5 if notas else 0
            resultado.append({'aluno_id': d['aluno_id'], 'aluno_nome': d['aluno_nome'],
                              'serie': d['serie'], 'turma': d['turma'], 'escola': d['escola'],
                              'portugues': port, 'matematica': mat, 'producao': prod,
                              'ch': ch, 'cn': cn, 'soma': round(soma, 1), 'media': round(media, 1)})
        return jsonify(resultado)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@historico_bp.route('/<int:id>', methods=['DELETE'])
def excluir_correcao(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT h.id, a.escola_id FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id WHERE h.id = %s""", (id,))
        row = cur.fetchone()
        if not row: return jsonify({'erro': 'Correção não encontrada'}), 404
        if escola_sessao is not None and row.get('escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': 'Correção excluída', 'id': id})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass