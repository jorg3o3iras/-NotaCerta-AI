# ============================================================
# STATIC — serve index.html/css/js da raiz do projeto
# Caminho ABSOLUTO (funciona em qualquer working directory)
# ============================================================

import os

from flask import Blueprint, jsonify, send_file

static_bp = Blueprint('static_served', __name__)

# backend/routes/static.py → backend → RAIZ do projeto
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

MIME_TYPES = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.xml': 'application/xml',
}


def _mimetype(filename):
    _, ext = os.path.splitext(filename.lower())
    return MIME_TYPES.get(ext)


@static_bp.route('/')
def index():
    index_path = os.path.join(PROJECT_ROOT, 'index.html')
    if os.path.isfile(index_path):
        return send_file(index_path, mimetype='text/html')
    try:
        arquivos_raiz = sorted(os.listdir(PROJECT_ROOT))
    except Exception:
        arquivos_raiz = ['(erro ao listar)']
    return jsonify({
        'mensagem': 'NotaCerta AI API',
        'status': 'online',
        'debug': {
            'project_root': PROJECT_ROOT,
            'index_path': index_path,
            'index_existe': os.path.isfile(index_path),
            'cwd': os.getcwd(),
            'arquivos_na_raiz': arquivos_raiz,
        }
    }), 200


@static_bp.route('/style.css')
def serve_css():
    path = os.path.join(PROJECT_ROOT, 'style.css')
    if os.path.isfile(path):
        return send_file(path, mimetype='text/css')
    return "/* não encontrado */", 404, {'Content-Type': 'text/css'}


@static_bp.route('/script.js')
def serve_js():
    path = os.path.join(PROJECT_ROOT, 'script.js')
    if os.path.isfile(path):
        return send_file(path, mimetype='application/javascript')
    return "// não encontrado", 404, {'Content-Type': 'application/javascript'}


@static_bp.route('/<path:filename>')
def serve_static_file(filename):
    if '..' in filename or filename.startswith('/'):
        return jsonify({'erro': 'Caminho inválido'}), 400
    path = os.path.join(PROJECT_ROOT, filename)
    if os.path.isfile(path):
        return send_file(path, mimetype=_mimetype(filename))
    if filename.endswith('.css'):
        return "/* não encontrado */", 404, {'Content-Type': 'text/css'}
    if filename.endswith('.js'):
        return "// não encontrado", 404, {'Content-Type': 'application/javascript'}
    return jsonify({'erro': 'Arquivo não encontrado', 'path': filename}), 404
