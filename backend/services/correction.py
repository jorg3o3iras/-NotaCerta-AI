# ============================================================
# ORQUESTRADOR DE CORREÇÃO — Template (EvalBee v4) + fallback IA
# ✨ PORTADO do adabee-sistema:
#    - _questao_respondida (compatível com dict do concepts.py)
#    - _pos_processar_resultado (MULTIPLA=errada, branco≠suspeita,
#      requer_revisao_manual só conta respondidas com conf < 70)
#    - Propaga debug_antes / debug_depois / tipo_entrada / metodo_usado
#    - Checagem "todas as respostas iguais" ignora MULTIPLA e vazios
#      e valida se a letra é uma alternativa válida
# ============================================================

import logging
import traceback

from backend.services.concepts import (
    calcular_resultado_correcao,
    erro_correcao,
    gerar_padrao_gabarito,
    validar_gabarito,
)
from backend.services.evalbee import (
    carregar_mapa_template,
    corrigir_com_template_mapping,
    gerar_mapa_template_padrao,
)
from backend.services.openai_client import (
    OPENAI_AVAILABLE,
    _pos_processar_resultado,
    corrigir_com_ia_fallback,
    openai_client,
)


# ═══════════════════════════════════════════════════════════════════
# Helpers de pós-processamento (compatíveis com questoes_status)
# ═══════════════════════════════════════════════════════════════════
def _questao_respondida(q):
    """Compatível com questoes_status que tenha 'respondida' OU só 'resposta'."""
    if 'respondida' in q:
        return bool(q['respondida'])
    resp = q.get('resposta', '')
    return bool(resp and resp not in ('—', '-', ''))


def _aplicar_pos_processamento(resultado):
    """
    Wrapper sobre _pos_processar_resultado do openai_client.
    Mantém UMA ÚNICA fonte de verdade para MULTIPLA/branco/revisão.
    """
    return _pos_processar_resultado(resultado)


