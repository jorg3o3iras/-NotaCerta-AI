import json
import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection

provas_bp = Blueprint('provas', __name__, url_prefix='/api/provas')


def _parse_textos(item):
    if item.get('textos_questoes'):
        try:
            novos = []
            for t in item['textos_questoes']:
                if t and isinstance(t, str) and t.strip().startswith('{'):
                    try: novos.append(json.loads(t))
                    except: novos.append(t)
                else: novos.append(t)
            item['textos_questoes'] = novos
        except Exception as e:
            logging.warning(f"textos_questoes: {e}")
    return item


@provas_bp.route('', methods=['GET'])
def listar_provas():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT p.id, p.escola_id, p.titulo, p.serie, p.disciplina,
            p.bimestre, p.data_prova, p.valor_nota, p.tipo_questoes,
            p.quantidade_questoes, p.gabarito, p.bncc, p.textos_questoes,
            p.niveis, p.created_at, e.nome as escola_nome
            FROM provas p LEFT JOIN escolas e ON p.escola_id = e.id"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try: params.append(int(escola_id)); query += " WHERE p.escola_id = %s"
            except (ValueError, TypeError): pass
        query += " ORDER BY p.created_at DESC"
        cur.execute(query, params)
        provas = cur.fetchall(); cur.close()
        return jsonify([_parse_textos(dict(p)) for p in provas])
    except Exception as e:
        logging.error(f"❌ listar_provas: {e}"); traceback.print_exc()
        return jsonify([])
    finally:
        if conn:
            try: conn.close()
            except: pass


@provas_bp.route('', methods=['POST'])
def criar_prova():
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        titulo = data.get('titulo'); serie = data.get('serie')
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not titulo: return jsonify({'erro': 'Título é obrigatório'}), 400
        if not serie: return jsonify({'erro': 'Série é obrigatória'}), 400
        if not escola_id: return jsonify({'erro': 'Escola é obrigatória'}), 400
        try: escola_id = int(escola_id)
        except: return jsonify({'erro': 'Escola inválida'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (escola_id,))
        if not cur.fetchone(): return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM provas WHERE titulo=%s AND serie=%s AND escola_id=%s",
                    (titulo, serie, escola_id))
        if cur.fetchone(): return jsonify({'erro': 'Já existe prova com este título nesta escola'}), 400

        # ── Fix defensivo: None-safe ──────────────────────────
        bncc_v = [str(b).strip() for b in (data.get('bncc') or []) if b and str(b).strip()]
        textos_v = [str(t).strip() for t in (data.get('textos_questoes') or []) if t]
        niveis_v = [str(n).strip() for n in (data.get('niveis') or []) if n]

        cur.execute("""INSERT INTO provas (escola_id, titulo, serie, disciplina,
            bimestre, data_prova, valor_nota, tipo_questoes, quantidade_questoes,
            gabarito, bncc, textos_questoes, niveis)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (escola_id, titulo, serie, data.get('disciplina',''),
             data.get('bimestre',''), data.get('data_prova'),
             data.get('nota_maxima',10), data.get('tipo_questoes','4'),
             data.get('quantidade_questoes',20), data.get('gabarito',[]),
             bncc_v, textos_v, niveis_v))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': f'Prova "{titulo}" criada!', 'serie': serie})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@provas_bp.route('/<int:id>', methods=['GET'])
def buscar_prova(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT p.id, p.escola_id, p.titulo, p.serie, p.disciplina,
            p.bimestre, p.data_prova, p.valor_nota, p.tipo_questoes,
            p.quantidade_questoes, p.gabarito, p.bncc, p.textos_questoes,
            p.niveis, p.created_at, e.nome as escola_nome
            FROM provas p LEFT JOIN escolas e ON p.escola_id = e.id WHERE p.id = %s""", (id,))
        prova = cur.fetchone(); cur.close()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and prova.get('escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        return jsonify(_parse_textos(dict(prova)))
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@provas_bp.route('/<int:id>', methods=['PUT'])
def editar_prova(id):
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        titulo = data.get('titulo'); serie = data.get('serie')
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not titulo: return jsonify({'erro': 'Título é obrigatório'}), 400
        if not serie: return jsonify({'erro': 'Série é obrigatória'}), 400
        if not escola_id: return jsonify({'erro': 'Escola é obrigatória'}), 400
        try: escola_id = int(escola_id)
        except: return jsonify({'erro': 'Escola inválida'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM provas WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex: return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and ex['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403

        # ── Fix defensivo: None-safe ──────────────────────────
        bncc_v = [str(b).strip() for b in (data.get('bncc') or []) if b and str(b).strip()]
        textos_v = [str(t).strip() for t in (data.get('textos_questoes') or []) if t]
        niveis_v = [str(n).strip() for n in (data.get('niveis') or []) if n]

        cur.execute("""UPDATE provas SET escola_id=%s, titulo=%s, serie=%s,
            disciplina=%s, bimestre=%s, data_prova=%s, valor_nota=%s,
            tipo_questoes=%s, quantidade_questoes=%s, gabarito=%s, bncc=%s,
            textos_questoes=%s, niveis=%s WHERE id=%s RETURNING id""",
            (escola_id, titulo, serie, data.get('disciplina',''),
             data.get('bimestre',''), data.get('data_prova'),
             data.get('nota_maxima',10), data.get('tipo_questoes','4'),
             data.get('quantidade_questoes',20), data.get('gabarito',[]),
             bncc_v, textos_v, niveis_v, id))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Prova atualizada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@provas_bp.route('/<int:id>', methods=['DELETE'])
def excluir_prova(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor()
        cur.execute("SELECT id, titulo, escola_id FROM provas WHERE id = %s", (id,))
        prova = cur.fetchone()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and prova[2] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM correcoes_texto WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM cartoes_template WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM provas WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Prova "{prova[1]}" excluída!'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass
