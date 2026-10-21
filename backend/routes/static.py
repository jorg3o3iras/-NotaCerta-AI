import os

from flask import Blueprint, jsonify, send_file

static_bp = Blueprint('static_served', __name__)


MIME_TYPES = {
    '.html':'text/html','.css':'text/css','.js':'application/javascript',
    '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
    '.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff',
    '.woff2':'font/woff2','.ttf':'font/ttf',
    '.eot':'application/vnd.ms-fontobject','.pdf':'application/pdf',
    '.txt':'text/plain','.xml':'application/xml',
}


def _get_mimetype(filename):
    _, ext = os.path.splitext(filename.lower())
    return MIME_TYPES.get(ext, None)


@static_bp.route('/')
def index():
    try:
        if os.path.isfile('index.html'):
            return send_file('index.html', mimetype='text/html')
        return jsonify({'mensagem':'NotaCerta AI API','status':'online'}), 200
    except Exception:
        return jsonify({'mensagem':'NotaCerta AI API','status':'online'}), 200


@static_bp.route('/style.css')
def serve_css():
    try:
        if os.path.isfile('style.css'):
            return send_file('style.css', mimetype='text/css')
        return "/* não encontrado */", 404, {'Content-Type':'text/css'}
    except: return "/* erro */", 500, {'Content-Type':'text/css'}


@static_bp.route('/script.js')
def serve_js():
    try:
        if os.path.isfile('script.js'):
            return send_file('script.js', mimetype='application/javascript')
        return "// não encontrado", 404, {'Content-Type':'application/javascript'}
    except: return "// erro", 500, {'Content-Type':'application/javascript'}


@static_bp.route('/<path:filename>')
def serve_static_file(filename):
    try:
        if '..' in filename or filename.startswith('/'):
            return jsonify({'erro':'Caminho inválido'}), 400
        mimetype = _get_mimetype(filename)
        if os.path.isfile(filename):
            return send_file(filename, mimetype=mimetype)
        if filename.endswith('.css'):
            return "/* não encontrado */", 404, {'Content-Type':'text/css'}
        if filename.endswith('.js'):
            return "// não encontrado", 404, {'Content-Type':'application/javascript'}
        return jsonify({'erro':'Arquivo não encontrado','path':filename}), 404
    except Exception as e:
        return jsonify({'erro':str(e)}), 500