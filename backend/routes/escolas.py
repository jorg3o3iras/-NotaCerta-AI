import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import _bloqueia_nao_admin, get_escola_id
from backend.db import get_db_connection

escolas_bp = Blueprint('escolas', __name__, url_prefix='/api/escolas')


@escolas_bp.route('', methods=['GET'])
def listar_escolas():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if escola_sessao is not None:
            cur.execute("""SELECT e.*,
                (SELECT COUNT(*) FROM turmas t WHERE t.escola_id = e.id) as total_turmas,
                (SELECT COUNT(*) FROM alunos a WHERE a.escola_id = e.id) as total_alunos
                FROM escolas e WHERE e.id = %s ORDER BY e.nome""", (escola_sessao,))
        else:
            cur.execute("""SELECT e.*,
                (SELECT COUNT(*) FROM turmas t WHERE t.escola_id = e.id) as total_turmas,
                (SELECT COUNT(*) FROM alunos a WHERE a.escola_id = e.id) as total_alunos
                FROM escolas e ORDER BY e.nome""")
        escolas = cur.fetchall(); cur.close()
        return jsonify([dict(e) for e in escolas])
    except Exception as e:
        logging.error(f"❌ listar_escolas: {e}"); traceback.print_exc()
        return jsonify([])
    finally:
        if conn:
            try: conn.close()
            except: pass


@escolas_bp.route('', methods=['POST'])
def criar_escola():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        nome = data.get('nome')
        if not nome: return jsonify({'erro': 'Nome é obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível. Tente novamente em alguns segundos.'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""INSERT INTO escolas (nome, inep, municipio, estado, telefone, diretor)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            (nome, data.get('inep',''), data.get('municipio',''),
             data.get('estado','PA'), data.get('telefone',''), data.get('diretor','')))
        result = cur.fetchone()
        conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': 'Escola criada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@escolas_bp.route('/<int:id>', methods=['GET'])
def buscar_escola(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    if escola_sessao is not None and escola_sessao != id:
        return jsonify({'erro': 'Acesso negado a esta escola'}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM escolas WHERE id = %s", (id,))
        escola = cur.fetchone(); cur.close()
        if not escola: return jsonify({'erro': 'Escola não encontrada'}), 404
        return jsonify(dict(escola))
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@escolas_bp.route('/<int:id>', methods=['PUT'])
def editar_escola(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        nome = data.get('nome')
        if not nome: return jsonify({'erro': 'Nome é obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (id,))
        if not cur.fetchone(): return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("""UPDATE escolas SET nome=%s, inep=%s, municipio=%s,
            estado=%s, telefone=%s, diretor=%s WHERE id=%s RETURNING id""",
            (nome, data.get('inep',''), data.get('municipio',''),
             data.get('estado','PA'), data.get('telefone',''), data.get('diretor',''), id))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Escola atualizada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@escolas_bp.route('/<int:id>', methods=['DELETE'])
def excluir_escola(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor()
        cur.execute("SELECT id, nome FROM escolas WHERE id = %s", (id,))
        escola = cur.fetchone()
        if not escola: return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT COUNT(*) FROM turmas WHERE escola_id = %s", (id,))
        tt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM alunos WHERE escola_id = %s", (id,))
        ta = cur.fetchone()[0]
        cur.execute("DELETE FROM escolas WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Escola "{escola[1]}" excluída!',
                        'detalhes': {'turmas_excluidas': tt, 'alunos_excluidos': ta}})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass