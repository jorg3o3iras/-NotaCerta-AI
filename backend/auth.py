# ============================================================
# AUTH — contexto do usuário, escopo de escola, guards
# ============================================================

import logging

from flask import g, has_request_context, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.config import USUARIOS_FIXOS
from backend.db import get_db_connection


def get_usuario_atual():
    """
    Resolve o usuário a partir do header X-Usuario-Username.
    Cache em g._usuario_atual durante a requisição.
    Fallback para USUARIOS_FIXOS se não encontrar no banco.
    """
    if not has_request_context():
        return None
    if hasattr(g, '_usuario_atual'):
        return g._usuario_atual

    username = (request.headers.get('X-Usuario-Username') or '').strip()
    if not username:
        g._usuario_atual = None
        return None

    conn = None
    try:
        conn = get_db_connection()
        if conn:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT u.id, u.nome, u.username, u.perfil, u.ativo,
                       u.escola_id, e.nome AS escola_nome
                FROM usuarios u
                LEFT JOIN escolas e ON e.id = u.escola_id
                WHERE u.username = %s
            """, (username,))
            row = cur.fetchone()
            cur.close()
            if row:
                d = dict(row)
                d['ativo'] = bool(d.get('ativo'))
                g._usuario_atual = d
                return d
    except Exception as e:
        logging.warning("get_usuario_atual erro: %s", e)
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

    if username in USUARIOS_FIXOS:
        d = USUARIOS_FIXOS[username]
        g._usuario_atual = {
            'id': 0, 'nome': d['nome'], 'username': username,
            'perfil': d['perfil'], 'ativo': True,
            'escola_id': d.get('escola_id'), 'escola_nome': None,
        }
        return g._usuario_atual

    g._usuario_atual = None
    return None


def get_escola_id():
    """
    Retorna o escola_id de escopo do usuário:
      - None  → admin (sem escopo) OU usuário sem escola vinculada
      - int   → usuário de escola → só vê essa escola
    Levanta PermissionError se usuário inativo.
    """
    u = get_usuario_atual()
    if not u:
        return None
    if not u.get('ativo', True):
        raise PermissionError('Usuário inativo')
    if u.get('perfil') == 'admin':
        return None
    eid = u.get('escola_id')
    if not eid:
        logging.warning(
            f"⚠️ Usuário '{u.get('username')}' sem escola vinculada — escopo desativado"
        )
        return None
    return int(eid)


def is_admin():
    u = get_usuario_atual()
    return bool(u and u.get('perfil') == 'admin')


def _bloqueia_nao_admin():
    """
    Guard para rotas admin-only.
    Retorna (json, 403) se NÃO for admin, ou None se admin.
    """
    u = get_usuario_atual()
    if u and u.get('perfil') != 'admin':
        return jsonify({'erro': 'Apenas administradores podem executar esta ação'}), 403
    return None