# ============================================================
# STATIC — serve index.html/css/js/partials da raiz do projeto
# Caminho ABSOLUTO (funciona em qualquer working directory)
# ============================================================

import os

from flask import Blueprint, jsonify, send_file, request

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

# Diretórios que podem ser servidos via catch-all.
# 'js' já funcionava antes — mantido. 'css' e 'partials' são os novos.
ALLOWED_DIRS = ('js', 'css', 'partials')


def _mimetype(filename):
    _, ext = os.path.splitext(filename.lower())
    return MIME_TYPES.get(ext)


def _safe_join(root, *parts):
    """Resolve um caminho e garante que ele fica dentro de `root`."""
    full = os.path.abspath(os.path.join(root, *parts))
    if not full.startswith(os.path.abspath(root) + os.sep) and full != os.path.abspath(root):
        return None
    return full


# ============================================================
# Rotas principais
# ============================================================

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


# ============================================================
# Rotas explícitas — NÃO dependem do catch-all
# ============================================================

@static_bp.route('/css/<path:filename>')
def serve_css_dir(filename):
    return _serve_from_dir('css', filename, 'text/css', "/* não encontrado */")


@static_bp.route('/partials/<path:filename>')
def serve_partials_dir(filename):
    return _serve_from_dir('partials', filename, 'text/html', "<!-- não encontrado -->")


@static_bp.route('/js/<path:filename>')
def serve_js_dir(filename):
    return _serve_from_dir('js', filename, 'application/javascript', "// não encontrado")


def _serve_from_dir(dirname, filename, default_mime, fallback_body):
    if '..' in filename or filename.startswith('/'):
        return jsonify({'erro': 'Caminho inválido'}), 400
    full = _safe_join(PROJECT_ROOT, dirname, filename)
    if full and os.path.isfile(full):
        return send_file(full, mimetype=_mimetype(filename) or default_mime)
    return fallback_body, 404, {'Content-Type': default_mime}


# ============================================================
# Catch-all — mantido para o que já funcionava (imagens, fontes,
# favicon, index.html via rota específica, etc.) mas RESTRITO
# a diretórios permitidos por segurança.
# ============================================================

@static_bp.route('/<path:filename>')
def serve_static_file(filename):
    if '..' in filename or filename.startswith('/'):
        return jsonify({'erro': 'Caminho inválido'}), 400

    # Arquivo solto na raiz (ex.: favicon.ico, manifest.json, robots.txt)
    # Serve somente se for extensão conhecida e NÃO for código-fonte.
    if os.sep not in filename and '/' not in filename:
        if filename.endswith(('.env', '.py', '.pyc', '.db', '.sqlite', '.sqlite3')):
            return jsonify({'erro': 'Arquivo não encontrado', 'path': filename}), 404
        full = _safe_join(PROJECT_ROOT, filename)
        if full and os.path.isfile(full):
            return send_file(full, mimetype=_mimetype(filename))

    # Subdiretório — só serve se o PRIMEIRO segmento for permitido
    top_dir = filename.split('/', 1)[0]
    if top_dir in ALLOWED_DIRS:
        full = _safe_join(PROJECT_ROOT, filename)
        if full and os.path.isfile(full):
            return send_file(full, mimetype=_mimetype(filename))

    # Fallback de erro por extensão
    if filename.endswith('.css'):
        return "/* não encontrado */", 404, {'Content-Type': 'text/css'}
    if filename.endswith('.js'):
        return "// não encontrado", 404, {'Content-Type': 'application/javascript'}
    return jsonify({'erro': 'Arquivo não encontrado', 'path': filename}), 404


# ============================================================
# Diagnóstico — abra no navegador se algo der 404
# ============================================================

@static_bp.route('/__debug/arquivos')
def debug_arquivos():
    """Lista o que existe em css/, partials/ e js/ para diagnóstico."""
    resultado = {'project_root': PROJECT_ROOT, 'cwd': os.getcwd()}

    for d in ('css', 'js', 'partials'):
        base = os.path.join(PROJECT_ROOT, d)
        if not os.path.isdir(base):
            resultado[d] = '(diretório não existe)'
            continue
        encontrados = []
        for root, _dirs, files in os.walk(base):
            for f in sorted(files):
                rel = os.path.relpath(os.path.join(root, f), PROJECT_ROOT)
                encontrados.append(rel.replace(os.sep, '/'))
        resultado[d] = encontrados

    # Checa especificamente os arquivos novos
    resultado['checagens'] = {
        'css/layout.css': os.path.isfile(os.path.join(PROJECT_ROOT, 'css', 'layout.css')),
        'partials/layout/sidebar.html': os.path.isfile(
            os.path.join(PROJECT_ROOT, 'partials', 'layout', 'sidebar.html')),
        'partials/pages/dashboard.html': os.path.isfile(
            os.path.join(PROJECT_ROOT, 'partials', 'pages', 'dashboard.html')),
        'partials/modals/cam-modal.html': os.path.isfile(
            os.path.join(PROJECT_ROOT, 'partials', 'modals', 'cam-modal.html')),
        'js/boot.js': os.path.isfile(os.path.join(PROJECT_ROOT, 'js', 'boot.js')),
    }

    return jsonify(resultado), 200
