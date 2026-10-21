import io
import json
import os
import zipfile
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file
from psycopg2.extras import RealDictCursor

from backend.auth import get_usuario_atual
from backend.config import BACKUP_KEY
from backend.db import get_db_connection

backup_bp = Blueprint('backup', __name__, url_prefix='/api')


@backup_bp.route('/backup', methods=['GET'])
def backup_database():
    backup_key = request.headers.get('X-Backup-Key') or request.args.get('key')
    if not backup_key or backup_key != BACKUP_KEY:
        return jsonify({'erro': 'Não autorizado'}), 403
    u = get_usuario_atual()
    if u and u.get('perfil') != 'admin':
        return jsonify({'erro': 'Apenas admins'}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        tables = ['escolas','turmas','alunos','provas','historico','usuarios','correcoes_texto']
        data = {}
        cur = conn.cursor(cursor_factory=RealDictCursor)
        for table in tables:
            try:
                cur.execute(f"SELECT * FROM {table}")
                data[table] = [dict(row) for row in cur.fetchall()]
            except Exception:
                data[table] = []
        cur.close()
        json_str = json.dumps(data, default=str, indent=2, ensure_ascii=False)
        memory = io.BytesIO()
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        with zipfile.ZipFile(memory, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"backup_{ts}.json", json_str.encode('utf-8'))
        memory.seek(0)
        return send_file(memory, mimetype='application/zip', as_attachment=True,
                         download_name=f"backup_{ts}.zip")
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass