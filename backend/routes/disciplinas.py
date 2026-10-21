import logging
import re

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import _bloqueia_nao_admin, get_escola_id
from backend.db import get_db_connection

disciplinas_bp = Blueprint('disciplinas', __name__, url_prefix='/api/disciplinas')


def _disciplinas_fallback():
    return [
        {'id': 0, 'codigo': 'PORT', 'nome': 'Português',         'cor': '#ef4444', 'icone': '📖', 'ordem': 1, 'escola_id': None, 'ativo': True},
        {'id': 0, 'codigo': 'MAT',  'nome': 'Matemática',        'cor': '#3b82f6', 'icone': '🔢', 'ordem': 2, 'escola_id': None, 'ativo': True},
        {'id': 0, 'codigo': 'PROD', 'nome': 'Produção de Texto', 'cor': '#8b5cf6', 'icone': '✍️', 'ordem': 3, 'escola_id': None, 'ativo': True},
        {'id': 0, 'codigo': 'CH',   'nome': 'Ciências Humanas',  'cor': '#f59e0b', 'icone': '🌍', 'ordem': 4, 'escola_id': None, 'ativo': True},
        {'id': 0, 'codigo': 'CN',   'nome': 'Ciências Naturais', 'cor': '#10b981', 'icone': '🔬', 'ordem': 5, 'escola_id': None, 'ativo': True},
    ]


@disciplinas_bp.route('', methods=['GET'])
def listar_disciplinas():
    try: escola_sessao = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify(_disciplinas_fallback()), 200
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if escola_sessao is not None:
            cur.execute("""SELECT id, codigo, nome, cor, icone, ordem, escola_id, ativo
                FROM disciplinas WHERE ativo = TRUE AND (escola_id IS NULL OR escola_id = %s)
                ORDER BY ordem, nome""", (escola_sessao,))
        else:
            cur.execute("""SELECT id, codigo, nome, cor, icone, ordem, escola_id, ativo
                FROM disciplinas WHERE ativo = TRUE ORDER BY ordem, nome""")
        rows = cur.fetchall(); cur.close()
        if not rows:
            return jsonify(_disciplinas_fallback()), 200
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        logging.error(f"❌ listar_disciplinas: {e}")
        return jsonify(_disciplinas_fallback()), 200
    finally:
        if conn:
            try: conn.close()
            except: pass


@disciplinas_bp.route('', methods=['POST'])
def criar_disciplina():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        nome = (data.get('nome') or '').strip()
        if not nome: return jsonify({'erro': 'Nome é obrigatório'}), 400
        codigo = (data.get('codigo') or '').strip().upper()
        if not codigo:
            codigo = re.sub(r'[^A-Z0-9]', '', nome.upper())[:8] or 'DISC'
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""INSERT INTO disciplinas (escola_id, codigo, nome, cor, icone, ordem)
            VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (escola_id, codigo) DO NOTHING
            RETURNING id, codigo, nome, cor, icone, ordem, escola_id, ativo""",
            (escola_sessao, codigo, nome, data.get('cor', '#3b82f6'),
             data.get('icone', '📚'), int(data.get('ordem', 99))))
        row = cur.fetchone(); conn.commit(); cur.close()
        if not row:
            return jsonify({'erro': f'Já existe disciplina com código "{codigo}" nesta escola'}), 400
        return jsonify(dict(row)), 201
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        logging.error(f"❌ criar_disciplina: {e}")
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@disciplinas_bp.route('/<int:id>', methods=['PUT'])
def editar_disciplina(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        data = request.json or {}
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id FROM disciplinas WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex: return jsonify({'erro': 'Disciplina não encontrada'}), 404
        if ex['escola_id'] is None and escola_sessao is not None:
            return jsonify({'erro': 'Não pode editar disciplina global'}), 403
        if ex['escola_id'] is not None and escola_sessao is not None and ex['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""UPDATE disciplinas SET nome=COALESCE(%s,nome), cor=COALESCE(%s,cor),
            icone=COALESCE(%s,icone), ordem=COALESCE(%s,ordem), ativo=COALESCE(%s,ativo)
            WHERE id=%s RETURNING id, codigo, nome, cor, icone, ordem, escola_id, ativo""",
            (data.get('nome'), data.get('cor'), data.get('icone'),
             data.get('ordem'), data.get('ativo'), id))
        row = cur.fetchone(); conn.commit(); cur.close()
        return jsonify(dict(row))
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@disciplinas_bp.route('/<int:id>', methods=['DELETE'])
def excluir_disciplina(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = None
    try:
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id, nome FROM disciplinas WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex: return jsonify({'erro': 'Disciplina não encontrada'}), 404
        if ex['escola_id'] is None and escola_sessao is not None:
            return jsonify({'erro': 'Não pode excluir disciplina global'}), 403
        if escola_sessao is not None and ex['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("UPDATE disciplinas SET ativo = FALSE WHERE id = %s", (id,))
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'mensagem': f'Disciplina "{ex["nome"]}" desativada'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass