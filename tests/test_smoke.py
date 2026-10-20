"""Smoke tests — valida se o sistema sobe e as rotas críticas existem."""


def test_app_importa():
    """Se este teste falha, o app.py tem erro de sintaxe ou import."""
    import app
    assert app.app is not None


def test_rotas_registradas():
    """Verifica se todas as rotas críticas estão no Flask."""
    import app
    rotas = [r.rule for r in app.app.url_map.iter_rules()]
    rotas_obrigatorias = [
        '/api/login',
        '/api/corrigir',
        '/api/corrigir_manual',
        '/api/corrigir-automatico',
        '/api/salvar_nota_producao',
        '/api/historico/agrupado',
        '/api/gabaritos',
        '/api/gerar_gabarito',
        '/health',
    ]
    for rota in rotas_obrigatorias:
        assert rota in rotas, f"❌ Rota obrigatória não registrada: {rota}"


def test_health_responde():
    """Verifica se /health responde 200 sem depender do banco."""
    import app
    client = app.app.test_client()
    r = client.get('/health')
    assert r.status_code == 200
    dados = r.get_json()
    assert dados['status'] == 'online'


def test_login_rejeita_sem_credenciais():
    """Rota /api/login retorna 400 (não 404 nem 500) quando vazia."""
    import app
    client = app.app.test_client()
    r = client.post('/api/login', json={})
    assert r.status_code == 400


def test_corrigir_rejeita_sem_imagem():
    """Rota /api/corrigir rejeita payload sem imagem."""
    import app
    client = app.app.test_client()
    r = client.post('/api/corrigir', json={})
    assert r.status_code == 400