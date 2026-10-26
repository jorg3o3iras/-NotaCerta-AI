# ============================================================
# CORREÇÃO MANUAL — rota /api/corrigir_manual
# ✨ PORTADO do adabee-sistema:
#    - Detecta 'MULTIPLA' vindo do front e trata como ERRO (não acerto)
#    - status/status_texto explícitos para MULTIPLA
#    - NÃO altera mais nada (mesma assinatura, mesmo JSON de retorno)
# ============================================================

import json
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection
from backend.services.concepts import calcular_conceito, identificar_disciplina

correcao_manual_bp = Blueprint('correcao_manual', __name__, url_prefix='/api')


@correcao_manual_bp.route('/corrigir_manual', methods=['POST'])
def corrigir_manual():
    conn = None
    try:
        data = request.json or {}
        prova_id = data.get('prova_id'); aluno_id = data.get('aluno_id')
        respostas = data.get('respostas') or []
        acertos = data.get('acertos', 0) or 0
        nota = data.get('nota', 0) or 0
        total = data.get('total', 0) or 0
        if not prova_id or not aluno_id:
            return jsonify({'erro': 'Prova e aluno obrigatórios'}), 400
        if total <= 0:
            return jsonify({'erro': 'Total de questões inválido'}), 400
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT a.escola_id FROM alunos a WHERE a.id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado a este aluno'}), 403
        cur.execute("SELECT disciplina, titulo, serie, gabarito, bncc FROM provas WHERE id=%s", (prova_id,))
        prova = cur.fetchone()
        disciplina = prova['disciplina'] if prova else ''
        if (disciplina or '').strip() == 'Produção de Texto':
            return jsonify({'erro': 'Use SALVAR NOTA', 'tipo': 'producao'}), 400
        prova_titulo = prova['titulo'] if prova else ''
        serie_prova = prova['serie'] if prova else ''
        gabarito = (prova['gabarito'] if prova else []) or []
        bncc_gab = (prova['bncc'] if prova else []) or []
        cur.execute("SELECT t.serie FROM alunos a LEFT JOIN turmas t ON a.turma_id=t.id WHERE a.id=%s", (aluno_id,))
        s = cur.fetchone()
        serie = s['serie'] if s else serie_prova or '1º Ano'
        tipo_av = identificar_disciplina(prova_titulo, disciplina, serie)

        # ── Monta questoes_status (MULTIPLA = erro marcado) ────
        qs = []
        for i in range(total):
            r = str(respostas[i]) if i < len(respostas) and respostas[i] is not None else ''
            g = str(gabarito[i]) if i < len(gabarito) and gabarito[i] is not None else ''
            cod = bncc_gab[i] if i < len(bncc_gab) and bncc_gab[i] else ''

            is_multipla = (r.upper() == 'MULTIPLA')
            c = bool(r and g and not is_multipla and r.upper() == g.upper())

            if c:
                msg = 'ADQUIRIU HABILIDADE'
                st = f'✅ ACERTOU: {msg}'
            elif is_multipla:
                msg = 'MÚLTIPLA MARCAÇÃO'
                st = '⚠️ MÚLTIPLA MARCAÇÃO: mais de uma bolha preenchida'
            elif r:
                msg = 'RECOMPOSIÇÃO DE APRENDIZAGEM'
                st = f'❌ ERROU: {msg}'
            else:
                msg = 'NÃO RESPONDEU'
                st = '— NÃO RESPONDEU'

            qs.append({
                'numero': i + 1,
                'resposta': r or '—',
                'gabarito': g or '—',
                'acertou': c,
                'respondida': bool(r),
                'multipla': is_multipla,
                'status': msg,
                'status_texto': st,
                'bncc': cod,
            })

        qs_json = json.dumps(qs)
        cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s", (prova_id, aluno_id))
        existe = cur.fetchone()
        if existe:
            cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s, nota=%s,
                total=%s, tipo_correcao='manual', disciplina=%s, tipo_avaliacao=%s,
                questoes_status=%s::jsonb, data_correcao=CURRENT_TIMESTAMP
                WHERE prova_id=%s AND aluno_id=%s""",
                (respostas, acertos, nota, total, disciplina, tipo_av, qs_json, prova_id, aluno_id))
            rid = existe['id']
        else:
            cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas, acertos,
                nota, total, tipo_correcao, disciplina, tipo_avaliacao, questoes_status)
                VALUES (%s,%s,%s::text[],%s,%s,%s,'manual',%s,%s,%s::jsonb) RETURNING id""",
                (prova_id, aluno_id, respostas, acertos, nota, total, disciplina, tipo_av, qs_json))
            rid = cur.fetchone()['id']
        conn.commit(); cur.close()
        pct = round((acertos / total) * 100) if total > 0 else 0
        return jsonify({'sucesso': True, 'id': rid, 'mensagem': 'Correção manual salva',
                        'conceito': calcular_conceito(pct), 'porcentagem': pct,
                        'tipo_avaliacao': tipo_av, 'questoes_status': qs, 'bncc': bncc_gab})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass
