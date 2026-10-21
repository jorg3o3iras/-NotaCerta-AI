import base64
import io
import json
import logging
import re
import time
from collections import Counter

import cv2
import numpy as np

from backend.config import OPENAI_API_KEY, OPENAI_MODEL
from backend.services.concepts import (
    calcular_resultado_correcao, erro_correcao, extrair_mimetype,
)

OPENAI_AVAILABLE = False
openai_client = None

try:
    from openai import OpenAI
    if OPENAI_API_KEY and OPENAI_API_KEY.startswith('sk-'):
        try:
            openai_client = OpenAI(api_key=OPENAI_API_KEY)
            OPENAI_AVAILABLE = True
            print("✅ OpenAI configurado!")
        except Exception as e:
            print(f"⚠️ Erro OpenAI: {e}")
    else:
        print("⚠️ OPENAI_API_KEY inválida")
except ImportError as e:
    print(f"❌ openai não instalado: {e}")
except Exception as e:
    print(f"⚠️ Erro: {e}")


def preprocessar_imagem_para_ia(imagem_base64):
    try:
        raw = imagem_base64
        if isinstance(raw, tuple): raw = raw[0]
        if not raw or not isinstance(raw, str): return '', 'image/jpeg'
        if ',' in raw and raw.strip().startswith('data:'): raw = raw.split(',', 1)[1]
        raw = raw.strip().replace('\n', '').replace('\r', '').replace(' ', '')
        try: image_data = base64.b64decode(raw, validate=False)
        except: return '', 'image/jpeg'
        np_array = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
        if img is None:
            try:
                from PIL import Image as PILImage
                pil = PILImage.open(io.BytesIO(image_data))
                if pil.mode != 'RGB': pil = pil.convert('RGB')
                img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            except: return '', 'image/jpeg'
        if img is None or img.size == 0: return '', 'image/jpeg'
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        brilho = float(np.mean(gray))
        if brilho < 100:
            alpha = min(140.0 / max(brilho, 1), 2.2)
            img = cv2.convertScaleAbs(img, alpha=alpha, beta=25)
        elif brilho > 220:
            alpha = 200.0 / max(brilho, 1)
            img = cv2.convertScaleAbs(img, alpha=alpha, beta=-15)
        TARGET = 2400
        if h > TARGET:
            scale = TARGET / float(h)
            img = cv2.resize(img, (int(w*scale), TARGET), interpolation=cv2.INTER_AREA)
        elif h < 1600:
            scale = 1600 / float(h)
            img = cv2.resize(img, (int(w*scale), 1600), interpolation=cv2.INTER_CUBIC)
        _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return base64.b64encode(buffer).decode('utf-8'), 'image/jpeg'
    except Exception as e:
        logging.error(f"❌ Prep IA: {e}")
        raw = imagem_base64.split(',', 1)[1] if ',' in imagem_base64 else imagem_base64
        return raw, extrair_mimetype(imagem_base64)


def gerar_prompt_otimizado(padrao_gabarito, aluno_nome, serie, disciplina, aviso_extra=None):
    total = padrao_gabarito['total_questoes']
    alternativas = padrao_gabarito['alternativas']
    alternativas_str = ', '.join(alternativas)
    num_alts = len(alternativas)
    aviso_bloco = ""
    if aviso_extra:
        aviso_bloco = f"""
⚠️ ERRO NA TENTATIVA ANTERIOR: {aviso_extra}
Você precisa OLHAR A IMAGEM COM MAIS ATENÇÃO.
Se você não consegue distinguir as bolhas, retorne null (não chute!).
"""
    return f"""Você é um sistema OMR (Optical Mark Recognition) profissional.

Analise a foto de um cartão-resposta e identifique QUAL bolha está
preenchida em CADA uma das {total} questões.
Cada linha tem {num_alts} bolhas: {alternativas_str}.
A bolha MARCADA tem INTERIOR ESCURO. A NÃO MARCADA tem INTERIOR BRANCO.

🚨 Se você NÃO TEM CERTEZA ABSOLUTA de qual bolha está marcada,
   retorne null para aquela questão. NUNCA chute.

Retorne APENAS JSON:
{{
  "respostas": ["B", null, "C", ...],
  "confianca_por_questao": [95, 0, 90, ...]
}}

"respostas" DEVE ter EXATAMENTE {total} itens.
"confianca_por_questao" DEVE ter {total} números 0-100.
{aviso_bloco}
Retorne SOMENTE o JSON.""".strip()


