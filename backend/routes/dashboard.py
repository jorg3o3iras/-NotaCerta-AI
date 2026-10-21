import logging

from flask import Blueprint, jsonify
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.db import get_db_connection

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')


@dashboard_bp.route('/dashboard', methods=['GET'])
def dashboard():
    try: escola_id = get_escola_id()
    except PermissionError as e: return jsonify({'erro': str(e)}), 403
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'total_escolas': 0, 'total_turmas': 0, 'total_alunos': 0, 'total_provas': 0})
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if escola_id is None:
            cur.execute("""SELECT
                (SELECT COUNT(*) FROM escolas) AS total_escolas,
                (SELECT COUNT(*) FROM turmas) AS total_turmas,
                (SELECT COUNT(*) FROM alunos) AS total_alunos,
                (SELECT COUNT(*) FROM provas) AS total_provas""")
        else:
            cur.execute("""SELECT
                (SELECT COUNT(*) FROM escolas WHERE id=%s) AS total_escolas,
                (SELECT COUNT(*) FROM turmas WHERE escola_id=%s) AS total_turmas,
                (SELECT COUNT(*) FROM alunos WHERE escola_id=%s) AS total_alunos,
                (SELECT COUNT(*) FROM provas WHERE escola_id=%s) AS total_provas""",
                (escola_id, escola_id, escola_id, escola_id))
        row = cur.fetchone(); cur.close()
        return jsonify({'total_escolas': int(row['total_escolas'] or 0),
                        'total_turmas': int(row['total_turmas'] or 0),
                        'total_alunos': int(row['total_alunos'] or 0),
                        'total_provas': int(row['total_provas'] or 0)})
    except Exception as e:
        logging.error(f"Dashboard: {e}")
        return jsonify({'total_escolas': 0, 'total_turmas': 0, 'total_alunos': 0, 'total_provas': 0})
    finally:
        if conn:
            try: conn.close()
            except: pass