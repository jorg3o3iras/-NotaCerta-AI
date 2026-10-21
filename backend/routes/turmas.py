import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection

turmas_bp = Blueprint('turmas', __name__, url_prefix='/api/turmas')


@turmas_bp.route('', methods=['GET'])
def listar_turmas():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT t.id, t.nome, t.serie, t.turno, t.professor,
                t.capacidade, t.ano_letivo, t.escola_id, e.nome as escola_nome,
                COUNT(a.id)::int as total_alunos
            FROM turmas t LEFT JOIN escolas e ON t.escola_id = e.id
            LEFT JOIN alunos a ON a.turma_id = t.id"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try:
                params.append(int(escola_id)); query += " WHERE t.escola_id = %s"
            except (ValueError, TypeError): pass
        query += " GROUP BY t.id, e.nome ORDER BY t.nome"
        cur.execute(query, params)
        turmas = cur.fetchall(); cur.close()
        return jsonify([dict(t) for t in turmas])
    except Exception as e:
        logging.error(f"❌ listar_turmas: {e}"); traceback.print_exc()
        return jsonify([])
    finally:
        if conn:
            try: conn.close()
            except: pass


@turmas_bp.route('', methods=['POST'])
def criar_turma():
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        if not data.get('nome') or not data.get('escola_id'):
            return jsonify({'erro': 'Nome e escola são obrigatórios'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""INSERT INTO turmas (escola_id, nome, serie, turno, professor, capacidade, ano_letivo)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (data['escola_id'], data['nome'], data.get('serie','1º Ano'),
             data.get('turno','Manhã'), data.get('professor',''),
             data.get('capacidade',35), data.get('ano_letivo',2025)))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': 'Turma criada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@turmas_bp.route('/<int:id>', methods=['GET'])
def buscar_turma(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT t.id, t.nome, t.serie, t.turno, t.professor,
            t.capacidade, t.ano_letivo, t.escola_id, e.nome as escola_nome
            FROM turmas t LEFT JOIN escolas e ON t.escola_id = e.id WHERE t.id = %s""", (id,))
        turma = cur.fetchone(); cur.close()
        if not turma: return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        return jsonify(dict(turma))
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@turmas_bp.route('/<int:id>', methods=['PUT'])
def editar_turma(id):
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        if not data.get('nome') or not data.get('escola_id'):
            return jsonify({'erro': 'Nome e escola são obrigatórios'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM turmas WHERE id = %s", (id,))
        turma = cur.fetchone()
        if not turma: return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""UPDATE turmas SET escola_id=%s, nome=%s, serie=%s,
            turno=%s, professor=%s, capacidade=%s, ano_letivo=%s
            WHERE id=%s RETURNING id""",
            (data['escola_id'], data['nome'], data.get('serie','1º Ano'),
             data.get('turno','Manhã'), data.get('professor',''),
             data.get('capacidade',35), data.get('ano_letivo',2025), id))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Turma atualizada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@turmas_bp.route('/<int:id>', methods=['DELETE'])
def excluir_turma(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor()
        cur.execute("SELECT id, nome, escola_id FROM turmas WHERE id = %s", (id,))
        turma = cur.fetchone()
        if not turma: return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma[2] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT COUNT(*) FROM alunos WHERE turma_id = %s", (id,))
        ta = cur.fetchone()[0]
        cur.execute("DELETE FROM turmas WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Turma "{turma[1]}" excluída!',
                        'detalhes': {'alunos_excluidos': ta}})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass