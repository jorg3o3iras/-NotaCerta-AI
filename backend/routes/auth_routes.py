import hmac
import logging

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.config import USUARIOS_FIXOS
from backend.db import get_db_connection

auth_bp = Blueprint('auth', __name__, url_prefix='/api')


@auth_bp.route('/login', methods=['POST'])
def login():
    conn = None
    try:
        data = request.json or {}
        username = data.get('username') or data.get('usuario')
        senha = data.get('senha')
        if not username or not senha:
            return jsonify({'erro': 'Usuário e senha são obrigatórios'}), 400
        logging.info(f"🔑 Tentativa de login: {username}")
        try:
            conn = get_db_connection()
            if conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""SELECT u.id, u.nome, u.username, u.senha_hash, u.perfil,
                    u.ativo, u.escola_id, e.nome AS escola_nome
                    FROM usuarios u LEFT JOIN escolas e ON e.id = u.escola_id
                    WHERE u.username = %s""", (username,))
                usuario = cur.fetchone(); cur.close()
                if usuario and hmac.compare_digest(str(usuario['senha_hash'] or ''), str(senha)) and usuario['ativo']:
                    return jsonify({'sucesso': True, 'id': usuario['id'], 'perfil': usuario['perfil'],
                                    'usuario': usuario['username'], 'username': usuario['username'],
                                    'nome': usuario['nome'], 'escola_id': usuario.get('escola_id'),
                                    'escola_nome': usuario.get('escola_nome')})
        except Exception as e:
            logging.error(f"❌ Erro login DB: {e}")
        if username in USUARIOS_FIXOS:
            d = USUARIOS_FIXOS[username]
            if hmac.compare_digest(str(d['senha']), str(senha)):
                return jsonify({'sucesso': True, 'id': 0, 'perfil': d['perfil'],
                                'usuario': username, 'username': username, 'nome': d['nome'],
                                'escola_id': d.get('escola_id'), 'escola_nome': None})
        return jsonify({'sucesso': False, 'erro': 'Usuário ou senha incorretos!'}), 401
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@auth_bp.route('/verificar-senha-admin', methods=['POST'])
def verificar_senha_admin():
    conn = None
    try:
        data = request.get_json() or {}
        senha = data.get('senha', '').strip()
        username = data.get('username', '').strip()
        if not senha:
            return jsonify({'ok': False, 'erro': 'Senha obrigatória'}), 400
        try:
            conn = get_db_connection()
            if conn:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                if username:
                    cur.execute("SELECT id, username, nome, senha_hash, perfil, ativo FROM usuarios WHERE username = %s", (username,))
                    u = cur.fetchone()
                    if (u and u.get('ativo') and u.get('perfil') == 'admin'
                            and hmac.compare_digest(str(u['senha_hash'] or ''), str(senha))):
                        cur.close()
                        return jsonify({'ok': True, 'usuario': {'id': u['id'], 'username': u['username'], 'nome': u['nome'], 'perfil': u['perfil']}}), 200
                cur.execute("SELECT id, username, nome, senha_hash, perfil FROM usuarios WHERE perfil='admin' AND ativo=TRUE")
                for a in (cur.fetchall() or []):
                    if hmac.compare_digest(str(a['senha_hash'] or ''), str(senha)):
                        cur.close()
                        return jsonify({'ok': True, 'usuario': {'id': a['id'], 'username': a['username'], 'nome': a['nome'], 'perfil': a['perfil']}}), 200
                cur.close()
        except Exception as e:
            logging.warning(f"Senha admin erro DB: {e}")
        if 'admin' in USUARIOS_FIXOS:
            fixo = USUARIOS_FIXOS['admin']
            if hmac.compare_digest(str(fixo['senha']), str(senha)):
                return jsonify({'ok': True, 'usuario': {'id': 0, 'username': 'admin', 'nome': fixo.get('nome', 'Administrador'), 'perfil': 'admin'}}), 200
        return jsonify({'ok': False, 'erro': 'Senha incorreta'}), 401
    except Exception as e:
        return jsonify({'ok': False, 'erro': 'Erro interno'}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass