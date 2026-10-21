import hashlib
import json
import logging
import traceback

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from backend.auth import get_escola_id
from backend.cache import get_cache_correcao, get_cache_key, set_cache_correcao
from backend.db import get_db_connection
from backend.services.concepts import (
    calcular_resultado_correcao, gerar_padrao_gabarito, identificar_disciplina,
    validar_gabarito,
)
from backend.services.correction import corrigir_com_gemini_com_padrao
from backend.services.qrcode_utils import extrair_dados_qrcode

correcao_bp = Blueprint('correcao', __name__, url_prefix='/api')


@correcao_bp.route('/corrigir', methods=['POST'])
def corrigir_com_ia():
    conn = None
    try:
        data = request.json or {}
        if not data: return jsonify({'erro': 'Nenhum dado'}), 400
        imagem_base64 = data.get('imagem')
        prova_id = data.get('prova_id'); aluno_id = data.get('aluno_id')
        if not imagem_base64: return jsonify({'erro': 'Imagem obrigatória'}), 400
        if not prova_id: return jsonify({'erro': 'Prova ID obrigatório'}), 400
        if not aluno_id: return jsonify({'erro': 'Aluno ID obrigatório'}), 400
        imagem_hash = hashlib.md5(imagem_base64.encode()).hexdigest()
        cache_key = get_cache_key(imagem_hash, prova_id, aluno_id)
        cached = get_cache_correcao(cache_key)
        if cached: return jsonify(cached)
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT p.*, a.nome AS aluno_nome, a.turma_id,
            a.escola_id AS aluno_escola_id, t.serie AS turma_serie, e.nome AS escola_nome
            FROM provas p LEFT JOIN alunos a ON a.id = %s
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id WHERE p.id = %s""",
            (aluno_id, prova_id))
        dados = cur.fetchone(); cur.close()
        if not dados: return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and dados.get('aluno_escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado a este aluno'}), 403
        gabarito = dados.get('gabarito', [])
        if not gabarito: return jsonify({'erro': 'Gabarito não cadastrado'}), 400
        tipo_q = dados.get('tipo_questoes') or 4
        if isinstance(tipo_q, str):
            try: tipo_q = int(tipo_q)
            except: tipo_q = 4
        if not validar_gabarito(gabarito, tipo_q):
            return jsonify({'erro': 'Gabarito inválido'}), 400
        valor_nota = dados.get('valor_nota') or 10
        padrao = gerar_padrao_gabarito(gabarito, tipo_q)
        nome_aluno = dados.get('aluno_nome') or 'Aluno'
        serie = dados.get('turma_serie') or dados.get('serie') or '1º Ano'
        bncc_gab = dados.get('bncc', [])
        disciplina = dados.get('disciplina', '')
        prova_titulo = dados.get('titulo', '')
        conn.close(); conn = None
        resultado = corrigir_com_gemini_com_padrao(imagem_base64, padrao, nome_aluno, serie,
                                                     tipo_q, disciplina, bncc=bncc_gab,
                                                     prova_id=prova_id, aluno_id=aluno_id,
                                                     valor_nota=valor_nota)
        if resultado.get('erro'): return jsonify(resultado), 400
        tipo_av = identificar_disciplina(prova_titulo, disciplina, serie)
        if not resultado.get('confianca_por_questao'):
            total = resultado.get('total', 20)
            resultado['confianca_por_questao'] = [70] * total
            resultado['confianca'] = 70
        try:
            conn = get_db_connection()
            if conn:
                cur = conn.cursor()
                qs = resultado.get('questoes_status', [])
                for i, q in enumerate(qs):
                    q['bncc'] = bncc_gab[i] if i < len(bncc_gab) and bncc_gab[i] else ''
                qs_json = json.dumps(qs)
                resp = resultado.get('respostas_detectadas', [])
                cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s",
                            (prova_id, aluno_id))
                existe = cur.fetchone()
                if existe:
                    cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s,
                        nota=%s, total=%s, tipo_correcao=%s, disciplina=%s, tipo_avaliacao=%s,
                        questoes_status=%s::jsonb, confianca=%s, confianca_por_questao=%s::jsonb,
                        bncc=%s::text[], data_correcao=CURRENT_TIMESTAMP
                        WHERE prova_id=%s AND aluno_id=%s""",
                        (resp, resultado.get('acertos',0), resultado.get('nota',0),
                         resultado.get('total',0), resultado.get('modo','ia'),
                         disciplina, tipo_av, qs_json, resultado.get('confianca',70),
                         json.dumps(resultado.get('confianca_por_questao',[])),
                         bncc_gab, prova_id, aluno_id))
                else:
                    cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas,
                        acertos, nota, total, tipo_correcao, disciplina, tipo_avaliacao,
                        questoes_status, confianca, confianca_por_questao, bncc)
                        VALUES (%s,%s,%s::text[],%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s::text[])""",
                        (prova_id, aluno_id, resp, resultado.get('acertos',0),
                         resultado.get('nota',0), resultado.get('total',0),
                         resultado.get('modo','ia'), disciplina, tipo_av, qs_json,
                         resultado.get('confianca',70),
                         json.dumps(resultado.get('confianca_por_questao',[])), bncc_gab))
                conn.commit(); cur.close()
        except Exception as e:
            logging.error(f"⚠️ Salvar histórico: {e}")
        finally:
            if conn:
                try: conn.close()
                except: pass
                conn = None
        resultado['tipo_avaliacao'] = tipo_av
        resultado['disciplina'] = disciplina
        resultado['bncc'] = bncc_gab
        set_cache_correcao(cache_key, resultado)
        return jsonify(resultado)
    except Exception as e:
        logging.error(f"❌ Erro correção: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass


@correcao_bp.route('/corrigir-automatico', methods=['POST'])
def corrigir_automatico():
    conn = None
    try:
        data = request.json or {}
        imagem_base64 = data.get('imagem')
        if not imagem_base64: return jsonify({'erro': 'Imagem obrigatória'}), 400
        salvar_auto = data.get('salvar_auto', True)
        info_qr = extrair_dados_qrcode(imagem_base64)
        if not info_qr:
            return jsonify({'sucesso': False, 'erro': 'Não foi possível ler o QR Code',
                            'dicas': ['QR visível?','Foto nítida?','QR amassado?','Cartão do sistema?']}), 404
        aluno_id = info_qr.get('aluno_id'); prova_id = info_qr.get('prova_id')
        if not aluno_id or not prova_id:
            return jsonify({'sucesso': False, 'erro': 'QR sem dados de aluno/prova'}), 400
        try: escola_sessao = get_escola_id()
        except PermissionError as e: return jsonify({'erro': str(e)}), 403
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Banco indisponível'}), 503
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT p.*, a.nome AS aluno_nome, a.escola_id AS aluno_escola_id,
            t.serie AS turma_serie, t.nome AS turma_nome, e.nome AS escola_nome
            FROM provas p LEFT JOIN alunos a ON a.id = %s
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id WHERE p.id = %s""", (aluno_id, prova_id))
        dados = cur.fetchone(); cur.close()
        if not dados:
            return jsonify({'sucesso': False, 'erro': f'Prova {prova_id} ou aluno {aluno_id} não encontrados'}), 404
        if escola_sessao is not None and dados.get('aluno_escola_id') != escola_sessao:
            return jsonify({'sucesso': False, 'erro': 'Acesso negado a este aluno'}), 403
        gab = dados.get('gabarito', [])
        if not gab: return jsonify({'sucesso': False, 'erro': 'Sem gabarito'}), 400
        tipo_q = dados.get('tipo_questoes') or 4
        if isinstance(tipo_q, str):
            try: tipo_q = int(tipo_q)
            except: tipo_q = 4
        valor_nota = dados.get('valor_nota') or 10
        if not validar_gabarito(gab, tipo_q):
            return jsonify({'sucesso': False, 'erro': 'Gabarito inválido'}), 400
        padrao = gerar_padrao_gabarito(gab, tipo_q)
        nome = dados.get('aluno_nome') or 'Aluno'
        serie = dados.get('turma_serie') or dados.get('serie') or '1º Ano'
        bncc_gab = dados.get('bncc', [])
        disciplina = dados.get('disciplina', '')
        titulo = dados.get('titulo', '')
        escola_nome_bd = dados.get('escola_nome', '')
        turma_nome_bd = dados.get('turma_nome', '')
        conn.close(); conn = None
        resultado = corrigir_com_gemini_com_padrao(
            imagem_base64, padrao, nome, serie, tipo_q, disciplina,
            bncc=bncc_gab, prova_id=prova_id, aluno_id=aluno_id, valor_nota=valor_nota)
        if resultado.get('erro'):
            return jsonify({'sucesso': False, 'erro': resultado['erro'],
                            'aluno': nome, 'prova': titulo}), 400
        tipo_av = identificar_disciplina(titulo, disciplina, serie)
        if not resultado.get('confianca_por_questao'):
            total = resultado.get('total', 20)
            resultado['confianca_por_questao'] = [70] * total
            resultado['confianca'] = 70
        if salvar_auto:
            try:
                conn = get_db_connection()
                if conn:
                    cur = conn.cursor()
                    qs = resultado.get('questoes_status', [])
                    for i, q in enumerate(qs):
                        q['bncc'] = bncc_gab[i] if i < len(bncc_gab) and bncc_gab[i] else ''
                    qs_json = json.dumps(qs)
                    resp = resultado.get('respostas_detectadas', [])
                    cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s", (prova_id, aluno_id))
                    if cur.fetchone():
                        cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s,
                            nota=%s, total=%s, tipo_correcao=%s, disciplina=%s, tipo_avaliacao=%s,
                            questoes_status=%s::jsonb, confianca=%s, confianca_por_questao=%s::jsonb,
                            bncc=%s::text[], data_correcao=CURRENT_TIMESTAMP
                            WHERE prova_id=%s AND aluno_id=%s""",
                            (resp, resultado.get('acertos',0), resultado.get('nota',0),
                             resultado.get('total',0), resultado.get('modo','ia'),
                             disciplina, tipo_av, qs_json, resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])),
                             bncc_gab, prova_id, aluno_id))
                    else:
                        cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas,
                            acertos, nota, total, tipo_correcao, disciplina, tipo_avaliacao,
                            questoes_status, confianca, confianca_por_questao, bncc)
                            VALUES (%s,%s,%s::text[],%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s::text[])""",
                            (prova_id, aluno_id, resp, resultado.get('acertos',0),
                             resultado.get('nota',0), resultado.get('total',0),
                             resultado.get('modo','ia'), disciplina, tipo_av, qs_json,
                             resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])), bncc_gab))
                    conn.commit(); cur.close()
            except Exception as e:
                logging.error(f"⚠️ Salvar auto: {e}")
            finally:
                if conn:
                    try: conn.close()
                    except: pass
                    conn = None
        resultado.update({'sucesso': True, 'qr_lido': info_qr, 'aluno': nome,
                          'aluno_id': aluno_id, 'prova_id': prova_id, 'prova_titulo': titulo,
                          'escola_nome': escola_nome_bd, 'turma_nome': turma_nome_bd,
                          'tipo_avaliacao': tipo_av, 'disciplina': disciplina, 'bncc': bncc_gab,
                          'escola_id': info_qr.get('escola_id'), 'turma_id': info_qr.get('turma_id'),
                          'serie': serie})
        return jsonify(resultado)
    except Exception as e:
        logging.error(f"❌ automático: {e}"); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500
    finally:
        if conn:
            try: conn.close()
            except: pass