def _parse_respostas_ia(texto, total_esperado, alternativas):
    if not texto: return None
    texto = texto.strip()
    texto = re.sub(r'^```(?:json)?\s*', '', texto, flags=re.IGNORECASE)
    texto = re.sub(r'\s*```\s*$', '', texto)
    dados = None
    try: dados = json.loads(texto)
    except:
        m = re.search(r'\{[\s\S]*\}', texto)
        if m:
            try: dados = json.loads(m.group(0))
            except: pass
    if not isinstance(dados, dict): return None
    respostas = dados.get('respostas')
    if not isinstance(respostas, list): return None
    alts_u = [a.upper() for a in alternativas]
    norm = []
    for r in respostas:
        if r is None: norm.append(''); continue
        if isinstance(r, str) and r.strip().lower() in ('null','none','n/a',''): norm.append(''); continue
        s = str(r).strip().upper()
        s = re.sub(r'^[\(\[]*', '', s); s = re.sub(r'[\)\]\.\,\;\:\-\s]*$', '', s).strip()
        if not s: norm.append(''); continue
        if s in alts_u: norm.append(s); continue
        for alt in alts_u:
            if s == alt or s.startswith(alt+')') or s.startswith(alt+'.'):
                norm.append(alt); break
        else:
            enc = [alt for alt in alts_u if alt in s]
            norm.append(enc[0] if len(enc) == 1 else '')
    while len(norm) < total_esperado: norm.append('')
    return norm[:total_esperado]


def _parse_confiancas_ia(texto, total_esperado):
    if not texto: return None
    dados = None
    try: dados = json.loads(texto)
    except:
        m = re.search(r'\{[\s\S]*\}', texto)
        if m:
            try: dados = json.loads(m.group(0))
            except: pass
    if not isinstance(dados, dict):
        m = re.search(r'"confianca_por_questao"\s*:\s*\[([^\]]*)\]', texto)
        if not m: return None
        nums = re.findall(r'-?\d+(?:\.\d+)?', m.group(1))
        confs = [int(float(n)) for n in nums]
    else:
        confs = dados.get('confianca_por_questao')
        if not isinstance(confs, list): return None
        parsed = []
        for c in confs:
            try: parsed.append(int(float(c)))
            except: parsed.append(75)
        confs = parsed
    while len(confs) < total_esperado: confs.append(50)
    return confs[:total_esperado]


def _validar_resposta_ia_contra_gabarito(respostas, gabarito):
    if not respostas: return True, "Resposta vazia"
    nv = [r for r in respostas if r]
    if not nv: return True, "Nenhuma"
    if len(nv) >= 5 and len(set(nv)) == 1: return True, f"Todas são '{nv[0]}'"
    if len(nv) >= 6:
        c = Counter(nv); letra, qtd = c.most_common(1)[0]
        if qtd / len(nv) >= 0.85: return True, f"{qtd}/{len(nv)} são '{letra}'"
    if gabarito and len(gabarito) == len(respostas):
        ac = sum(1 for r, g in zip(respostas, gabarito) if r and g and str(r).upper() == str(g).upper())
        tv = sum(1 for r, g in zip(respostas, gabarito) if r and g)
        if tv > 0 and ac/tv < 0.15 and tv >= 5:
            return True, f"IA acertou apenas {ac}/{tv}"
    return False, ""


def _executar_chamada_openai(data_url, padrao_gabarito, aluno_nome, serie, disciplina, tipo_questoes, aviso_extra=None):
    total = padrao_gabarito['total_questoes']
    alts = padrao_gabarito['alternativas']
    prompt = gerar_prompt_otimizado(padrao_gabarito, aluno_nome, serie, disciplina, aviso_extra)
    messages = [
        {"role": "system", "content": (
            "Você é um sistema OMR profissional. Analise cartões-resposta "
            "com precisão EXTREMA. Se não tiver CERTEZA ABSOLUTA de uma "
            "resposta, retorne null. NUNCA chute. Responda APENAS com JSON.")},
        {"role": "user", "content": [{"type": "text", "text": prompt},
                                     {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}}]}
    ]
    for tentativa in range(1, 4):
        try:
            logging.info(f"🤖 OpenAI tentativa {tentativa}/3")
            response = openai_client.chat.completions.create(
                model=OPENAI_MODEL, messages=messages, max_tokens=2000, temperature=0.0)
            texto = (response.choices[0].message.content or "").strip()
            if not texto: continue
            respostas = _parse_respostas_ia(texto, total, alts)
            if respostas is None: continue
            confs = _parse_confiancas_ia(texto, total)
            if not confs: confs = [85 if r else 0 for r in respostas]
            for i, r in enumerate(respostas):
                if not r: confs[i] = 0
            return respostas, confs, texto
        except Exception as e:
            logging.error(f"❌ OpenAI t{tentativa}: {e}")
            if tentativa < 3: time.sleep(2)
    return None, None, None


def corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie,
                              tipo_questoes=4, disciplina='', bncc=None, valor_nota=10):
    gabarito = padrao_gabarito['gabarito_oficial']
    if not gabarito: return erro_correcao(aluno_nome, serie, disciplina, 'Gabarito não disponível')
    if not OPENAI_AVAILABLE or openai_client is None:
        return erro_correcao(aluno_nome, serie, disciplina, 'IA OpenAI não disponível')
    try:
        total = len(gabarito)
        if isinstance(imagem_base64, tuple):
            imagem_limpa, mimetype = imagem_base64
        else:
            if ',' in imagem_base64 and imagem_base64.strip().startswith('data:'):
                mimetype = extrair_mimetype(imagem_base64)
                imagem_limpa = imagem_base64.split(',', 1)[1]
            else:
                imagem_limpa = imagem_base64; mimetype = 'image/jpeg'
        if not imagem_limpa or len(imagem_limpa) < 100:
            return erro_correcao(aluno_nome, serie, disciplina, 'Imagem inválida')
        data_url = f"data:{mimetype};base64,{imagem_limpa}"
        respostas, confs, texto = _executar_chamada_openai(data_url, padrao_gabarito, aluno_nome, serie, disciplina, tipo_questoes)
        if respostas is None:
            return erro_correcao(aluno_nome, serie, disciplina, 'Resposta IA inválida')
        suspeito, motivo = _validar_resposta_ia_contra_gabarito(respostas, gabarito)
        if suspeito:
            logging.warning(f"🚨 Suspeita: {motivo}")
            r2, c2, _ = _executar_chamada_openai(data_url, padrao_gabarito, aluno_nome, serie, disciplina, tipo_questoes, aviso_extra=motivo)
            if r2 is not None:
                s2, m2 = _validar_resposta_ia_contra_gabarito(r2, gabarito)
                if not s2: respostas, confs = r2, c2
                else: return erro_correcao(aluno_nome, serie, disciplina, f'IA não conseguiu ler. ({m2})')
        det = sum(1 for r in respostas if r)
        if det < total * 0.3:
            return erro_correcao(aluno_nome, serie, disciplina, f'IA detectou apenas {det}/{total}')
        return calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina,
                                            tipo_questoes, 'ia', bncc=bncc, confiancas=confs,
                                            valor_nota=valor_nota)
    except Exception as e:
        logging.error(f"❌ Fallback IA: {e}")
        return erro_correcao(aluno_nome, serie, disciplina, str(e))