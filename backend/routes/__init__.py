# ============================================================
# ROUTES — registro central de blueprints
# ============================================================

from backend.routes.auth_routes import auth_bp
from backend.routes.backup import backup_bp
from backend.routes.cartao import cartao_bp
from backend.routes.correcao import correcao_bp
from backend.routes.correcao_manual import correcao_manual_bp
from backend.routes.dashboard import dashboard_bp
from backend.routes.disciplinas import disciplinas_bp
from backend.routes.escolas import escolas_bp
from backend.routes.gabaritos import gabaritos_bp
from backend.routes.historico import historico_bp
from backend.routes.producao import producao_bp
from backend.routes.provas import provas_bp
from backend.routes.redacao import redacao_bp
from backend.routes.static import static_bp
from backend.routes.turmas import turmas_bp
from backend.routes.usuarios import usuarios_bp
from backend.routes.alunos import alunos_bp


BLUEPRINTS = [
    auth_bp,
    dashboard_bp,
    escolas_bp,
    turmas_bp,
    alunos_bp,
    provas_bp,
    disciplinas_bp,
    usuarios_bp,
    gabaritos_bp,
    historico_bp,
    correcao_bp,
    correcao_manual_bp,
    producao_bp,
    redacao_bp,
    cartao_bp,
    backup_bp,
    static_bp,
]


def register_blueprints(app):
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)