# ═══════════════════════════════════════════════════════════════════
# Orquestrador principal
# ═══════════════════════════════════════════════════════════════════
def corrigir_com_gemini_com_padrao(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                     tipo_questoes=4, disciplina='', bncc=None,
                                     mapa_template=None, prova_id=None, aluno_id=None,
                                     valor_nota=10):
    """
    Correção usando EvalBee v4 (template + fill ratio) como método PRINCIPAL,
    com fallback para IA quando necessário.
    """
    gabarito = padrao_gabarito['gabarito_oficial']
    if not gabarito or len(gabarito) == 0:
        return erro_correcao(aluno_nome, serie, disciplina, 'Gabarito não disponível')

    total_questoes = len(gabarito)

    logging.info("=" * 60)
    logging.info(f"📌 CORREÇÃO EVALBEE v4 - {total_questoes}Q "
                 f"({','.join(padrao_gabarito['alternativas'])})")
    logging.info("=" * 60)

    try:
        # ── 1. Resolve mapa de template ────────────────────────────
        if not mapa_template and prova_id and aluno_id:
            mapa_template = carregar_mapa_template(prova_id, aluno_id)
            if mapa_template:
                logging.info(f"✅ Mapa carregado do banco: {len(mapa_template)} bolhas")

        if not mapa_template:
            num_colunas = 1 if total_questoes <= 12 else 2
            mapa_template = gerar_mapa_template_padrao(
                total_questoes, padrao_gabarito['alternativas'], num_colunas
            )
            logging.info(f"⚠️ Usando mapa PADRÃO gerado: {len(mapa_template)} bolhas")

        # ── 2. Tenta EvalBee v4 ────────────────────────────────────
        resultado_template = corrigir_com_template_mapping(
            imagem_base64, padrao_gabarito, aluno_nome, serie,
            tipo_questoes, disciplina, bncc, mapa_template,
            prova_id=prova_id, aluno_id=aluno_id
        )

        # ── 2a. EvalBee falhou de vez → IA ─────────────────────────
        if not resultado_template:
            logging.warning("⚠️ EvalBee falhou. Tentando IA como fallback...")
            if OPENAI_AVAILABLE and openai_client is not None:
                resultado_ia = corrigir_com_ia_fallback(
                    imagem_base64, padrao_gabarito, aluno_nome,
                    serie, tipo_questoes, disciplina, bncc, valor_nota
                )
                return _aplicar_pos_processamento(resultado_ia)
            return erro_correcao(
                aluno_nome, serie, disciplina,
                '❌ Não foi possível ler as respostas do cartão.\n\n'
                'Tire uma nova foto com:\n'
                '1. Boa iluminação (luz natural, sem sombra)\n'
                '2. Os 4 marcadores pretos visíveis nos cantos\n'
                '3. Foco nítido (segure firme)\n'
                '4. Sem reflexo de flash'
            )

        respostas = resultado_template['respostas']
        confiancas = resultado_template['confiancas']

        conf_media = sum(confiancas) / len(confiancas) if confiancas else 0
        detectadas = sum(1 for r in respostas if r)
        multiplas_detectadas = sum(1 for r in respostas if r == 'MULTIPLA')

        logging.info(f"📊 EvalBee: média={conf_media:.1f}% "
                     f"detectadas={detectadas}/{total_questoes} "
                     f"múltiplas={multiplas_detectadas} respostas={respostas}")

        # ── 2b. Detectou quase nada → tenta IA ─────────────────────
        if detectadas < total_questoes * 0.15:
            logging.warning(f"⚠️ Só {detectadas}/{total_questoes}. Tentando IA...")
            if OPENAI_AVAILABLE and openai_client is not None:
                resultado_ia = corrigir_com_ia_fallback(
                    imagem_base64, padrao_gabarito, aluno_nome,
                    serie, tipo_questoes, disciplina, bncc, valor_nota
                )
                if not resultado_ia.get('erro'):
                    resultado_ia['modo'] = 'ia_fallback'
                    return _aplicar_pos_processamento(resultado_ia)
            return erro_correcao(
                aluno_nome, serie, disciplina,
                f'Detectou só {detectadas}/{total_questoes}. '
                'Tire foto mais clara, com os 4 marcadores visíveis.'
            )

        # ── 2c. Checagem "todas as respostas são a mesma letra" ────
        # IMPORTANTE: MULTIPLA e vazios são ignorados nesta checagem.
        # Se sobra só uma letra válida repetida 3+ vezes → suspeito.
        nao_vazias = [r for r in respostas if r and r != 'MULTIPLA']
        letras_validas = set(padrao_gabarito['alternativas'])
        todas_sao_mesma_letra = (
            len(nao_vazias) >= 3
            and len(set(nao_vazias)) == 1
            and nao_vazias[0] in letras_validas
        )
        if todas_sao_mesma_letra:
            logging.warning(f"⚠️ Todas respostas = '{nao_vazias[0]}'. Tentando IA...")
            if OPENAI_AVAILABLE and openai_client is not None:
                resultado_ia = corrigir_com_ia_fallback(
                    imagem_base64, padrao_gabarito, aluno_nome,
                    serie, tipo_questoes, disciplina, bncc, valor_nota
                )
                if not resultado_ia.get('erro'):
                    resultado_ia['modo'] = 'ia_fallback'
                    return _aplicar_pos_processamento(resultado_ia)
            return erro_correcao(
                aluno_nome, serie, disciplina,
                f'Todas as respostas "{nao_vazias[0]}" — impossível. '
                'Foto com reflexo?'
            )

        # ── 3. Calcula resultado oficial ───────────────────────────
        resultado = calcular_resultado_correcao(
            respostas, gabarito, aluno_nome, serie,
            disciplina, tipo_questoes, 'template_evalbee_v4',
            bncc=bncc, confiancas=confiancas, valor_nota=valor_nota
        )

        # ── 4. ✨ Propaga debug do template para o resultado ───────
        if resultado_template.get('debug_antes'):
            resultado['debug_antes'] = resultado_template['debug_antes']
        if resultado_template.get('debug_depois'):
            resultado['debug_depois'] = resultado_template['debug_depois']
        resultado['tipo_entrada'] = resultado_template.get('tipo_entrada', 'desconhecido')

        # Método real (para UI diferenciar "EvalBee" de "EvalBee+Calibração")
        if resultado_template.get('metodo'):
            resultado['metodo_usado'] = resultado_template['metodo']

        # ── 5. Aplica pós-processamento (MULTIPLA=errada, etc.) ────
        return _aplicar_pos_processamento(resultado)

    except Exception as e:
        logging.error(f"❌ Erro na correção: {e}")
        traceback.print_exc()
        if OPENAI_AVAILABLE and openai_client is not None:
            logging.warning("⚠️ Exceção no template. Tentando IA...")
            resultado_ia = corrigir_com_ia_fallback(
                imagem_base64, padrao_gabarito, aluno_nome,
                serie, tipo_questoes, disciplina, bncc, valor_nota
            )
            return _aplicar_pos_processamento(resultado_ia)
        return erro_correcao(aluno_nome, serie, disciplina, str(e))
