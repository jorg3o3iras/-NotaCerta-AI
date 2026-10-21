import json
import logging
import re
import traceback
from collections import Counter

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.config import OPENAI_MODEL
from backend.db import get_db_connection
from backend.services.concepts import extrair_mimetype, identificar_disciplina
from backend.services.openai_client import OPENAI_AVAILABLE, openai_client

redacao_bp = Blueprint('redacao', __name__, url_prefix='/api')


@redacao_bp.route('/corrigir_redacao', methods=['POST'])
def corrigir_redacao():
    try:
        data = request.json or {}
        texto = data.get('texto')
        if not texto: return jsonify({'erro': 'Texto obrigatório'}), 400
        if OPENAI_AVAILABLE and openai_client is not None:
            try:
                prompt = f"""Avalie a redação e retorne APENAS JSON:
Redação: {texto}
Formato: {{"nota": 7.5, "metricas": {{"nota_coerencia": 8, "nota_estrutura": 7.5, "nota_gramatica": 7, "nota_vocabulario": 7.5}}, "feedback": "texto..."}}"""
                kwargs = {'model': OPENAI_MODEL,
                          'messages': [{'role':'system','content':'Professor avaliador. Responda SEMPRE em JSON.'},
                                       {'role':'user','content':prompt}],
                          'max_tokens': 800, 'temperature': 0.5}
                if OPENAI_MODEL.startswith('gpt-4o') or 'turbo' in OPENAI_MODEL:
                    kwargs['response_format'] = {'type':'json_object'}
                response = openai_client.chat.completions.create(**kwargs)
                rt = response.choices[0].message.content
                m = re.search(r'\{[\s\S]*\}', rt)
                if m:
                    r = json.loads(m.group()); r['modo'] = 'openai'; return jsonify(r)
            except Exception as e:
                print(f"⚠️ Erro OpenAI redação: {e}")
        tl = texto.strip()
        palavras = re.findall(r'\b[a-zA-ZáéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ]+\b', tl)
        num = len(palavras)
        frases = re.split(r'[.!?;]+', tl)
        nf = len([f for f in frases if f.strip()])
        uniq = len(set([p.lower() for p in palavras]))
        div = uniq / num if num > 0 else 0
        tam = sum(len(p) for p in palavras) / num if num > 0 else 0
        cont = Counter([p.lower() for p in palavras])
        rep = sum(1 for v in cont.values() if v > 3)
        nc = min(10, max(0, (div*5) + (min(1, nf/4)*3) + (min(1, num/50)*2)))
        ne = min(10, max(0, (min(1, nf/3)*5) + (min(1, tam/6)*5)))
        ng = min(10, max(0, (min(1, tam/5)*4) + (min(1, num/40)*4) + (2 - min(2, rep*0.4))))
        nv = min(10, max(0, div*12))
        if num < 5: nc*=0.2; ne*=0.2; ng*=0.2; nv*=0.2
        nf_final = round((nc*0.30 + ne*0.25 + ng*0.25 + nv*0.20), 1)
        nf_final = min(10, max(0, nf_final))
        fb = []
        if num < 10: fb.append(f"⚠️ Texto curto ({num} palavras)")
        elif num < 30: fb.append("📝 Bom início!")
        else: fb.append("✅ Bom desenvolvimento")
        if div < 0.4: fb.append("🔤 Varie mais o vocabulário")
        elif div < 0.6: fb.append("📚 Bom vocabulário")
        else: fb.append("📚 Ótimo vocabulário!")
        if rep > 5: fb.append("⚠️ Muitas repetições")
        if nf_final >= 7: fb.append("🌟 Continue!")
        elif nf_final >= 5: fb.append("📈 Melhorando!")
        else: fb.append("📝 Revise!")
        return jsonify({'nota': nf_final,
                        'metricas': {'nota_coerencia': round(nc,1), 'nota_estrutura': round(ne,1),
                                     'nota_gramatica': round(ng,1), 'nota_vocabulario': round(nv,1)},
                        'feedback': ' '.join(fb), 'modo': 'local'})
    except Exception as e:
        print(f"❌ Erro redação: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@redacao_bp.route('/extrair_texto_redacao', methods=['POST'])
def extrair_texto_redacao():
    try:
        data = request.json or {}
        imagem_base64 = data.get('imagem')
        if not imagem_base64: return jsonify({'erro': 'Imagem obrigatória'}), 400
        if not OPENAI_AVAILABLE or openai_client is None:
            return jsonify({'erro': 'IA OpenAI não disponível'}), 503
        if isinstance(imagem_base64, tuple): imagem_base64 = imagem_base64[0]
        if ',' in imagem_base64 and imagem_base64.strip().startswith('data:'):
            mimetype = extrair_mimetype(imagem_base64)
            imagem_limpa = imagem_base64.split(',',1)[1]
        else:
            imagem_limpa = imagem_base64; mimetype = 'image/jpeg'
        data_url = f"data:{mimetype};base64,{imagem_limpa}"
        prompt = "Extraia TODO o texto desta redação. Retorne APENAS o texto puro. Preserve parágrafos. Use [ilegível] para palavras ilegíveis."
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{'role':'system','content':'OCR. Retorne apenas texto.'},
                      {'role':'user','content':[{'type':'text','text':prompt},
                                                 {'type':'image_url','image_url':{'url':data_url,'detail':'high'}}]}],
            max_tokens=4000, temperature=0.0)
        texto = (response.choices[0].message.content or '').strip()
        if not texto: return jsonify({'erro': 'Não foi possível ler texto'}), 400
        return jsonify({'sucesso': True, 'texto': texto, 'caracteres': len(texto)})
    except Exception as e:
        logging.error(f"OCR: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@redacao_bp.route('/salvar_correcao_texto', methods=['POST'])
def salvar_correcao_texto():
    conn = None
    try:
        data = request.json or {}
        aluno_id = data.get('aluno_id'); prova_id = data.get('prova_id')
        texto = data.get('texto'); nota = data.get('nota')
        metricas = data.get('metricas', {}); feedback = data.get('feedback', '')
        if not aluno_id: return jsonify({'erro': 'Aluno obrigatório'}), 400
        if not texto: return jsonify({'erro': 'Texto obrigatório'}), 400
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id FROM alunos WHERE id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""INSERT INTO correcoes_texto (aluno_id, prova_id, texto, nota,
            metrica_coerencia, metrica_estrutura, metrica_gramatica, metrica_vocabulario,
            feedback, tipo_correcao) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'ia') RETURNING id""",
            (aluno_id, prova_id, texto, nota, metricas.get('nota_coerencia', 0),
             metricas.get('nota_estrutura', 0), metricas.get('nota_gramatica', 0),
             metricas.get('nota_vocabulario', 0), feedback))
        id_ct = cur.fetchone()['id']
        if prova_id and nota is not None:
            try:
                cur.execute("SELECT disciplina, titulo, serie FROM provas WHERE id = %s", (prova_id,))
                pr = cur.fetchone()
                cur.execute("SELECT t.serie FROM alunos a LEFT JOIN turmas t ON a.turma_id=t.id WHERE a.id = %s", (aluno_id,))
                sr = cur.fetchone()
                disc_h = (pr['disciplina'] if pr else None) or 'Redação'
                tit_h = (pr['titulo'] if pr else '') or ''
                ser_h = (sr['serie'] if sr else None) or (pr['serie'] if pr else '') or '1º Ano'
                tipo_av = identificar_disciplina(tit_h, disc_h, ser_h)
                nf = float(nota or 0); ac_eq = int(round(nf)); tot_eq = 10
                qs_h = [{'numero': 1, 'resposta': f'{nf}', 'gabarito': '10.0',
                         'acertou': nf >= 6, 'respondida': True, 'bncc': '',
                         'status': f'📝 Nota {nf}', 'status_texto': f'📝 Nota {nf}',
                         'confianca': 100, 'correta': nf >= 6}]
                resp_h = [f'{nf}']
                cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s", (prova_id, aluno_id))
                if cur.fetchone():
                    cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s, nota=%s,
                        total=%s, tipo_correcao='ia_redacao', disciplina=%s, tipo_avaliacao=%s,
                        questoes_status=%s::jsonb, confianca=100, confianca_por_questao=%s::jsonb,
                        data_correcao=CURRENT_TIMESTAMP WHERE prova_id=%s AND aluno_id=%s""",
                        (resp_h, ac_eq, nf, tot_eq, disc_h, tipo_av,
                         json.dumps(qs_h), json.dumps([100]), prova_id, aluno_id))
                else:
                    cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas,
                        acertos, nota, total, tipo_correcao, disciplina, tipo_avaliacao,
                        questoes_status, confianca, confianca_por_questao, bncc)
                        VALUES (%s,%s,%s::text[],%s,%s,%s,'ia_redacao',%s,%s,%s::jsonb,100,%s::jsonb,%s::text[])""",
                        (prova_id, aluno_id, resp_h, ac_eq, nf, tot_eq, disc_h, tipo_av,
                         json.dumps(qs_h), json.dumps([100]), []))
            except Exception as e:
                logging.warning(f"Integração redação: {e}")
        conn.commit(); cur.close()
        return jsonify({'sucesso': True, 'id': id_ct, 'mensagem': 'Correção de texto salva'})
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        print(f"❌ Erro salvar correção texto: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass