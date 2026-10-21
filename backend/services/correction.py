# Orquestrador de correção (template + fallback IA)
import logging

from backend.services.concepts import (
    calcular_resultado_correcao, erro_correcao, gerar_padrao_gabarito,
    validar_gabarito,
)
from backend.services.evalbee import (
    carregar_mapa_template, corrigir_com_template_mapping,
    gerar_mapa_template_padrao,
)
from backend.services.openai_client import (
    OPENAI_AVAILABLE, corrigir_com_ia_fallback, openai_client,
)


def corrigir_com_gemini_com_padrao(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                     tipo_questoes=4, disciplina='', bncc=None,
                                     mapa_template=None, prova_id=None, aluno_id=None,
                                     valor_nota=10):
    gabarito = padrao_gabarito['gabarito_oficial']
    if not gabarito: return erro_correcao(aluno_nome, serie, disciplina, 'Gabarito não disponível')
    total = len(gabarito)
    try:
        if not mapa_template and prova_id and aluno_id:
            mapa_template = carregar_mapa_template(prova_id, aluno_id)
        if not mapa_template:
            nc = 1 if total <= 12 else 2
            mapa_template = gerar_mapa_template_padrao(total, padrao_gabarito['alternativas'], nc)
        resultado = corrigir_com_template_mapping(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                                   tipo_questoes, disciplina, bncc, mapa_template,
                                                   prova_id=prova_id, aluno_id=aluno_id)
        if not resultado:
            if OPENAI_AVAILABLE and openai_client is not None:
                return corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                                 tipo_questoes, disciplina, bncc, valor_nota)
            return erro_correcao(aluno_nome, serie, disciplina,
                'Não foi possível ler as respostas. Tire foto com boa iluminação e os 4 marcadores visíveis.')
        respostas = resultado['respostas']; confs = resultado['confiancas']
        det = sum(1 for r in respostas if r)
        if det < total * 0.15:
            if OPENAI_AVAILABLE and openai_client is not None:
                ri = corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                               tipo_questoes, disciplina, bncc, valor_nota)
                if not ri.get('erro'):
                    ri['modo'] = 'ia_fallback'; return ri
            return erro_correcao(aluno_nome, serie, disciplina, f'Detectou {det}/{total}')
        nv = [r for r in respostas if r]
        if len(nv) >= 3 and len(set(nv)) == 1:
            if OPENAI_AVAILABLE and openai_client is not None:
                ri = corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                               tipo_questoes, disciplina, bncc, valor_nota)
                if not ri.get('erro'):
                    ri['modo'] = 'ia_fallback'; return ri
            return erro_correcao(aluno_nome, serie, disciplina, f'Todas "{nv[0]}"')
        return calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina,
                                            tipo_questoes, 'template_evalbee_v4',
                                            bncc=bncc, confiancas=confs, valor_nota=valor_nota)
    except Exception as e:
        logging.error(f"❌ Erro correção: {e}")
        if OPENAI_AVAILABLE and openai_client is not None:
            return corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                             tipo_questoes, disciplina, bncc, valor_nota)
        return erro_correcao(aluno_nome, serie, disciplina, str(e))