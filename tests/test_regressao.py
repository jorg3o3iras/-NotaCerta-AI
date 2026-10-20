"""Testes de regressão — travam bugs já corrigidos.

Cada teste aqui corresponde a um bug real que ocorreu e foi corrigido.
Se algum destes falhar, é sinal de que o bug voltou.
"""


# ═══════════════════════════════════════════════════════════════
# BUG 1: Faixas de conceito estavam erradas
# ═══════════════════════════════════════════════════════════════
def test_calcular_conceito_faixas():
    from app import calcular_conceito
    assert calcular_conceito(0)['nome'] == 'inicial'
    assert calcular_conceito(30)['nome'] == 'inicial'
    assert calcular_conceito(40)['nome'] == 'inicial'
    assert calcular_conceito(41)['nome'] == 'basico'
    assert calcular_conceito(60)['nome'] == 'basico'
    assert calcular_conceito(61)['nome'] == 'proficiente'
    assert calcular_conceito(80)['nome'] == 'proficiente'
    assert calcular_conceito(81)['nome'] == 'avancado'
    assert calcular_conceito(100)['nome'] == 'avancado'


# ═══════════════════════════════════════════════════════════════
# BUG 2: "Ciências Naturais" não virava "CN"
# ═══════════════════════════════════════════════════════════════
def test_identificar_disciplina_cn():
    from app import identificar_disciplina
    assert identificar_disciplina('', 'Ciências Naturais', '') == 'CN'
    assert identificar_disciplina('PROVA CN 1º Ano', '', '') == 'CN'


def test_identificar_disciplina_portugues():
    from app import identificar_disciplina
    assert identificar_disciplina('', 'Português', '') == 'Portugues'
    assert identificar_disciplina('', 'Língua Portuguesa', '') == 'Portugues'


def test_identificar_disciplina_producao():
    from app import identificar_disciplina
    assert identificar_disciplina('', 'Produção de Texto', '') == 'Producao'
    assert identificar_disciplina('Redação 2025', '', '') == 'Producao'


def test_identificar_disciplina_fallback():
    from app import identificar_disciplina
    # Sem disciplina, sem título, sem série → 'Geral'
    assert identificar_disciplina('', '', '') == 'Geral'


# ═══════════════════════════════════════════════════════════════
# BUG 3: Gabarito inválido (vazio, letra fora de A-D)
# ═══════════════════════════════════════════════════════════════
def test_validar_gabarito():
    from app import validar_gabarito
    assert validar_gabarito(['A', 'B', 'C', 'D'], 4) is True
    assert validar_gabarito(['A', 'B', 'C'], 4) is True
    assert validar_gabarito(['A', '', 'C', 'D'], 4) is False   # vazio
    assert validar_gabarito(['X', 'B', 'C', 'D'], 4) is False   # X inválido
    assert validar_gabarito([], 4) is False
    assert validar_gabarito(None, 4) is False


def test_gerar_padrao_gabarito():
    from app import gerar_padrao_gabarito
    padrao = gerar_padrao_gabarito(['A', 'B', 'C', 'D'], 4)
    assert padrao['total_questoes'] == 4
    assert padrao['alternativas'] == ['A', 'B', 'C', 'D']
    assert padrao['gabarito_oficial'] == ['A', 'B', 'C', 'D']
    assert len(padrao['questoes']) == 4


# ═══════════════════════════════════════════════════════════════
# BUG 4: Nota 0 aparecia como "—" no relatório
# ═══════════════════════════════════════════════════════════════
def test_nota_zero_nao_vira_dash():
    """Bug histórico: aluno com 0 acertos aparecia como '—' em vez de 0.0."""
    from app import calcular_resultado_correcao
    r = calcular_resultado_correcao(
        respostas=['B', 'C', 'D', 'A'],
        gabarito=['A', 'B', 'C', 'D'],
        aluno_nome='Teste',
        serie='1º Ano',
        disciplina='Matemática',
        tipo_questoes=4,
        modo='teste',
    )
    assert r['acertos'] == 0
    assert r['nota'] == 0.0           # 0.0, NÃO None, NÃO "—"
    assert r['porcentagem'] == 0
    assert r['conceito']['nome'] == 'inicial'


def test_nota_dez_quando_acerta_tudo():
    from app import calcular_resultado_correcao
    r = calcular_resultado_correcao(
        respostas=['A', 'B', 'C', 'D'],
        gabarito=['A', 'B', 'C', 'D'],
        aluno_nome='Teste',
        serie='1º Ano',
        disciplina='Matemática',
        tipo_questoes=4,
        modo='teste',
    )
    assert r['acertos'] == 4
    assert r['nota'] == 10.0
    assert r['porcentagem'] == 100
    assert r['conceito']['nome'] == 'avancado'


# ═══════════════════════════════════════════════════════════════
# BUG 5: IA retornando respostas "suspeitas" (todas iguais)
# ═══════════════════════════════════════════════════════════════
def test_ia_antichute_todas_iguais():
    """Se a IA retornar 'A' para tudo, é suspeito."""
    from app import _validar_resposta_ia_contra_gabarito
    suspeito, motivo = _validar_resposta_ia_contra_gabarito(
        ['A'] * 10, ['A'] * 10
    )
    assert suspeito is True
    assert 'Todas' in motivo or 'A' in motivo


def test_ia_antichute_normal():
    """Respostas variadas não são suspeitas."""
    from app import _validar_resposta_ia_contra_gabarito
    respostas = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']
    suspeito, _ = _validar_resposta_ia_contra_gabarito(respostas, respostas)
    assert suspeito is False


# ═══════════════════════════════════════════════════════════════
# BUG 6: default do histórico_agrupado com total:20 causava "0/20"
# ═══════════════════════════════════════════════════════════════
def test_default_historico_agrupado_tem_sem_avaliacao():
    """O default do relatório DEVE ter sem_avaliacao=True e total=0.

    Bug histórico: 'total': 20 fazia aluno sem prova aparecer com 0/20
    em Português mesmo quando nunca fez prova de Português.
    """
    import ast
    with open('app.py', 'r', encoding='utf-8') as f:
        arvore = ast.parse(f.read())

    # Procura a função historico_agrupado e inspeciona o default
    encontrou = False
    for no in ast.walk(arvore):
        if isinstance(no, ast.FunctionDef) and no.name == 'historico_agrupado':
            for sub in ast.walk(no):
                if isinstance(sub, ast.Assign):
                    for alvo in sub.targets:
                        if isinstance(alvo, ast.Name) and alvo.id == 'default':
                            if isinstance(sub.value, ast.Dict):
                                chaves = [
                                    k.value for k in sub.value.keys
                                    if isinstance(k, ast.Constant)
                                ]
                                assert 'sem_avaliacao' in chaves, (
                                    "❌ default SEM 'sem_avaliacao' — bug voltou!"
                                )
                                encontrou = True
    assert encontrou, "❌ default não encontrado em historico_agrupado"


# ═══════════════════════════════════════════════════════════════
# BUG 7: extrair_mimetype
# ═══════════════════════════════════════════════════════════════
def test_extrair_mimetype():
    from app import extrair_mimetype
    assert extrair_mimetype('data:image/jpeg;base64,xyz') == 'image/jpeg'
    assert extrair_mimetype('data:image/png;base64,xyz') == 'image/png'
    assert extrair_mimetype('') == 'image/jpeg'
    assert extrair_mimetype(None) == 'image/jpeg'