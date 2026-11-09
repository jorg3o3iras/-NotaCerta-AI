# ============================================================
# BACKEND — factory da aplicação Flask (VERSÃO FINAL FATORADA)
# ============================================================

import logging
import traceback

from flask import Flask, jsonify, request
from flask_compress import Compress
from flask_cors import CORS
from psycopg2.extras import RealDictCursor

from backend.cache import init_cache_table, limpar_cache_antigo
from backend.config import (
    DB_POOL_MAX, DB_POOL_MIN, OPENAI_API_KEY, OPENAI_MODEL,
)
from backend.db import get_db_connection, get_pool_status
from backend.extensions import init_json_provider
from backend.logging_setup import setup_logging
from backend.routes import register_blueprints


def create_app():
    setup_logging()

    app = Flask(__name__, static_folder=None)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    Compress(app)
    init_json_provider(app)

    # ── Middlewares ──
    @app.after_request
    def after_request(response):
        if request.path.startswith('/api/') and response.status_code >= 500:
            ctype = response.headers.get('Content-Type', '')
            if 'text/html' in ctype:
                try:
                    original = response.status_code
                    response = jsonify({'erro': 'Erro interno do servidor', 'status': original})
                    response.status_code = original
                except Exception:
                    pass
        return response

    @app.errorhandler(PermissionError)
    def handle_permission(e):
        return jsonify({'erro': str(e), 'codigo': 'SEM_ESCOLA'}), 403

    # ── Health check ──
    @app.route('/health', methods=['GET'])
    def health_check():
        conn = None
        db_ok = False
        try:
            conn = get_db_connection()
            db_ok = conn is not None
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass
        pool_info = get_pool_status() or {'min': DB_POOL_MIN, 'max': DB_POOL_MAX}
        return jsonify({
            'status': 'online',
            'versao': 'v8-refactor-final',
            'database': 'conectado' if db_ok else 'desconectado',
            'openai_configurado': bool(OPENAI_API_KEY and OPENAI_API_KEY.startswith('sk-')),
            'openai_modelo': OPENAI_MODEL,
            'pool': pool_info,
        })

    @app.route('/api/debug/db', methods=['GET'])
    def debug_db():
        conn = None
        try:
            conn = get_db_connection()
            if not conn:
                return jsonify({'ok': False, 'erro': 'pool esgotado ou DB offline'}), 503
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT current_user, current_database(), version()")
            row = cur.fetchone()
            cur.close()
            return jsonify({'ok': True, 'info': dict(row)})
        except Exception as e:
            return jsonify({'ok': False, 'erro': str(e), 'trace': traceback.format_exc()}), 500
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    @app.route('/api/debug/pool', methods=['GET'])
    def debug_pool():
        info = get_pool_status()
        if not info:
            return jsonify({'ok': False, 'erro': 'Pool não inicializado'}), 500
        return jsonify({'ok': True, 'pool': info})

    # ── Blueprints ──
    register_blueprints(app)

    # ── Cache ──
    try:
        init_cache_table()
        limpar_cache_antigo()
    except Exception as e:
        logging.warning(f"Init cache falhou (non-fatal): {e}")

    return app