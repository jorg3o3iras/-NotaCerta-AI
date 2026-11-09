import json
import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import _bloqueia_nao_admin
from backend.db import get_db_connection

gabaritos_bp = Blueprint('gabaritos', __name__, url_prefix='/api/gabaritos')


@gabaritos_bp.route('', methods=['POST'])
def salvar_gabarito():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        prova_id = data.get('prova_id')

        # ── None-safe ────────────────────────────────────────
        respostas = data.get('respostas') or []
        bncc = data.get('bncc') or []
        textos_questoes = data.get('textos_questoes') or []
        niveis = data.get('niveis') or []

        if not prova_id: return jsonify({'erro': 'Prova ID é obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, disciplina FROM provas WHERE id = %s", (prova_id,))
        prova = cur.fetchone()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        is_prod = (prova.get('disciplina') or '').strip() == 'Produção de Texto'
        if is_prod:
            resp_s = [item.strip() if isinstance(item, str) else str(item).strip() for item in respostas]
            txt_s = [json.dumps(t, ensure_ascii=False) if isinstance(t, (dict, list)) else str(t).strip() for t in textos_questoes]
            bncc_v = [str(b).strip() for b in bncc if b and str(b).strip()]
            niv_v = [str(n).strip().upper() for n in niveis if n and str(n).strip()]
            cur.execute("""UPDATE provas SET gabarito=%s::text[], quantidade_questoes=%s,
                bncc=%s::text[], textos_questoes=%s::text[], niveis=%s::text[] WHERE id=%s RETURNING id""",
                (resp_s, len(resp_s), bncc_v, txt_s, niv_v, prova_id))
            result = cur.fetchone(); conn.commit(); cur.close()
            return jsonify({'id': result['id'], 'mensagem': 'Gabarito de Produção salvo',
                            'total_questoes': len(resp_s), 'tipo': 'producao'})
        if not respostas or len(respostas) == 0:
            return jsonify({'erro': 'Respostas obrigatórias'}), 400
        resp_v = [str(r).strip().upper() for r in respostas if r]
        if not resp_v: return jsonify({'erro': 'Nenhuma resposta válida'}), 400
        bncc_v = [str(b).strip() for b in bncc if b and str(b).strip()]
        txt_v = [str(t).strip() for t in textos_questoes]
        niv_v = [str(n).strip() for n in niveis]
        cur.execute("""UPDATE provas SET gabarito=%s::text[], quantidade_questoes=%s,
            bncc=%s::text[], textos_questoes=%s::text[], niveis=%s::text[] WHERE id=%s RETURNING id""",
            (resp_v, len(resp_v), bncc_v, txt_v, niv_v, prova_id))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': 'Gabarito salvo', 'total_questoes': len(resp_v)})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        logging.error(f"❌ salvar_gabarito: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@gabaritos_bp.route('/<int:id>', methods=['DELETE'])
def excluir_gabarito(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor()
        cur.execute("SELECT id, titulo FROM provas WHERE id = %s", (id,))
        prova = cur.fetchone()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        cur.execute("""UPDATE provas SET gabarito=NULL, quantidade_questoes=0,
            bncc=NULL, textos_questoes=NULL, niveis=NULL WHERE id=%s""", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Gabarito da prova "{prova[1]}" removido!'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass
