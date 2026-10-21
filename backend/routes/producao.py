import json
import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection
from backend.services.concepts import calcular_conceito

producao_bp = Blueprint('producao', __name__, url_prefix='/api')


@producao_bp.route('/salvar_nota_producao', methods=['POST'])
def salvar_nota_producao():
    conn = None
    try:
        data = request.json or {}
        aluno_id = data.get('aluno_id'); prova_id = data.get('prova_id')
        nota = data.get('nota')
        observacao = (data.get('observacao') or '').strip()
        qs_recv = data.get('questoes_status', [])
        if not aluno_id: return jsonify({'erro': 'Aluno obrigatório'}), 400
        if not prova_id: return jsonify({'erro': 'Prova obrigatória'}), 400
        if nota is None or nota == '': return jsonify({'erro': 'Nota obrigatória'}), 400
        try: nota_f = float(nota)
        except: return jsonify({'erro': 'Nota inválida'}), 400
        if nota_f < 0 or nota_f > 10: return jsonify({'erro': 'Nota 0-10'}), 400
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id FROM alunos WHERE id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT p.disciplina, p.titulo, p.serie AS prova_serie FROM provas p WHERE p.id = %s", (prova_id,))
        prova = cur.fetchone()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        cur.execute("""SELECT a.nome, t.serie AS turma_serie FROM alunos a
            LEFT JOIN turmas t ON a.turma_id=t.id WHERE a.id = %s""", (aluno_id,))
        aluno = cur.fetchone()
        if not aluno: return jsonify({'erro': 'Aluno não encontrado'}), 404
        disciplina = prova['disciplina'] or 'Produção de Texto'
        tipo_av = 'Producao'
        acertos_eq = int(round(nota_f)); total_eq = 10
        if qs_recv and isinstance(qs_recv, list) and len(qs_recv) > 0:
            qs = qs_recv
            for q in qs:
                if isinstance(q, dict): q['nota_manual'] = nota_f
        else:
            qs = [{'numero': 1, 'resposta': f'{nota_f:.1f}', 'gabarito': '10.0',
                   'acertou': nota_f >= 6, 'respondida': True, 'bncc': '',
                   'status': f'📝 Nota Manual {nota_f:.1f}',
                   'status_texto': f'📝 Nota {nota_f:.1f}', 'confianca': 100, 'correta': nota_f >= 6}]
        if observacao and qs:
            qs[0]['status_texto'] = qs[0].get('status_texto','') + f' — {observacao[:200]}'
        respostas = [f'{nota_f:.1f}']
        qs_json = json.dumps(qs, ensure_ascii=False, default=str)
        cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s", (prova_id, aluno_id))
        existe = cur.fetchone()
        if existe:
            cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s, nota=%s,
                total=%s, tipo_correcao='manual_producao', disciplina=%s, tipo_avaliacao=%s,
                questoes_status=%s::jsonb, confianca=100, confianca_por_questao=%s::jsonb,
                data_correcao=CURRENT_TIMESTAMP WHERE prova_id=%s AND aluno_id=%s""",
                (respostas, acertos_eq, nota_f, total_eq, disciplina, tipo_av,
                 qs_json, json.dumps([100]), prova_id, aluno_id))
            hid = existe['id']
        else:
            cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas, acertos,
                nota, total, tipo_correcao, disciplina, tipo_avaliacao, questoes_status,
                confianca, confianca_por_questao, bncc)
                VALUES (%s,%s,%s::text[],%s,%s,%s,'manual_producao',%s,%s,%s::jsonb,100,%s::jsonb,%s::text[])
                RETURNING id""",
                (prova_id, aluno_id, respostas, acertos_eq, nota_f, total_eq,
                 disciplina, tipo_av, qs_json, json.dumps([100]), []))
            hid = cur.fetchone()['id']
        conn.commit(); cur.close()
        pct = int(round((nota_f / 10) * 100))
        return jsonify({'sucesso': True, 'id': hid, 'mensagem': f'Nota {nota_f:.1f} salva!',
                        'aluno': aluno.get('nome'), 'prova': prova.get('titulo'),
                        'nota': nota_f, 'porcentagem': pct, 'conceito': calcular_conceito(pct),
                        'tipo_avaliacao': tipo_av, 'disciplina': disciplina})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        logging.error(f"❌ salvar_nota: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass