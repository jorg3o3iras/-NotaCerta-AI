from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor
from datetime import datetime

from backend.auth import _bloqueia_nao_admin
from backend.config import USUARIOS_FIXOS
from backend.db import get_db_connection

usuarios_bp = Blueprint('usuarios', __name__, url_prefix='/api/usuarios')


@usuarios_bp.route('', methods=['GET'])
def listar_usuarios():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        conn = get_db_connection()
        if conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""SELECT u.id, u.escola_id, u.nome, u.username,
                u.email, u.perfil, u.ativo, u.criado_em, e.nome as escola_nome
                FROM usuarios u LEFT JOIN escolas e ON u.escola_id = e.id ORDER BY u.id""")
            usuarios = cur.fetchall(); cur.close()
            return jsonify([dict(u) for u in usuarios])
    except Exception:
        pass
    finally:
        if conn:
            try: conn.close()
            except: pass
    resultado = []
    for username, dados in USUARIOS_FIXOS.items():
        resultado.append({'id': 0, 'nome': dados['nome'], 'username': username,
                          'email': '', 'perfil': dados['perfil'], 'ativo': True,
                          'escola_id': None, 'escola_nome': '',
                          'criado_em': datetime.now().isoformat()})
    return jsonify(resultado)


@usuarios_bp.route('', methods=['POST'])
def criar_usuario():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        nome = data.get('nome'); username = data.get('username'); senha = data.get('senha')
        email = data.get('email', ''); perfil = data.get('perfil', 'usuario')
        ativo = data.get('ativo', True)
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not nome or not username or not senha:
            return jsonify({'erro': 'Nome, usuário e senha obrigatórios'}), 400
        if len(senha) < 4:
            return jsonify({'erro': 'Senha deve ter 4+ caracteres'}), 400
        if perfil == 'usuario' and not escola_id:
            return jsonify({'erro': 'Escola obrigatória para perfil usuário'}), 400
        if escola_id:
            try: escola_id = int(escola_id)
            except: return jsonify({'erro': 'Escola inválida'}), 400
        else: escola_id = None
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM usuarios WHERE username = %s", (username,))
        if cur.fetchone(): return jsonify({'erro': 'Usuário já existe'}), 400
        cur.execute("""INSERT INTO usuarios (escola_id, nome, username, senha_hash,
            email, perfil, ativo) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (escola_id, nome, username, senha, email, perfil, ativo))
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'id': result['id'], 'mensagem': 'Usuário criado'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@usuarios_bp.route('/<int:id>', methods=['GET'])
def buscar_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT u.id, u.escola_id, u.nome, u.username, u.email,
            u.perfil, u.ativo, u.criado_em, e.nome as escola_nome
            FROM usuarios u LEFT JOIN escolas e ON u.escola_id = e.id WHERE u.id = %s""", (id,))
        usuario = cur.fetchone(); cur.close()
        if not usuario: return jsonify({'erro': 'Usuário não encontrado'}), 404
        return jsonify(dict(usuario))
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@usuarios_bp.route('/<int:id>', methods=['PUT'])
def atualizar_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        nome = data.get('nome'); username = data.get('username'); senha = data.get('senha')
        email = data.get('email', ''); perfil = data.get('perfil', 'usuario')
        ativo = data.get('ativo', True)
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not nome or not username:
            return jsonify({'erro': 'Nome e usuário obrigatórios'}), 400
        if perfil == 'usuario' and not escola_id:
            return jsonify({'erro': 'Escola obrigatória'}), 400
        if escola_id:
            try: escola_id = int(escola_id)
            except: return jsonify({'erro': 'Escola inválida'}), 400
        else: escola_id = None
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM usuarios WHERE id = %s", (id,))
        if not cur.fetchone(): return jsonify({'erro': 'Usuário não encontrado'}), 404
        cur.execute("SELECT id FROM usuarios WHERE username = %s AND id != %s", (username, id))
        if cur.fetchone(): return jsonify({'erro': 'Nome de usuário em uso'}), 400
        fields = ["escola_id=%s", "nome=%s", "username=%s", "email=%s", "perfil=%s", "ativo=%s"]
        params = [escola_id, nome, username, email, perfil, ativo]
        if senha and len(senha) >= 4:
            fields.append("senha_hash=%s"); params.append(senha)
        params.append(id)
        cur.execute(f"UPDATE usuarios SET {', '.join(fields)} WHERE id=%s RETURNING id", params)
        result = cur.fetchone(); conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Usuário atualizado'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@usuarios_bp.route('/<int:id>', methods=['DELETE'])
def excluir_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT username FROM usuarios WHERE id = %s", (id,))
        usuario = cur.fetchone()
        if not usuario: return jsonify({'erro': 'Usuário não encontrado'}), 404
        if usuario['username'] == 'admin':
            return jsonify({'erro': 'Não pode excluir admin principal'}), 400
        cur.execute("DELETE FROM usuarios WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Usuário "{usuario["username"]}" excluído'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass