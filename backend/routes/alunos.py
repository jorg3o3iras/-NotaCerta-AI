import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection

alunos_bp = Blueprint('alunos', __name__, url_prefix='/api/alunos')


@alunos_bp.route('', methods=['GET'])
def listar_alunos():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    turma_id = request.args.get('turma_id')
    serie = request.args.get('serie')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT a.id, a.nome, a.matricula, a.numero_chamada,
            a.data_nascimento, a.genero, a.responsavel, a.telefone,
            a.email, a.observacoes, a.turma_id, a.escola_id,
            t.nome as turma_nome, t.serie as turma_serie, t.turno as turma_turno,
            e.nome as escola_nome
            FROM alunos a
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try: params.append(int(escola_id)); query += " AND a.escola_id = %s"
            except (ValueError, TypeError): pass
        if turma_id and str(turma_id) not in ('', 'null', 'undefined'):
            try: params.append(int(turma_id)); query += " AND a.turma_id = %s"
            except (ValueError, TypeError): pass
        if serie and str(serie) not in ('', 'null', 'undefined'):
            params.append(serie); query += " AND t.serie = %s"
        query += " ORDER BY a.numero_chamada NULLS LAST, a.nome"
        cur.execute(query, params)
        alunos = cur.fetchall(); cur.close()
        return jsonify([dict(a) for a in alunos])
    except Exception as e:
        logging.error(f"❌ listar_alunos: {e}"); traceback.print_exc()
        return jsonify([])
    finally:
        if conn:
            try: conn.close()
            except: pass


@alunos_bp.route('', methods=['POST'])
def criar_aluno():
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        if not data.get('nome'): return jsonify({'erro': 'Nome é obrigatório'}), 400
        if not data.get('escola_id'): return jsonify({'erro': 'Escola é obrigatória'}), 400
        if not data.get('turma_id'): return jsonify({'erro': 'Turma é obrigatória'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (data['escola_id'],))
        if not cur.fetchone(): return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM turmas WHERE id = %s", (data['turma_id'],))
        if not cur.fetchone(): return jsonify({'erro': 'Turma não encontrada'}), 404
        numero = data.get('numero_chamada')
        if numero is None or numero == '': numero = None
        else:
            try: numero = int(numero); numero = numero if numero > 0 else None
            except: numero = None
        matricula = (data.get('matricula') or '').strip() or None
        cur.execute("""INSERT INTO alunos (escola_id, turma_id, nome, matricula, numero_chamada)
            VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (data['escola_id'], data['turma_id'], data['nome'].strip(), matricula, numero))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': 'Aluno criado'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@alunos_bp.route('/<int:id>', methods=['GET'])
def buscar_aluno(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT a.*, t.nome as turma_nome, t.serie as turma_serie,
            e.nome as escola_nome, e.id as escola_id
            FROM alunos a LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id WHERE a.id = %s""", (id,))
        aluno = cur.fetchone(); cur.close()
        if not aluno: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and aluno.get('escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        return jsonify(dict(aluno))
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@alunos_bp.route('/<int:id>', methods=['PUT'])
def editar_aluno(id):
    conn = None
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None: data['escola_id'] = escola_sessao
        if not data.get('nome'): return jsonify({'erro': 'Nome é obrigatório'}), 400
        if not data.get('escola_id'): return jsonify({'erro': 'Escola é obrigatória'}), 400
        if not data.get('turma_id'): return jsonify({'erro': 'Turma é obrigatória'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM alunos WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and ex['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT id FROM escolas WHERE id = %s", (data['escola_id'],))
        if not cur.fetchone(): return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM turmas WHERE id = %s", (data['turma_id'],))
        if not cur.fetchone(): return jsonify({'erro': 'Turma não encontrada'}), 404
        numero = data.get('numero_chamada')
        if numero is None or numero == '': numero = None
        else:
            try: numero = int(numero); numero = numero if numero > 0 else None
            except: numero = None
        matricula = (data.get('matricula') or '').strip() or None
        cur.execute("""UPDATE alunos SET escola_id=%s, turma_id=%s, nome=%s,
            matricula=%s, numero_chamada=%s WHERE id=%s RETURNING id""",
            (data['escola_id'], data['turma_id'], data['nome'].strip(), matricula, numero, id))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Aluno atualizado'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@alunos_bp.route('/<int:id>', methods=['DELETE'])
def excluir_aluno(id):
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor()
        cur.execute("SELECT id, nome, escola_id FROM alunos WHERE id = %s", (id,))
        aluno = cur.fetchone()
        if not aluno: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and aluno[2] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM correcoes_texto WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM cartoes_template WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM alunos WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Aluno "{aluno[1]}" excluído!'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass