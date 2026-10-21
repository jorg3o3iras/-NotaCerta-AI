# Conceitos puros de correção (sem DB, sem IA)
import re
import unicodedata


def calcular_conceito(porcentagem):
    if porcentagem <= 40:
        return {'nome': 'inicial', 'rotulo': '🔴 Inicial', 'faixa': 'até 40%', 'cor': '#ef4444', 'badge': 'badge-conceito-inicial'}
    elif porcentagem <= 60:
        return {'nome': 'basico', 'rotulo': '🟠 Básico', 'faixa': '41% - 60%', 'cor': '#f59e0b', 'badge': 'badge-conceito-basico'}
    elif porcentagem <= 80:
        return {'nome': 'proficiente', 'rotulo': '🔵 Proficiente', 'faixa': '61% - 80%', 'cor': '#3b82f6', 'badge': 'badge-conceito-proficiente'}
    else:
        return {'nome': 'avancado', 'rotulo': '🟢 Avançado', 'faixa': 'acima de 80%', 'cor': '#10b981', 'badge': 'badge-conceito-avancado'}


def _sem_acento(s):
    s = (s or '').strip().lower()
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def identificar_disciplina(prova_titulo, disciplina, serie):
    d = _sem_acento(disciplina)
    if re.search(r'\bportugues\b', d) or 'lingua' in d: return 'Portugues'
    if re.search(r'\bmatematica\b', d): return 'Matematica'
    if re.search(r'\bproducao\b', d) or 'texto' in d or 'redacao' in d: return 'Producao'
    if re.search(r'\bch\b', d) or 'ciencias humanas' in d: return 'CH'
    if re.search(r'\bcn\b', d) or 'ciencias naturais' in d or 'ciencias da natureza' in d: return 'CN'
    if re.search(r'\bingles\b', d): return 'Ingles'          # ← ADICIONAR ESTA LINHA
    t = _sem_acento(prova_titulo)
    if re.search(r'\bportugues\b', t) or 'lingua' in t: return 'Portugues'
    if re.search(r'\bmatematica\b', t) or re.search(r'\bmat\b', t): return 'Matematica'
    if re.search(r'\bproducao\b', t) or 'texto' in t or 'redacao' in t: return 'Producao'
    if re.search(r'\bch\b', t) or 'ciencias humanas' in t: return 'CH'
    if re.search(r'\bcn\b', t) or 'ciencias naturais' in t or 'ciencias da natureza' in t: return 'CN'
    if re.search(r'\bingles\b', t): return 'Ingles'          # ← ADICIONAR ESTA LINHA
    if serie:
        m = re.search(r'(\d+)', serie)
        if m:
            return 'Portugues' if int(m.group(1)) <= 5 else 'Matematica'
    return 'Geral'


def extrair_mimetype(imagem_base64):
    if not imagem_base64: return 'image/jpeg'
    match = re.match(r'data:image/(\w+);base64,', imagem_base64)
    return f'image/{match.group(1)}' if match else 'image/jpeg'


def gerar_padrao_gabarito(gabarito, tipo_questoes=4):
    alternativas = ['A', 'B', 'C', 'D', 'E'][:tipo_questoes]
    padrao = {'total_questoes': len(gabarito), 'alternativas': alternativas,
              'gabarito_oficial': gabarito, 'questoes': []}
    for i, resp in enumerate(gabarito):
        padrao['questoes'].append({
            'numero': i + 1,
            'resposta_correta': resp.upper() if resp else None,
            'alternativas': alternativas, 'posicao': i + 1,
        })
    return padrao


def validar_gabarito(gabarito, tipo_questoes=4):
    if not gabarito or len(gabarito) == 0: return False
    try: tipo = int(tipo_questoes)
    except: tipo = 4
    tipo = max(3, min(tipo, 5))
    alts = ['A', 'B', 'C', 'D', 'E'][:tipo]
    for gg in gabarito:
        if not gg or str(gg).strip() == '': return False
        if str(gg).upper().strip() not in alts: return False
    return True


def validar_respostas(respostas, gabarito, alternativas):
    validas = []
    for resp in respostas:
        if not resp or str(resp).strip() == '':
            validas.append(''); continue
        s = str(resp).upper().strip()
        if s in alternativas: validas.append(s)
        else:
            for alt in alternativas:
                if alt in s: validas.append(alt); break
            else: validas.append('')
    while len(validas) < len(gabarito): validas.append('')
    return validas[:len(gabarito)]


def calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina,
                                tipo_questoes, modo, circulos=None, bncc=None,
                                confiancas=None, valor_nota=10):
    import logging
    alternativas = ['A', 'B', 'C', 'D', 'E'][:tipo_questoes]
    acertos = 0; correcoes = []; questoes_status = []
    logging.info(f"🔍 CORREÇÃO ({modo}) GAB={gabarito} RESP={respostas}")
    for i in range(len(gabarito)):
        resp = respostas[i] if i < len(respostas) else ''
        gab = gabarito[i] if i < len(gabarito) else ''
        gab_n = str(gab).strip().upper() if gab else ''
        conf_q = int(confiancas[i]) if (confiancas and i < len(confiancas)) else 80
        cod_bncc = bncc[i] if (bncc and i < len(bncc) and bncc[i]) else ''
        is_v = resp in alternativas
        is_c = is_v and gab_n and resp == gab_n
        if is_c: acertos += 1
        if is_c: sm, ic = 'ADQUIRIU HABILIDADE ✅', '✅'
        elif is_v: sm, ic = 'RECOMPOSIÇÃO DE APRENDIZAGEM ❌', '❌'
        else: sm, ic = 'NÃO RESPONDEU —', '—'
        correcoes.append({'questao': i+1, 'resposta': resp if resp else '—',
                          'gabarito': gab_n if gab_n else '—', 'correto': is_c,
                          'status': sm, 'confianca': conf_q if is_v else 50, 'bncc': cod_bncc})
        questoes_status.append({'numero': i+1, 'resposta': resp if resp else '—',
                                'gabarito': gab_n if gab_n else '—', 'acertou': is_c,
                                'status': sm, 'status_texto': f"{ic} {sm}",
                                'confianca': conf_q if is_v else 50,
                                'correta': is_c, 'bncc': cod_bncc})
    try:
        vn = float(valor_nota) if valor_nota else 10.0
        if vn <= 0: vn = 10.0
    except: vn = 10.0
    vq = vn / len(gabarito) if len(gabarito) > 0 else 0
    nota = acertos * vq
    pct = round((acertos / len(gabarito)) * 100) if len(gabarito) > 0 else 0
    conceito = calcular_conceito(pct)
    conf_m = int(sum(confiancas) / len(confiancas)) if confiancas else 70
    suspeitas = [i + 1 for i, c in enumerate(confiancas) if c < 50] if confiancas else []
    return {
        'aluno': aluno_nome, 'serie': serie, 'disciplina': disciplina,
        'total': len(gabarito), 'acertos': acertos, 'nota': round(nota, 2),
        'porcentagem': pct, 'conceito': conceito,
        'respostas_detectadas': respostas, 'gabarito': gabarito,
        'correcoes': correcoes, 'questoes_status': questoes_status,
        'tipo_questoes': str(tipo_questoes), 'confianca': conf_m,
        'confianca_por_questao': confiancas if confiancas else [80 if r in alternativas else 50 for r in respostas],
        'modo': modo, 'valor_por_questao': round(vq, 4), 'valor_nota_prova': vn,
        'circulos_detectados': len(circulos) if circulos else 0,
        'questoes_ia': 0, 'bncc': bncc if bncc else [],
        'requer_revisao_manual': len(suspeitas) > 0 or conf_m < 60,
        'questoes_suspeitas': suspeitas,
    }


def erro_correcao(aluno_nome, serie, disciplina, erro_msg):
    conceito = calcular_conceito(0)
    return {'erro': erro_msg, 'aluno': aluno_nome, 'serie': serie, 'disciplina': disciplina,
            'total': 0, 'acertos': 0, 'nota': 0, 'porcentagem': 0, 'conceito': conceito,
            'respostas_detectadas': [], 'gabarito': [], 'correcoes': [], 'questoes_status': [],
            'tipo_questoes': '4', 'confianca': 0, 'confianca_por_questao': [],
            'modo': 'erro', 'valor_por_questao': 0, 'bncc': [],
            'requer_revisao_manual': False, 'questoes_suspeitas': []}
