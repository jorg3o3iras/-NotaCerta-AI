# ============================================================
# APP.PY — Monolítico v6 (login + isolamento por escola)
# ============================================================

from flask import Flask, request, jsonify, send_from_directory, send_file, g, has_request_context
from flask_cors import CORS
import cv2
cv2.setNumThreads(1)
import numpy as np
import base64
import json
import io
import csv
import re
from datetime import datetime
import os
from PIL import Image
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from psycopg2 import extensions
import random
import traceback
from dotenv import load_dotenv
import logging
import zipfile
import hashlib
import hmac
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
from flask_compress import Compress
Compress(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

CORRECOES_CACHE_TTL_HORAS = 168


# ============================================
# CONTEXTO DE USUÁRIO (login via header)
# ============================================

def get_usuario_atual():
    """Retorna {id, nome, username, perfil, ativo, escola_id, escola_nome} ou None.
    Cacheia em flask.g para não consultar 2x na mesma request."""
    if not has_request_context():
        return None
    if hasattr(g, '_usuario_atual'):
        return g._usuario_atual

    username = (request.headers.get('X-Usuario-Username') or '').strip()
    if not username:
        g._usuario_atual = None
        return None

    try:
        conn = get_db_connection()
        if conn:
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT u.id, u.nome, u.username, u.perfil, u.ativo,
                           u.escola_id, e.nome AS escola_nome
                    FROM usuarios u
                    LEFT JOIN escolas e ON e.id = u.escola_id
                    WHERE u.username = %s
                """, (username,))
                row = cur.fetchone()
                cur.close()
                if row:
                    d = dict(row)
                    d['ativo'] = bool(d.get('ativo'))
                    g._usuario_atual = d
                    return d
            finally:
                try: conn.close()
                except: pass
    except Exception as e:
        logging.warning("get_usuario_atual erro: %s", e)

    if username in USUARIOS_FIXOS:
        d = USUARIOS_FIXOS[username]
        g._usuario_atual = {
            'id': 0, 'nome': d['nome'], 'username': username,
            'perfil': d['perfil'], 'ativo': True,
            'escola_id': d.get('escola_id'), 'escola_nome': None,
        }
        return g._usuario_atual

    g._usuario_atual = None
    return None


def get_escola_id():
    """Escola do usuário logado:
    - Sem header → None (compatibilidade)
    - Admin → None (vê tudo)
    - Usuário comum com escola → int
    - Usuário comum sem escola → PermissionError
    """
    u = get_usuario_atual()
    if not u:
        return None
    if not u.get('ativo', True):
        raise PermissionError('Usuário inativo')
    if u.get('perfil') == 'admin':
        return None
    eid = u.get('escola_id')
    if not eid:
        raise PermissionError(
            'Usuário não possui escola vinculada. Contate o administrador.'
        )
    return int(eid)


def is_admin():
    u = get_usuario_atual()
    return bool(u and u.get('perfil') == 'admin')


def _bloqueia_nao_admin():
    """Retorna jsonify(403) se não admin; caso contrário, None."""
    u = get_usuario_atual()
    if u and u.get('perfil') != 'admin':
        return jsonify({'erro': 'Apenas administradores podem executar esta ação'}), 403
    return None


def _validar_aluno_da_escola(cur, aluno_id):
    """Retorna (ok, aluno_row, err, status). Aluno precisa ser da escola da sessão."""
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return False, None, str(e), 403
    cur.execute("SELECT id, escola_id, turma_id, nome FROM alunos WHERE id = %s", (aluno_id,))
    aluno = cur.fetchone()
    if not aluno:
        return False, None, 'Aluno não encontrado', 404
    if escola_sessao is not None and aluno['escola_id'] != escola_sessao:
        return False, None, 'Acesso negado a este aluno', 403
    return True, aluno, None, 200


# ============================================
# CACHE PERSISTENTE
# ============================================

def init_cache_table():
    conn = get_db_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS correcoes_cache (
                id SERIAL PRIMARY KEY,
                chave_hash TEXT NOT NULL,
                resultado JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_correcoes_cache_hash ON correcoes_cache(chave_hash, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_correcoes_cache_created ON correcoes_cache(created_at DESC)")
        conn.commit(); cur.close(); conn.close()
        logging.info("✅ Tabela de cache de correções pronta")
    except Exception as e:
        logging.warning(f"⚠️ Erro cache: {e}")


def get_cache_key(imagem_hash, prova_id, aluno_id):
    return f"{imagem_hash}_{prova_id}_{aluno_id}"


def get_cache_correcao(chave):
    conn = get_db_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT resultado FROM correcoes_cache
            WHERE chave_hash = %s AND created_at > NOW() - make_interval(hours => %s)
            ORDER BY created_at DESC LIMIT 1
        """, (chave, CORRECOES_CACHE_TTL_HORAS))
        row = cur.fetchone(); cur.close(); conn.close()
        if row:
            return row['resultado'] if isinstance(row['resultado'], dict) else json.loads(row['resultado'])
        return None
    except Exception as e:
        logging.warning(f"⚠️ Erro cache get: {e}")
        return None


def set_cache_correcao(chave, resultado):
    conn = get_db_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO correcoes_cache (chave_hash, resultado) VALUES (%s, %s::jsonb)",
                    (chave, json.dumps(resultado, default=str)))
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        logging.warning(f"⚠️ Erro cache set: {e}")


def limpar_cache_antigo():
    conn = get_db_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM correcoes_cache WHERE created_at < NOW() - make_interval(hours => %s)",
                    (CORRECOES_CACHE_TTL_HORAS,))
        removidas = cur.rowcount
        conn.commit(); cur.close(); conn.close()
        if removidas > 0:
            logging.info(f"🧹 Cache antigo limpo: {removidas}")
    except Exception as e:
        logging.warning(f"⚠️ Erro limpar cache: {e}")


# ============================================
# OPENAI / RELAY / PYZBAR
# ============================================

OPENAI_AVAILABLE = False
openai_client = None
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

try:
    from openai import OpenAI
    if OPENAI_API_KEY and OPENAI_API_KEY.startswith('sk-'):
        try:
            openai_client = OpenAI(api_key=OPENAI_API_KEY)
            OPENAI_AVAILABLE = True
            print("✅ OpenAI configurado!")
            print(f"📌 Modelo: {OPENAI_MODEL}")
        except Exception as e:
            print(f"⚠️ Erro OpenAI: {e}")
            OPENAI_AVAILABLE = False
    else:
        print("⚠️ OPENAI_API_KEY inválida")
except ImportError as e:
    print(f"❌ openai não instalado: {e}")
    OPENAI_AVAILABLE = False
except Exception as e:
    print(f"⚠️ Erro: {e}")
    OPENAI_AVAILABLE = False

RELAY_AVAILABLE = False
RELAY_API_URL = os.getenv('RELAY_API_URL', '')
RELAY_API_KEY = os.getenv('RELAY_API_KEY', '')
RELAY_MODEL = os.getenv('RELAY_MODEL', 'gemini-1.5-flash')
if RELAY_API_URL:
    RELAY_AVAILABLE = True
    print("✅ RelayFreeLLM configurado!")

PYZBAR_AVAILABLE = False
try:
    from pyzbar.pyzbar import decode as _pyzbar_decode
    PYZBAR_AVAILABLE = True
    print("✅ pyzbar disponível")
except ImportError:
    print("⚠️ pyzbar não instalado")


# ============================================
# DB POOL
# ============================================

SUPABASE_URL = os.getenv('SUPABASE_URL')
DB_POOL = None
DB_POOL_MIN = int(os.getenv('DB_POOL_MIN', '5'))
DB_POOL_MAX = int(os.getenv('DB_POOL_MAX', '30'))
if not SUPABASE_URL:
    print("❌ SUPABASE_URL não definida")


class PooledConnection:
    __slots__ = ('_conn', '_pool', '_closed')
    def __init__(self, conn, pool):
        self._conn = conn; self._pool = pool; self._closed = False
    def __getattr__(self, name):
        return getattr(self._conn, name)
    def close(self):
        if self._closed: return
        self._closed = True
        try:
            if self._conn.status != extensions.STATUS_READY:
                try: self._conn.rollback()
                except: pass
        finally:
            try: self._pool.putconn(self._conn)
            except:
                try: self._conn.close()
                except: pass


def _get_pool():
    global DB_POOL
    if DB_POOL is not None: return DB_POOL
    if not SUPABASE_URL: return None
    try:
        DB_POOL = ThreadedConnectionPool(
            minconn=DB_POOL_MIN, maxconn=DB_POOL_MAX, dsn=SUPABASE_URL,
            connect_timeout=8, keepalives=1, keepalives_idle=30,
            keepalives_interval=10, keepalives_count=3
        )
        logging.info("✅ Pool PostgreSQL: %s-%s", DB_POOL_MIN, DB_POOL_MAX)
        return DB_POOL
    except Exception as e:
        logging.error("❌ Erro pool: %s", e)
        DB_POOL = None
        return None


def get_db_connection():
    pool = _get_pool()
    if not pool: return None
    try:
        conn = pool.getconn()
        if conn.closed:
            pool.putconn(conn, close=True); conn = pool.getconn()
        return PooledConnection(conn, pool)
    except Exception as e:
        logging.error("❌ Erro getconn: %s", e)
        return None


# ============================================
# USUÁRIOS FIXOS (DEV)
# ============================================

USUARIOS_FIXOS = {
    'admin': {'senha': 'admin', 'perfil': 'admin', 'nome': 'Administrador', 'escola_id': None},
    'usuario': {'senha': '123', 'perfil': 'usuario', 'nome': 'Usuário', 'escola_id': None},
    'professor1': {'senha': '123', 'perfil': 'usuario', 'nome': 'Professor 1', 'escola_id': None}
}


# ============================================
# HELPERS DE CORREÇÃO
# ============================================

def calcular_conceito(porcentagem):
    if porcentagem <= 40:
        return {'nome': 'inicial', 'rotulo': '🔴 Inicial', 'faixa': 'até 40%', 'cor': '#ef4444', 'badge': 'badge-conceito-inicial'}
    elif porcentagem <= 60:
        return {'nome': 'basico', 'rotulo': '🟠 Básico', 'faixa': '41% - 60%', 'cor': '#f59e0b', 'badge': 'badge-conceito-basico'}
    elif porcentagem <= 80:
        return {'nome': 'proficiente', 'rotulo': '🔵 Proficiente', 'faixa': '61% - 80%', 'cor': '#3b82f6', 'badge': 'badge-conceito-proficiente'}
    else:
        return {'nome': 'avancado', 'rotulo': '🟢 Avançado', 'faixa': 'acima de 80%', 'cor': '#10b981', 'badge': 'badge-conceito-avancado'}


def identificar_disciplina(prova_titulo, disciplina, serie):
    disciplina_lower = (disciplina or '').lower().strip()
    if re.search(r'\bportugu[êe]s\b', disciplina_lower) or 'língua' in disciplina_lower: return 'Portugues'
    if re.search(r'\bmatem[áa]tica\b', disciplina_lower): return 'Matematica'
    if re.search(r'\bprodu[cç][ãa]o\b', disciplina_lower) or 'texto' in disciplina_lower or 'redação' in disciplina_lower or 'redacao' in disciplina_lower: return 'Producao'
    if re.search(r'\bch\b', disciplina_lower) or 'ciencias humanas' in disciplina_lower: return 'CH'
    if re.search(r'\bcn\b', disciplina_lower) or 'ciencias naturais' in disciplina_lower: return 'CN'
    texto = f"{prova_titulo or ''}".lower()
    if re.search(r'\bportugu[êe]s\b', texto) or 'língua' in texto: return 'Portugues'
    if re.search(r'\bmatem[áa]tica\b', texto) or re.search(r'\bmat\b', texto): return 'Matematica'
    if re.search(r'\bprodu[cç][ãa]o\b', texto) or 'texto' in texto or 'redação' in texto or 'redacao' in texto: return 'Producao'
    if re.search(r'\bch\b', texto) or 'ciencias humanas' in texto: return 'CH'
    if re.search(r'\bcn\b', texto) or 'ciencias naturais' in texto: return 'CN'
    if serie:
        serie_num = re.search(r'(\d+)', serie)
        if serie_num:
            num = int(serie_num.group(1))
            return 'Portugues' if num <= 5 else 'Matematica'
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
            'alternativas': alternativas,
            'posicao': i + 1
        })
    return padrao


def validar_gabarito(gabarito, tipo_questoes=4):
    if not gabarito or len(gabarito) == 0: return False
    try: tipo = int(tipo_questoes)
    except: tipo = 4
    tipo = max(3, min(tipo, 5))
    alternativas_validas = ['A', 'B', 'C', 'D', 'E'][:tipo]
    for g in gabarito:
        if not g or str(g).strip() == '': return False
        if str(g).upper().strip() not in alternativas_validas: return False
    return True


def validar_respostas(respostas, gabarito, alternativas):
    validas = []
    for i, resp in enumerate(respostas):
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


def calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina, tipo_questoes, modo, circulos=None, bncc=None, confiancas=None):
    alternativas = ['A', 'B', 'C', 'D', 'E'][:tipo_questoes]
    acertos = 0; correcoes = []; questoes_status = []
    logging.info(f"🔍 CORREÇÃO ({modo}) GAB={gabarito} RESP={respostas}")
    for i in range(len(gabarito)):
        resp = respostas[i] if i < len(respostas) else ''
        gab = gabarito[i] if i < len(gabarito) else ''
        gab_normalizado = str(gab).strip().upper() if gab else ''
        confianca_q = int(confiancas[i]) if (confiancas and i < len(confiancas)) else 80
        codigo_bncc = bncc[i] if (bncc and i < len(bncc) and bncc[i]) else ''
        is_valida = resp in alternativas
        is_correto = is_valida and gab_normalizado and resp == gab_normalizado
        if is_correto: acertos += 1
        if is_correto: status_msg, icone = 'ADQUIRIU HABILIDADE ✅', '✅'
        elif is_valida: status_msg, icone = 'RECOMPOSIÇÃO DE APRENDIZAGEM ❌', '❌'
        else: status_msg, icone = 'NÃO RESPONDEU —', '—'
        correcoes.append({'questao': i+1, 'resposta': resp if resp else '—',
                          'gabarito': gab_normalizado if gab_normalizado else '—',
                          'correto': is_correto, 'status': status_msg,
                          'confianca': confianca_q if is_valida else 50, 'bncc': codigo_bncc})
        questoes_status.append({'numero': i+1, 'resposta': resp if resp else '—',
                                'gabarito': gab_normalizado if gab_normalizado else '—',
                                'acertou': is_correto, 'status': status_msg,
                                'status_texto': f"{icone} {status_msg}",
                                'confianca': confianca_q if is_valida else 50,
                                'correta': is_correto, 'bncc': codigo_bncc})
    vq = 10 / len(gabarito) if len(gabarito) > 0 else 0
    nota = acertos * vq
    pct = round((acertos / len(gabarito)) * 100) if len(gabarito) > 0 else 0
    conceito = calcular_conceito(pct)
    conf_media = int(sum(confiancas) / len(confiancas)) if confiancas else 70
    suspeitas = [i + 1 for i, c in enumerate(confiancas) if c < 50] if confiancas else []
    return {
        'aluno': aluno_nome, 'serie': serie, 'disciplina': disciplina,
        'total': len(gabarito), 'acertos': acertos, 'nota': round(nota, 1),
        'porcentagem': pct, 'conceito': conceito,
        'respostas_detectadas': respostas, 'gabarito': gabarito,
        'correcoes': correcoes, 'questoes_status': questoes_status,
        'tipo_questoes': str(tipo_questoes), 'confianca': conf_media,
        'confianca_por_questao': confiancas if confiancas else [80 if r in alternativas else 50 for r in respostas],
        'modo': modo, 'valor_por_questao': round(vq, 2),
        'circulos_detectados': len(circulos) if circulos else 0,
        'questoes_ia': 0, 'bncc': bncc if bncc else [],
        'requer_revisao_manual': len(suspeitas) > 0 or conf_media < 60,
        'questoes_suspeitas': suspeitas
    }


def erro_correcao(aluno_nome, serie, disciplina, erro_msg):
    conceito = calcular_conceito(0)
    return {'erro': erro_msg, 'aluno': aluno_nome, 'serie': serie,
            'disciplina': disciplina, 'total': 0, 'acertos': 0, 'nota': 0,
            'porcentagem': 0, 'conceito': conceito,
            'respostas_detectadas': [], 'gabarito': [], 'correcoes': [],
            'questoes_status': [], 'tipo_questoes': '4', 'confianca': 0,
            'confianca_por_questao': [], 'modo': 'erro', 'valor_por_questao': 0,
            'bncc': [], 'requer_revisao_manual': False, 'questoes_suspeitas': []}


# ============================================
# EVALBEE v4
# ============================================

def detectar_marcadores_fiduciais_v4(gray):
    try:
        h, w = gray.shape
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        binaria = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 41, 10)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        binaria = cv2.morphologyEx(binaria, cv2.MORPH_CLOSE, kernel)
        contornos, _ = cv2.findContours(binaria, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        area_img = w * h
        candidatos = []
        for c in contornos:
            area = cv2.contourArea(c)
            if not (area_img * 0.0005 < area < area_img * 0.03): continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) != 4: continue
            x, y, bw, bh = cv2.boundingRect(approx)
            ar = bw / float(bh) if bh > 0 else 0
            if not (0.75 < ar < 1.35): continue
            hull = cv2.convexHull(c)
            solidez = area / (cv2.contourArea(hull) + 1e-6)
            if solidez < 0.80: continue
            candidatos.append((x, y, bw, bh, area, approx))
        if len(candidatos) < 4: return None
        cx, cy = w / 2, h / 2

        def score_dist(c, canto):
            x, y, bw, bh, _, _ = c
            ccx, ccy = x + bw // 2, y + bh // 2
            if canto == 'tl': return ccx + ccy
            if canto == 'tr': return (w - ccx) + ccy
            if canto == 'bl': return ccx + (h - ccy)
            if canto == 'br': return (w - ccx) + (h - ccy)
            return 0

        quadrantes = {'tl': [], 'tr': [], 'bl': [], 'br': []}
        for c in candidatos:
            x, y, bw, bh, _, _ = c
            ccx, ccy = x + bw // 2, y + bh // 2
            if ccx < cx and ccy < cy: quadrantes['tl'].append(c)
            elif ccx >= cx and ccy < cy: quadrantes['tr'].append(c)
            elif ccx < cx and ccy >= cy: quadrantes['bl'].append(c)
            else: quadrantes['br'].append(c)
        melhor = {}
        for k in ['tl', 'tr', 'bl', 'br']:
            if not quadrantes[k]: return None
            quadrantes[k].sort(key=lambda c: score_dist(c, k))
            melhor[k] = quadrantes[k][0]
        return {
            'tl': (melhor['tl'][0] + melhor['tl'][2]//2, melhor['tl'][1] + melhor['tl'][3]//2),
            'tr': (melhor['tr'][0] + melhor['tr'][2]//2, melhor['tr'][1] + melhor['tr'][3]//2),
            'bl': (melhor['bl'][0] + melhor['bl'][2]//2, melhor['bl'][1] + melhor['bl'][3]//2),
            'br': (melhor['br'][0] + melhor['br'][2]//2, melhor['br'][1] + melhor['br'][3]//2),
        }
    except Exception as e:
        logging.error(f"❌ Fiducial: {e}")
        return None


def corrigir_perspectiva(img, marcadores):
    try:
        tl, tr, bl, br = marcadores['tl'], marcadores['tr'], marcadores['bl'], marcadores['br']
        larg_topo = np.linalg.norm(np.array(tr) - np.array(tl))
        larg_base = np.linalg.norm(np.array(br) - np.array(bl))
        alt_esq = np.linalg.norm(np.array(bl) - np.array(tl))
        alt_dir = np.linalg.norm(np.array(br) - np.array(tr))
        larg_max = int(max(larg_topo, larg_base))
        alt_max = int(max(alt_esq, alt_dir))
        origem = np.float32([tl, tr, bl, br])
        destino = np.float32([[0, 0], [larg_max-1, 0], [0, alt_max-1], [larg_max-1, alt_max-1]])
        M = cv2.getPerspectiveTransform(origem, destino)
        return cv2.warpPerspective(img, M, (larg_max, alt_max))
    except Exception as e:
        logging.error(f"❌ Perspectiva: {e}")
        return img


# ============================================
# TEMPLATE MAPPING
# ============================================

def gerar_mapa_template_padrao(total_questoes, alternativas, num_colunas):
    mapa = []
    A4_W, A4_H = 210.0, 297.0
    MARCADOR_SIZE = 10.0
    MARCADOR_MARGIN = 15.0
    IMG_ORIGIN_X = MARCADOR_MARGIN + MARCADOR_SIZE / 2
    IMG_ORIGIN_Y = MARCADOR_MARGIN + MARCADOR_SIZE / 2
    IMG_RANGE_X = A4_W - 2 * IMG_ORIGIN_X
    IMG_RANGE_Y = A4_H - 2 * IMG_ORIGIN_Y
    AREA_LEFT = MARCADOR_MARGIN + MARCADOR_SIZE + 2
    AREA_TOP = MARCADOR_MARGIN + MARCADOR_SIZE + 2
    AREA_RIGHT = A4_W - MARCADOR_MARGIN - 2
    AREA_BOTTOM = A4_H - MARCADOR_MARGIN - 2
    AREA_WIDTH = AREA_RIGHT - AREA_LEFT
    HEADER_HEIGHT = 52.0
    QUESTOES_TOP = AREA_TOP + HEADER_HEIGHT
    QUESTOES_HEIGHT = AREA_BOTTOM - QUESTOES_TOP
    QUESTOES_PADDING = 5.0
    QUESTOES_INNER_TOP = QUESTOES_TOP + QUESTOES_PADDING
    QUESTOES_INNER_HEIGHT = QUESTOES_HEIGHT - 2 * QUESTOES_PADDING
    if total_questoes <= 12:
        num_colunas, q_por_coluna = 1, total_questoes
    elif total_questoes <= 26:
        num_colunas = 2; q_por_coluna = (total_questoes + 1) // 2
    else:
        num_colunas, q_por_coluna = 2, 18
    num_alts = len(alternativas)
    GAP_COLUNA = 8.0
    col_width = (AREA_WIDTH - GAP_COLUNA * (num_colunas - 1)) / num_colunas
    NUM_WIDTH, NUM_GAP = 10.0, 2.0
    ALT_LEFT_OFFSET = NUM_WIDTH + NUM_GAP + 2
    for col in range(num_colunas):
        inicio = col * q_por_coluna
        fim = min(inicio + q_por_coluna, total_questoes)
        n_col = fim - inicio
        if n_col <= 0: continue
        col_left = AREA_LEFT + col * (col_width + GAP_COLUNA)
        col_right = col_left + col_width
        alt_left = col_left + ALT_LEFT_OFFSET
        alt_right = col_right - 1
        alt_width = alt_right - alt_left
        espacamento_bolha = alt_width / num_alts
        espaco_linha = QUESTOES_INNER_HEIGHT / n_col
        for i in range(n_col):
            num_questao = inicio + i + 1
            y_centro = QUESTOES_INNER_TOP + (i + 0.5) * espaco_linha
            for j, letra in enumerate(alternativas):
                x_centro = alt_left + (j + 0.5) * espacamento_bolha
                x_norm = (x_centro - IMG_ORIGIN_X) / IMG_RANGE_X
                y_norm = (y_centro - IMG_ORIGIN_Y) / IMG_RANGE_Y
                mapa.append({'questao': num_questao, 'alternativa': letra,
                             'x': round(x_norm, 5), 'y': round(y_norm, 5),
                             'x_mm': round(x_centro, 2), 'y_mm': round(y_centro, 2)})
    return mapa


def salvar_mapa_template(prova_id, aluno_id, tipo_questoes, quantidade_questoes, num_colunas, mapa_template):
    try:
        conn = get_db_connection()
        if not conn: return False
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cartoes_template 
            (prova_id, aluno_id, tipo_questoes, quantidade_questoes, num_colunas, mapa_template)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (prova_id, aluno_id) 
            DO UPDATE SET mapa_template = EXCLUDED.mapa_template,
                tipo_questoes = EXCLUDED.tipo_questoes,
                quantidade_questoes = EXCLUDED.quantidade_questoes,
                num_colunas = EXCLUDED.num_colunas,
                created_at = CURRENT_TIMESTAMP
        """, (prova_id, aluno_id, tipo_questoes, quantidade_questoes,
              num_colunas, json.dumps(mapa_template)))
        conn.commit(); cur.close(); conn.close()
        return True
    except Exception as e:
        logging.error(f"❌ Salvar mapa: {e}")
        return False


def carregar_mapa_template(prova_id, aluno_id):
    try:
        conn = get_db_connection()
        if not conn: return None
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT mapa_template FROM cartoes_template WHERE prova_id = %s AND aluno_id = %s LIMIT 1",
                    (prova_id, aluno_id))
        row = cur.fetchone(); cur.close(); conn.close()
        if row and row['mapa_template']:
            mapa = row['mapa_template']
            return json.loads(mapa) if isinstance(mapa, str) else mapa
        return None
    except Exception as e:
        logging.warning(f"⚠️ Load mapa: {e}")
        return None


def corrigir_por_template_evalbee_v2(img_corrigida, mapa_template, alternativas, debug=False):
    try:
        h, w = img_corrigida.shape[:2]
        gray = cv2.cvtColor(img_corrigida, cv2.COLOR_BGR2GRAY)
        binaria = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 12)
        por_questao = defaultdict(list)
        for b in mapa_template: por_questao[b['questao']].append(b)
        respostas, confiancas = [], []
        for q_num in sorted(por_questao.keys()):
            bolhas_q = sorted(por_questao[q_num], key=lambda b: b['x'])
            ratios = []
            for b in bolhas_q:
                cx = int(b['x'] * w); cy = int(b['y'] * h)
                r = max(6, int(min(w, h) * 0.018))
                if cx - r < 0 or cy - r < 0 or cx + r >= w or cy + r >= h:
                    ratios.append(0.0); continue
                mask = np.zeros((h, w), dtype=np.uint8)
                cv2.circle(mask, (cx, cy), r, 255, -1)
                total = cv2.countNonZero(mask)
                if total == 0: ratios.append(0.0); continue
                preto = cv2.countNonZero(cv2.bitwise_and(binaria, binaria, mask=mask))
                ratios.append(preto / total)
            if not ratios:
                respostas.append(''); confiancas.append(0); continue
            idx_max = int(np.argmax(ratios))
            max_ratio = ratios[idx_max]
            sorted_r = sorted(ratios, reverse=True)
            separacao = (sorted_r[0] - sorted_r[1]) if len(sorted_r) > 1 else 1.0
            num_alts = len(alternativas)
            LIMIAR_MIN = 0.30 if num_alts == 4 else 0.28
            LIMIAR_CONFIRMA = 0.45 if num_alts == 4 else 0.40
            if max_ratio < LIMIAR_MIN:
                respostas.append(''); confiancas.append(15)
            else:
                letra = bolhas_q[idx_max]['alternativa']
                respostas.append(letra)
                if max_ratio > LIMIAR_CONFIRMA and separacao > 0.25: conf = 96
                elif max_ratio > 0.35 and separacao > 0.15: conf = 82
                elif separacao > 0.08: conf = 68
                else: conf = 50
                confiancas.append(conf)
        return respostas, confiancas
    except Exception as e:
        logging.error(f"❌ EvalBee v2: {e}")
        return [], []


def preparar_imagem_para_template(imagem_base64):
    try:
        raw = imagem_base64
        if isinstance(raw, tuple): raw = raw[0]
        if not raw: return None, False
        if ',' in raw and raw.strip().startswith('data:'):
            raw = raw.split(',', 1)[1]
        raw = raw.strip().replace('\n', '').replace('\r', '').replace(' ', '')
        try: image_data = base64.b64decode(raw, validate=False)
        except: return None, False
        np_arr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None: return None, False
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        marcadores = detectar_marcadores_fiduciais_v4(gray)
        if not marcadores: return None, False
        img_corr = corrigir_perspectiva(img, marcadores)
        h, w = img_corr.shape[:2]
        TARGET_H = 1800
        if h > TARGET_H:
            scale = TARGET_H / h
            img_corr = cv2.resize(img_corr, (int(w*scale), TARGET_H), interpolation=cv2.INTER_AREA)
        return img_corr, True
    except Exception as e:
        logging.error(f"❌ Prep template: {e}")
        return None, False


def corrigir_com_template_mapping(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                   tipo_questoes=4, disciplina='', bncc=None,
                                   mapa_template=None, prova_id=None, aluno_id=None):
    total_questoes = padrao_gabarito['total_questoes']
    alternativas = padrao_gabarito['alternativas']
    if not mapa_template and prova_id and aluno_id:
        mapa_template = carregar_mapa_template(prova_id, aluno_id)
    if not mapa_template:
        num_colunas = 1 if total_questoes <= 12 else 2
        mapa_template = gerar_mapa_template_padrao(total_questoes, alternativas, num_colunas)
    img_corr, ok = preparar_imagem_para_template(imagem_base64)
    if not ok: return None
    respostas, confiancas = corrigir_por_template_evalbee_v2(img_corr, mapa_template, alternativas)
    if not respostas: return None
    return {'respostas': respostas,
            'confiancas': confiancas if confiancas else [70] * len(respostas),
            'metodo': 'evalbee_v4'}


def preprocessar_imagem_para_ia(imagem_base64):
    try:
        raw = imagem_base64
        if isinstance(raw, tuple): raw = raw[0]
        if not raw or not isinstance(raw, str): return '', 'image/jpeg'
        if ',' in raw and raw.strip().startswith('data:'):
            raw = raw.split(',', 1)[1]
        raw = raw.strip().replace('\n', '').replace('\r', '').replace(' ', '')
        try: image_data = base64.b64decode(raw, validate=False)
        except: return '', 'image/jpeg'
        np_array = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
        if img is None:
            try:
                from PIL import Image as PILImage
                pil_img = PILImage.open(io.BytesIO(image_data))
                if pil_img.mode != 'RGB': pil_img = pil_img.convert('RGB')
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
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
    aviso_bloco = f"\n⚠️ ERRO NA TENTATIVA ANTERIOR: {aviso_extra}\nOlhe a imagem com MUITO mais atenção.\n" if aviso_extra else ""
    return f"""Você é um sistema OMR profissional. Analise a foto de um cartão-resposta e identifique QUAL bolha está preenchida em CADA uma das {total} questões.

O cartão tem 4 marcadores pretos nos cantos. Entre eles há uma grade com EXATAMENTE {total} linhas numeradas (01 a {total:02d}). Cada linha tem {num_alts} bolhas: {alternativas_str}. A bolha MARCADA tem o INTERIOR ESCURO. A bolha NÃO MARCADA tem o INTERIOR BRANCO.

REGRA CRÍTICA: se você NÃO TEM CERTEZA ABSOLUTA, retorne null. NUNCA chute.

Formato JSON:
{{"respostas": ["B", null, "C", ...], "confianca_por_questao": [95, 0, 90, ...]}}

- "respostas" tem EXATAMENTE {total} itens (letra ou null)
- "confianca_por_questao" tem {total} números de 0 a 100
- null → confiança 0

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
    alts_upper = [a.upper() for a in alternativas]
    normalizadas = []
    for r in respostas:
        if r is None: normalizadas.append(''); continue
        if isinstance(r, str) and r.strip().lower() in ('null', 'none', 'n/a', ''):
            normalizadas.append(''); continue
        s = str(r).strip().upper()
        s = re.sub(r'^[\(\[]*', '', s); s = re.sub(r'[\)\]\.\,\;\:\-\s]*$', '', s).strip()
        if not s: normalizadas.append(''); continue
        if s in alts_upper: normalizadas.append(s); continue
        for alt in alts_upper:
            if s == alt or s.startswith(alt + ')') or s.startswith(alt + '.'):
                normalizadas.append(alt); break
        else:
            encontradas = [alt for alt in alts_upper if alt in s]
            normalizadas.append(encontradas[0] if len(encontradas) == 1 else '')
    while len(normalizadas) < total_esperado: normalizadas.append('')
    return normalizadas[:total_esperado]


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
    nao_vazias = [r for r in respostas if r]
    if not nao_vazias: return True, "Nenhuma"
    if len(nao_vazias) >= 5 and len(set(nao_vazias)) == 1:
        return True, f"Todas são '{nao_vazias[0]}'"
    if len(nao_vazias) >= 6:
        contagem = Counter(nao_vazias)
        letra, qtd = contagem.most_common(1)[0]
        if qtd / len(nao_vazias) >= 0.85:
            return True, f"{qtd}/{len(nao_vazias)} são '{letra}'"
    if gabarito and len(gabarito) == len(respostas):
        acertos = sum(1 for r, g in zip(respostas, gabarito) if r and g and str(r).upper() == str(g).upper())
        total_validas = sum(1 for r, g in zip(respostas, gabarito) if r and g)
        if total_validas > 0 and acertos / total_validas < 0.15 and total_validas >= 5:
            return True, f"IA acertou apenas {acertos}/{total_validas}"
    return False, ""


def _executar_chamada_openai(data_url, padrao_gabarito, aluno_nome, serie, disciplina, tipo_questoes, aviso_extra=None):
    total = padrao_gabarito['total_questoes']
    alternativas = padrao_gabarito['alternativas']
    prompt = gerar_prompt_otimizado(padrao_gabarito, aluno_nome, serie, disciplina, aviso_extra)
    messages = [
        {"role": "system", "content": "Você é um sistema OMR profissional. Se não tiver CERTEZA ABSOLUTA, retorne null. NUNCA chute. Responda APENAS JSON."},
        {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}}]}
    ]
    for tentativa in range(1, 4):
        try:
            logging.info(f"🤖 OpenAI tentativa {tentativa}/3")
            response = openai_client.chat.completions.create(
                model=OPENAI_MODEL, messages=messages, max_tokens=2000, temperature=0.0
            )
            texto = (response.choices[0].message.content or "").strip()
            if not texto: continue
            respostas = _parse_respostas_ia(texto, total, alternativas)
            if respostas is None: continue
            confs = _parse_confiancas_ia(texto, total)
            if not confs: confs = [85 if r else 0 for r in respostas]
            for i, r in enumerate(respostas):
                if not r: confs[i] = 0
            return respostas, confs, texto
        except Exception as e:
            logging.error(f"❌ OpenAI t{tentativa}: {e}")
            if tentativa < 3:
                import time; time.sleep(2)
    return None, None, None


def corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie, tipo_questoes=4, disciplina='', bncc=None):
    gabarito = padrao_gabarito['gabarito_oficial']
    if not gabarito or len(gabarito) == 0:
        return erro_correcao(aluno_nome, serie, disciplina, 'Gabarito não disponível')
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
            respostas2, confs2, _ = _executar_chamada_openai(data_url, padrao_gabarito, aluno_nome, serie, disciplina, tipo_questoes, aviso_extra=motivo)
            if respostas2 is not None:
                suspeito2, motivo2 = _validar_resposta_ia_contra_gabarito(respostas2, gabarito)
                if not suspeito2:
                    respostas, confs = respostas2, confs2
                else:
                    return erro_correcao(aluno_nome, serie, disciplina, f'IA não conseguiu ler. ({motivo2})')
        detectadas = sum(1 for r in respostas if r)
        if detectadas < total * 0.3:
            return erro_correcao(aluno_nome, serie, disciplina, f'IA detectou apenas {detectadas}/{total}')
        return calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina, tipo_questoes, 'ia', bncc=bncc, confiancas=confs)
    except Exception as e:
        logging.error(f"❌ Fallback IA: {e}")
        return erro_correcao(aluno_nome, serie, disciplina, str(e))


def corrigir_com_gemini_com_padrao(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                     tipo_questoes=4, disciplina='', bncc=None,
                                     mapa_template=None, prova_id=None, aluno_id=None):
    gabarito = padrao_gabarito['gabarito_oficial']
    if not gabarito or len(gabarito) == 0:
        return erro_correcao(aluno_nome, serie, disciplina, 'Gabarito não disponível')
    total = len(gabarito)
    try:
        if not mapa_template and prova_id and aluno_id:
            mapa_template = carregar_mapa_template(prova_id, aluno_id)
        if not mapa_template:
            num_colunas = 1 if total <= 12 else 2
            mapa_template = gerar_mapa_template_padrao(total, padrao_gabarito['alternativas'], num_colunas)
        resultado = corrigir_com_template_mapping(imagem_base64, padrao_gabarito, aluno_nome, serie,
                                                   tipo_questoes, disciplina, bncc, mapa_template,
                                                   prova_id=prova_id, aluno_id=aluno_id)
        if not resultado:
            if OPENAI_AVAILABLE and openai_client is not None:
                return corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie, tipo_questoes, disciplina, bncc)
            return erro_correcao(aluno_nome, serie, disciplina,
                'Não foi possível ler as respostas. Tire foto com boa iluminação e os 4 marcadores visíveis.')
        respostas = resultado['respostas']
        confiancas = resultado['confiancas']
        detectadas = sum(1 for r in respostas if r)
        if detectadas < total * 0.15:
            if OPENAI_AVAILABLE and openai_client is not None:
                r_ia = corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie, tipo_questoes, disciplina, bncc)
                if not r_ia.get('erro'):
                    r_ia['modo'] = 'ia_fallback'
                    return r_ia
            return erro_correcao(aluno_nome, serie, disciplina, f'Detectou {detectadas}/{total}')
        nao_vazias = [r for r in respostas if r]
        if len(nao_vazias) >= 3 and len(set(nao_vazias)) == 1:
            if OPENAI_AVAILABLE and openai_client is not None:
                r_ia = corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie, tipo_questoes, disciplina, bncc)
                if not r_ia.get('erro'):
                    r_ia['modo'] = 'ia_fallback'
                    return r_ia
            return erro_correcao(aluno_nome, serie, disciplina, f'Todas "{nao_vazias[0]}"')
        return calcular_resultado_correcao(respostas, gabarito, aluno_nome, serie, disciplina, tipo_questoes,
                                            'template_evalbee_v4', bncc=bncc, confiancas=confiancas)
    except Exception as e:
        logging.error(f"❌ Erro correção: {e}")
        if OPENAI_AVAILABLE and openai_client is not None:
            return corrigir_com_ia_fallback(imagem_base64, padrao_gabarito, aluno_nome, serie, tipo_questoes, disciplina, bncc)
        return erro_correcao(aluno_nome, serie, disciplina, str(e))
        
# ============================================
# MIDDLEWARE
# ============================================

@app.after_request
def after_request(response):
    """Garante JSON em endpoints /api/, preservando o status HTTP original."""
    if request.path.startswith('/api/') and response.status_code != 200:
        ctype = response.headers.get('Content-Type', '')
        if not ctype.startswith('application/json') and 'text/html' in ctype:
            try:
                original_status = response.status_code
                response = jsonify({
                    'erro': 'Erro interno do servidor',
                    'status': original_status,
                    'detalhes': 'A requisição retornou HTML em vez de JSON'
                })
                response.status_code = original_status  # ✅ preserva 403/404/500
            except Exception:
                pass
    return response


@app.errorhandler(PermissionError)
def handle_permission(e):
    return jsonify({'erro': str(e), 'codigo': 'SEM_ESCOLA'}), 403


# ============================================
# LOGIN
# ============================================

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json or {}
        username = data.get('username') or data.get('usuario')
        senha = data.get('senha')
        if not username or not senha:
            return jsonify({'erro': 'Usuário e senha são obrigatórios'}), 400
        logging.info(f"🔑 Tentativa de login: {username}")

        conn = get_db_connection()
        if conn:
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute("""
                    SELECT u.id, u.nome, u.username, u.senha_hash, u.perfil,
                           u.ativo, u.escola_id, e.nome AS escola_nome
                    FROM usuarios u
                    LEFT JOIN escolas e ON e.id = u.escola_id
                    WHERE u.username = %s
                """, (username,))
                usuario = cur.fetchone()
                cur.close(); conn.close()
                if usuario:
                    if hmac.compare_digest(str(usuario['senha_hash'] or ''), str(senha)) and usuario['ativo']:
                        return jsonify({
                            'sucesso': True,
                            'id': usuario['id'],
                            'perfil': usuario['perfil'],
                            'usuario': usuario['username'],
                            'username': usuario['username'],
                            'nome': usuario['nome'],
                            'escola_id': usuario.get('escola_id'),
                            'escola_nome': usuario.get('escola_nome'),
                        })
            except Exception as e:
                logging.error(f"❌ Erro login DB: {e}")
                traceback.print_exc()

        if username in USUARIOS_FIXOS:
            dados = USUARIOS_FIXOS[username]
            if hmac.compare_digest(str(dados['senha']), str(senha)):
                return jsonify({
                    'sucesso': True, 'id': 0,
                    'perfil': dados['perfil'],
                    'usuario': username, 'username': username,
                    'nome': dados['nome'],
                    'escola_id': dados.get('escola_id'),
                    'escola_nome': None,
                })
        return jsonify({'sucesso': False, 'erro': 'Usuário ou senha incorretos!'}), 401
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/verificar-senha-admin', methods=['POST'])
def verificar_senha_admin():
    """Aceita senha de admin. Fallback: aceita senha de qualquer admin ativo."""
    try:
        data = request.get_json() or {}
        senha = data.get('senha', '').strip()
        username = data.get('username', '').strip()
        if not senha:
            return jsonify({'ok': False, 'erro': 'Senha obrigatória'}), 400

        conn = get_db_connection()
        if conn:
            try:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                # 1) Tenta pelo username enviado
                if username:
                    cur.execute("""
                        SELECT id, username, nome, senha_hash, perfil, ativo
                        FROM usuarios WHERE username = %s
                    """, (username,))
                    u = cur.fetchone()
                    if (u and u.get('ativo') and u.get('perfil') == 'admin'
                            and hmac.compare_digest(str(u['senha_hash'] or ''), str(senha))):
                        cur.close(); conn.close()
                        return jsonify({'ok': True, 'usuario': {
                            'id': u['id'], 'username': u['username'],
                            'nome': u['nome'], 'perfil': u['perfil']
                        }}), 200
                # 2) Fallback: qualquer admin ativo
                cur.execute("""
                    SELECT id, username, nome, senha_hash, perfil
                    FROM usuarios WHERE perfil = 'admin' AND ativo = TRUE
                """)
                for a in (cur.fetchall() or []):
                    if hmac.compare_digest(str(a['senha_hash'] or ''), str(senha)):
                        cur.close(); conn.close()
                        return jsonify({'ok': True, 'usuario': {
                            'id': a['id'], 'username': a['username'],
                            'nome': a['nome'], 'perfil': a['perfil']
                        }}), 200
                cur.close()
            except Exception as e:
                logging.warning(f"Senha admin erro DB: {e}")
            finally:
                try: conn.close()
                except: pass

        if 'admin' in USUARIOS_FIXOS:
            fixo = USUARIOS_FIXOS['admin']
            if fixo.get('perfil') == 'admin' and hmac.compare_digest(str(fixo['senha']), str(senha)):
                return jsonify({'ok': True, 'usuario': {
                    'id': 0, 'username': 'admin',
                    'nome': fixo.get('nome', 'Administrador'), 'perfil': 'admin'
                }}), 200
        return jsonify({'ok': False, 'erro': 'Senha incorreta'}), 401
    except Exception as e:
        logging.error(f"❌ Erro verificar_senha_admin: {e}")
        return jsonify({'ok': False, 'erro': 'Erro interno'}), 500


# ============================================
# ESCOLAS
# ============================================

@app.route('/api/escolas', methods=['GET'])
def listar_escolas():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            if escola_sessao is not None:
                cur.execute("""
                    SELECT e.*,
                        (SELECT COUNT(*) FROM turmas t WHERE t.escola_id = e.id) as total_turmas,
                        (SELECT COUNT(*) FROM alunos a WHERE a.escola_id = e.id) as total_alunos
                    FROM escolas e WHERE e.id = %s ORDER BY e.nome
                """, (escola_sessao,))
            else:
                cur.execute("""
                    SELECT e.*,
                        (SELECT COUNT(*) FROM turmas t WHERE t.escola_id = e.id) as total_turmas,
                        (SELECT COUNT(*) FROM alunos a WHERE a.escola_id = e.id) as total_alunos
                    FROM escolas e ORDER BY e.nome
                """)
            escolas = cur.fetchall()
            cur.close(); conn.close()
            return jsonify(escolas)
        except Exception as e:
            print(f"Erro ao listar escolas: {e}")
            try: conn.close()
            except: pass
    return jsonify([])


@app.route('/api/escolas', methods=['POST'])
def criar_escola():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    data = request.json or {}
    nome = data.get('nome')
    if not nome:
        return jsonify({'erro': 'Nome é obrigatório'}), 400
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""INSERT INTO escolas (nome, inep, municipio, estado, telefone, diretor)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (nome, data.get('inep', ''), data.get('municipio', ''),
                 data.get('estado', 'PA'), data.get('telefone', ''), data.get('diretor', '')))
            result = cur.fetchone()
            conn.commit(); cur.close(); conn.close()
            return jsonify({'id': result['id'], 'mensagem': 'Escola criada'})
        except Exception as e:
            traceback.print_exc()
            try: conn.close()
            except: pass
    return jsonify({'erro': 'Erro ao criar escola'}), 500


@app.route('/api/escolas/<int:id>', methods=['GET'])
def buscar_escola(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    if escola_sessao is not None and escola_sessao != id:
        return jsonify({'erro': 'Acesso negado a esta escola'}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM escolas WHERE id = %s", (id,))
        escola = cur.fetchone()
        cur.close(); conn.close()
        if not escola: return jsonify({'erro': 'Escola não encontrada'}), 404
        return jsonify(escola)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/escolas/<int:id>', methods=['PUT'])
def editar_escola(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        data = request.json or {}
        nome = data.get('nome')
        if not nome: return jsonify({'erro': 'Nome é obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("""UPDATE escolas SET nome=%s, inep=%s, municipio=%s,
            estado=%s, telefone=%s, diretor=%s WHERE id=%s RETURNING id""",
            (nome, data.get('inep',''), data.get('municipio',''),
             data.get('estado','PA'), data.get('telefone',''), data.get('diretor',''), id))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Escola atualizada'})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/escolas/<int:id>', methods=['DELETE'])
def excluir_escola(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = get_db_connection()
    if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, nome FROM escolas WHERE id = %s", (id,))
        escola = cur.fetchone()
        if not escola:
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT COUNT(*) FROM turmas WHERE escola_id = %s", (id,))
        tt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM alunos WHERE escola_id = %s", (id,))
        ta = cur.fetchone()[0]
        cur.execute("DELETE FROM escolas WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True,
                        'mensagem': f'Escola "{escola[1]}" excluída!',
                        'detalhes': {'turmas_excluidas': tt, 'alunos_excluidos': ta}})
    except Exception as e:
        conn.rollback(); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# TURMAS (isoladas por escola)
# ============================================

@app.route('/api/turmas', methods=['GET'])
def listar_turmas():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT t.id, t.nome, t.serie, t.turno, t.professor,
                t.capacidade, t.ano_letivo, t.escola_id, e.nome as escola_nome,
                COUNT(a.id) as total_alunos
            FROM turmas t
            LEFT JOIN escolas e ON t.escola_id = e.id
            LEFT JOIN alunos a ON a.turma_id = t.id"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try:
                params.append(int(escola_id))
                query += " WHERE t.escola_id = %s"
            except (ValueError, TypeError): pass
        query += " GROUP BY t.id, e.nome ORDER BY t.nome"
        cur.execute(query, params)
        turmas = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(turmas)
    except Exception as e:
        traceback.print_exc()
        return jsonify([])


@app.route('/api/turmas', methods=['POST'])
def criar_turma():
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        if not data.get('nome') or not data.get('escola_id'):
            return jsonify({'erro': 'Nome e escola são obrigatórios'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""INSERT INTO turmas (escola_id, nome, serie, turno,
            professor, capacidade, ano_letivo) VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id""",
            (data['escola_id'], data['nome'], data.get('serie','1º Ano'),
             data.get('turno','Manhã'), data.get('professor',''),
             data.get('capacidade',35), data.get('ano_letivo',2025)))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'id': result['id'], 'mensagem': 'Turma criada'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': 'Erro ao criar turma'}), 500


@app.route('/api/turmas/<int:id>', methods=['GET'])
def buscar_turma(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT t.id, t.nome, t.serie, t.turno, t.professor,
            t.capacidade, t.ano_letivo, t.escola_id, e.nome as escola_nome
            FROM turmas t LEFT JOIN escolas e ON t.escola_id = e.id
            WHERE t.id = %s""", (id,))
        turma = cur.fetchone()
        cur.close(); conn.close()
        if not turma: return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        return jsonify(turma)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/turmas/<int:id>', methods=['PUT'])
def editar_turma(id):
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        if not data.get('nome') or not data.get('escola_id'):
            return jsonify({'erro': 'Nome e escola são obrigatórios'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM turmas WHERE id = %s", (id,))
        turma = cur.fetchone()
        if not turma:
            cur.close(); conn.close()
            return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""UPDATE turmas SET escola_id=%s, nome=%s, serie=%s,
            turno=%s, professor=%s, capacidade=%s, ano_letivo=%s
            WHERE id=%s RETURNING id""",
            (data['escola_id'], data['nome'], data.get('serie','1º Ano'),
             data.get('turno','Manhã'), data.get('professor',''),
             data.get('capacidade',35), data.get('ano_letivo',2025), id))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Turma atualizada'})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/turmas/<int:id>', methods=['DELETE'])
def excluir_turma(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    conn = get_db_connection()
    if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, nome, escola_id FROM turmas WHERE id = %s", (id,))
        turma = cur.fetchone()
        if not turma:
            cur.close(); conn.close()
            return jsonify({'erro': 'Turma não encontrada'}), 404
        if escola_sessao is not None and turma[2] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT COUNT(*) FROM alunos WHERE turma_id = %s", (id,))
        ta = cur.fetchone()[0]
        cur.execute("DELETE FROM turmas WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True,
                        'mensagem': f'Turma "{turma[1]}" excluída!',
                        'detalhes': {'alunos_excluidos': ta}})
    except Exception as e:
        conn.rollback(); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# ALUNOS (isolados por escola)
# ============================================

@app.route('/api/alunos', methods=['GET'])
def listar_alunos():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    turma_id = request.args.get('turma_id')
    serie = request.args.get('serie')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    try:
        conn = get_db_connection()
        if not conn: return jsonify([])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT a.id, a.nome, a.matricula, a.numero_chamada,
            a.data_nascimento, a.genero, a.responsavel, a.telefone,
            a.email, a.observacoes, a.turma_id, a.escola_id,
            t.nome as turma_nome, t.serie as turma_serie, t.turno as turma_turno,
            e.nome as escola_nome
            FROM alunos a
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try:
                params.append(int(escola_id))
                query += " AND a.escola_id = %s"
            except (ValueError, TypeError): pass
        if turma_id and str(turma_id) not in ('', 'null', 'undefined'):
            try:
                params.append(int(turma_id))
                query += " AND a.turma_id = %s"
            except (ValueError, TypeError): pass
        if serie and str(serie) not in ('', 'null', 'undefined'):
            params.append(serie)
            query += " AND t.serie = %s"
        query += " ORDER BY a.numero_chamada NULLS LAST, a.nome"
        cur.execute(query, params)
        alunos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(alunos)
    except Exception as e:
        traceback.print_exc()
        return jsonify([])


@app.route('/api/alunos', methods=['POST'])
def criar_aluno():
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        if not data.get('nome'): return jsonify({'erro': 'Nome é obrigatório'}), 400
        if not data.get('escola_id'): return jsonify({'erro': 'Escola é obrigatória'}), 400
        if not data.get('turma_id'): return jsonify({'erro': 'Turma é obrigatória'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (data['escola_id'],))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM turmas WHERE id = %s", (data['turma_id'],))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Turma não encontrada'}), 404
        numero = data.get('numero_chamada')
        if numero is None or numero == '': numero = None
        else:
            try: numero = int(numero); numero = numero if numero > 0 else None
            except: numero = None
        matricula = (data.get('matricula') or '').strip() or None
        cur.execute("""INSERT INTO alunos (escola_id, turma_id, nome, matricula, numero_chamada)
            VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (data['escola_id'], data['turma_id'], data['nome'].strip(), matricula, numero))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'id': result['id'], 'mensagem': 'Aluno criado'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/alunos/<int:id>', methods=['GET'])
def buscar_aluno(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT a.*, t.nome as turma_nome, t.serie as turma_serie,
            e.nome as escola_nome, e.id as escola_id
            FROM alunos a
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE a.id = %s""", (id,))
        aluno = cur.fetchone()
        cur.close(); conn.close()
        if not aluno: return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and aluno.get('escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        return jsonify(aluno)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/alunos/<int:id>', methods=['PUT'])
def editar_aluno(id):
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        if not data.get('nome'): return jsonify({'erro': 'Nome é obrigatório'}), 400
        if not data.get('escola_id'): return jsonify({'erro': 'Escola é obrigatória'}), 400
        if not data.get('turma_id'): return jsonify({'erro': 'Turma é obrigatória'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM alunos WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and ex['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT id FROM escolas WHERE id = %s", (data['escola_id'],))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM turmas WHERE id = %s", (data['turma_id'],))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Turma não encontrada'}), 404
        numero = data.get('numero_chamada')
        if numero is None or numero == '': numero = None
        else:
            try: numero = int(numero); numero = numero if numero > 0 else None
            except: numero = None
        matricula = (data.get('matricula') or '').strip() or None
        cur.execute("""UPDATE alunos SET escola_id=%s, turma_id=%s, nome=%s,
            matricula=%s, numero_chamada=%s WHERE id=%s RETURNING id""",
            (data['escola_id'], data['turma_id'], data['nome'].strip(),
             matricula, numero, id))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Aluno atualizado'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/alunos/<int:id>', methods=['DELETE'])
def excluir_aluno(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    conn = get_db_connection()
    if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, nome, escola_id FROM alunos WHERE id = %s", (id,))
        aluno = cur.fetchone()
        if not aluno:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and aluno[2] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM correcoes_texto WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM cartoes_template WHERE aluno_id = %s", (id,))
        cur.execute("DELETE FROM alunos WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'mensagem': f'Aluno "{aluno[1]}" excluído!'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# PROVAS (isoladas por escola)
# ============================================

@app.route('/api/provas', methods=['GET'])
def listar_provas():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola_id')
    escola_id = escola_sessao if escola_sessao is not None else escola_param
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT p.id, p.escola_id, p.titulo, p.serie, p.disciplina,
            p.bimestre, p.data_prova, p.valor_nota, p.tipo_questoes,
            p.quantidade_questoes, p.gabarito, p.bncc, p.textos_questoes,
            p.niveis, p.created_at, e.nome as escola_nome
            FROM provas p
            LEFT JOIN escolas e ON p.escola_id = e.id"""
        params = []
        if escola_id and str(escola_id) not in ('', 'null', 'undefined'):
            try:
                params.append(int(escola_id))
                query += " WHERE p.escola_id = %s"
            except (ValueError, TypeError): pass
        query += " ORDER BY p.created_at DESC"
        cur.execute(query, params)
        provas = cur.fetchall()
        cur.close(); conn.close()
        for p in provas:
            if p.get('textos_questoes'):
                try:
                    novos = []
                    for t in p['textos_questoes']:
                        if t and isinstance(t, str) and t.strip().startswith('{'):
                            try: novos.append(json.loads(t))
                            except: novos.append(t)
                        else: novos.append(t)
                    p['textos_questoes'] = novos
                except Exception as e:
                    logging.warning(f"textos_questoes: {e}")
        return jsonify(provas)
    except Exception as e:
        traceback.print_exc()
        return jsonify([])


@app.route('/api/provas', methods=['POST'])
def criar_prova():
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        titulo = data.get('titulo')
        serie = data.get('serie')
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not titulo: return jsonify({'erro': 'Título é obrigatório'}), 400
        if not serie: return jsonify({'erro': 'Série é obrigatória'}), 400
        if not escola_id: return jsonify({'erro': 'Escola é obrigatória'}), 400
        try: escola_id = int(escola_id)
        except: return jsonify({'erro': 'Escola inválida'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM escolas WHERE id = %s", (escola_id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("SELECT id FROM provas WHERE titulo=%s AND serie=%s AND escola_id=%s",
                    (titulo, serie, escola_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Já existe prova com este título nesta escola'}), 400
        bncc_validos = [str(b).strip() for b in data.get('bncc', []) if b and str(b).strip()]
        textos_validos = [str(t).strip() for t in data.get('textos_questoes', []) if t]
        niveis_validos = [str(n).strip() for n in data.get('niveis', []) if n]
        cur.execute("""INSERT INTO provas (escola_id, titulo, serie, disciplina,
            bimestre, data_prova, valor_nota, tipo_questoes, quantidade_questoes,
            gabarito, bncc, textos_questoes, niveis)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (escola_id, titulo, serie, data.get('disciplina',''),
             data.get('bimestre',''), data.get('data_prova'),
             data.get('nota_maxima',10), data.get('tipo_questoes','4'),
             data.get('quantidade_questoes',20), data.get('gabarito',[]),
             bncc_validos, textos_validos, niveis_validos))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'id': result['id'],
                        'mensagem': f'Prova "{titulo}" criada!',
                        'serie': serie})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/provas/<int:id>', methods=['GET'])
def buscar_prova(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT p.id, p.escola_id, p.titulo, p.serie, p.disciplina,
            p.bimestre, p.data_prova, p.valor_nota, p.tipo_questoes,
            p.quantidade_questoes, p.gabarito, p.bncc, p.textos_questoes,
            p.niveis, p.created_at, e.nome as escola_nome
            FROM provas p LEFT JOIN escolas e ON p.escola_id = e.id
            WHERE p.id = %s""", (id,))
        prova = cur.fetchone()
        cur.close(); conn.close()
        if not prova: return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and prova.get('escola_id') != escola_sessao:
            return jsonify({'erro': 'Acesso negado'}), 403
        if prova.get('textos_questoes'):
            try:
                novos = []
                for t in prova['textos_questoes']:
                    if t and isinstance(t, str) and t.strip().startswith('{'):
                        try: novos.append(json.loads(t))
                        except: novos.append(t)
                    else: novos.append(t)
                prova['textos_questoes'] = novos
            except: pass
        return jsonify(prova)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/provas/<int:id>', methods=['PUT'])
def editar_prova(id):
    try:
        data = request.json or {}
        escola_sessao = get_escola_id()
        if escola_sessao is not None:
            data['escola_id'] = escola_sessao
        titulo = data.get('titulo')
        serie = data.get('serie')
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not titulo: return jsonify({'erro': 'Título é obrigatório'}), 400
        if not serie: return jsonify({'erro': 'Série é obrigatória'}), 400
        if not escola_id: return jsonify({'erro': 'Escola é obrigatória'}), 400
        try: escola_id = int(escola_id)
        except: return jsonify({'erro': 'Escola inválida'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, escola_id FROM provas WHERE id = %s", (id,))
        ex = cur.fetchone()
        if not ex:
            cur.close(); conn.close()
            return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and ex['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("SELECT id FROM escolas WHERE id = %s", (escola_id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Escola não encontrada'}), 404
        bncc_validos = [str(b).strip() for b in data.get('bncc', []) if b and str(b).strip()]
        textos_validos = [str(t).strip() for t in data.get('textos_questoes', []) if t]
        niveis_validos = [str(n).strip() for n in data.get('niveis', []) if n]
        cur.execute("""UPDATE provas SET escola_id=%s, titulo=%s, serie=%s,
            disciplina=%s, bimestre=%s, data_prova=%s, valor_nota=%s,
            tipo_questoes=%s, quantidade_questoes=%s, gabarito=%s, bncc=%s,
            textos_questoes=%s, niveis=%s WHERE id=%s RETURNING id""",
            (escola_id, titulo, serie, data.get('disciplina',''),
             data.get('bimestre',''), data.get('data_prova'),
             data.get('nota_maxima',10), data.get('tipo_questoes','4'),
             data.get('quantidade_questoes',20), data.get('gabarito',[]),
             bncc_validos, textos_validos, niveis_validos, id))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Prova atualizada'})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/provas/<int:id>', methods=['DELETE'])
def excluir_prova(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    conn = get_db_connection()
    if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, titulo, escola_id FROM provas WHERE id = %s", (id,))
        prova = cur.fetchone()
        if not prova:
            cur.close(); conn.close()
            return jsonify({'erro': 'Prova não encontrada'}), 404
        if escola_sessao is not None and prova[2] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM correcoes_texto WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM cartoes_template WHERE prova_id = %s", (id,))
        cur.execute("DELETE FROM provas WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'mensagem': f'Prova "{prova[1]}" excluída!'})
    except Exception as e:
        conn.rollback(); traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# USUÁRIOS (admin-only)
# ============================================

@app.route('/api/usuarios', methods=['GET'])
def listar_usuarios():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""SELECT u.id, u.escola_id, u.nome, u.username,
                u.email, u.perfil, u.ativo, u.criado_em,
                e.nome as escola_nome
                FROM usuarios u
                LEFT JOIN escolas e ON u.escola_id = e.id
                ORDER BY u.id""")
            usuarios = cur.fetchall()
            cur.close(); conn.close()
            return jsonify(usuarios)
        except Exception as e:
            print(f"Erro listar usuários: {e}")
            try: conn.close()
            except: pass
    resultado = []
    for username, dados in USUARIOS_FIXOS.items():
        resultado.append({
            'id': 0, 'nome': dados['nome'], 'username': username,
            'email': '', 'perfil': dados['perfil'], 'ativo': True,
            'escola_id': None, 'escola_nome': '',
            'criado_em': datetime.now().isoformat()
        })
    return jsonify(resultado)


@app.route('/api/usuarios', methods=['POST'])
def criar_usuario():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        data = request.json or {}
        nome = data.get('nome')
        username = data.get('username')
        senha = data.get('senha')
        email = data.get('email', '')
        perfil = data.get('perfil', 'usuario')
        ativo = data.get('ativo', True)
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not nome or not username or not senha:
            return jsonify({'erro': 'Nome, usuário e senha obrigatórios'}), 400
        if len(senha) < 4:
            return jsonify({'erro': 'Senha deve ter 4+ caracteres'}), 400
        if perfil == 'usuario' and not escola_id:
            return jsonify({'erro': 'Escola obrigatória para perfil usuário'}), 400
        if escola_id:
            try: escola_id = int(escola_id)
            except: return jsonify({'erro': 'Escola inválida'}), 400
        else: escola_id = None
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM usuarios WHERE username = %s", (username,))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Usuário já existe'}), 400
        if escola_id:
            cur.execute("SELECT id FROM escolas WHERE id = %s", (escola_id,))
            if not cur.fetchone():
                cur.close(); conn.close()
                return jsonify({'erro': 'Escola não encontrada'}), 404
        cur.execute("""INSERT INTO usuarios (escola_id, nome, username, senha_hash,
            email, perfil, ativo) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (escola_id, nome, username, senha, email, perfil, ativo))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'id': result['id'], 'mensagem': 'Usuário criado'})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/usuarios/<int:id>', methods=['GET'])
def buscar_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT u.id, u.escola_id, u.nome, u.username, u.email,
            u.perfil, u.ativo, u.criado_em, e.nome as escola_nome
            FROM usuarios u LEFT JOIN escolas e ON u.escola_id = e.id
            WHERE u.id = %s""", (id,))
        usuario = cur.fetchone()
        cur.close(); conn.close()
        if not usuario: return jsonify({'erro': 'Usuário não encontrado'}), 404
        return jsonify(usuario)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/usuarios/<int:id>', methods=['PUT'])
def atualizar_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        data = request.json or {}
        nome = data.get('nome')
        username = data.get('username')
        senha = data.get('senha')
        email = data.get('email', '')
        perfil = data.get('perfil', 'usuario')
        ativo = data.get('ativo', True)
        escola_id = data.get('escola_id') or data.get('escolaId')
        if not nome or not username:
            return jsonify({'erro': 'Nome e usuário obrigatórios'}), 400
        if len(username) < 3:
            return jsonify({'erro': 'Usuário deve ter 3+ caracteres'}), 400
        if perfil == 'usuario' and not escola_id:
            return jsonify({'erro': 'Escola obrigatória'}), 400
        if escola_id:
            try: escola_id = int(escola_id)
            except: return jsonify({'erro': 'Escola inválida'}), 400
        else: escola_id = None
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM usuarios WHERE id = %s", (id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Usuário não encontrado'}), 404
        cur.execute("SELECT id FROM usuarios WHERE username = %s AND id != %s",
                    (username, id))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({'erro': 'Nome de usuário em uso'}), 400
        if escola_id:
            cur.execute("SELECT id FROM escolas WHERE id = %s", (escola_id,))
            if not cur.fetchone():
                cur.close(); conn.close()
                return jsonify({'erro': 'Escola não encontrada'}), 404
        fields = ["escola_id=%s", "nome=%s", "username=%s", "email=%s",
                  "perfil=%s", "ativo=%s"]
        params = [escola_id, nome, username, email, perfil, ativo]
        if senha and len(senha) >= 4:
            fields.append("senha_hash=%s"); params.append(senha)
        params.append(id)
        cur.execute(f"UPDATE usuarios SET {', '.join(fields)} WHERE id=%s RETURNING id", params)
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': result['id'], 'mensagem': 'Usuário atualizado'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/usuarios/<int:id>', methods=['DELETE'])
def excluir_usuario(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT username FROM usuarios WHERE id = %s", (id,))
        usuario = cur.fetchone()
        if not usuario:
            cur.close(); conn.close()
            return jsonify({'erro': 'Usuário não encontrado'}), 404
        if usuario['username'] == 'admin':
            cur.close(); conn.close()
            return jsonify({'erro': 'Não pode excluir admin principal'}), 400
        cur.execute("DELETE FROM usuarios WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'mensagem': f'Usuário "{usuario["username"]}" excluído'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# DASHBOARD (isolado por escola)
# ============================================

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    conn = get_db_connection()
    if not conn:
        return jsonify({'total_escolas': 0, 'total_turmas': 0,
                        'total_alunos': 0, 'total_provas': 0})
    try:
        escola_id = get_escola_id()
    except PermissionError as e:
        try: conn.close()
        except: pass
        return jsonify({'erro': str(e)}), 403
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if escola_id is None:
            cur.execute("""SELECT
                (SELECT COUNT(*) FROM escolas) AS total_escolas,
                (SELECT COUNT(*) FROM turmas) AS total_turmas,
                (SELECT COUNT(*) FROM alunos) AS total_alunos,
                (SELECT COUNT(*) FROM provas) AS total_provas""")
        else:
            cur.execute("""SELECT
                (SELECT COUNT(*) FROM escolas WHERE id=%s) AS total_escolas,
                (SELECT COUNT(*) FROM turmas WHERE escola_id=%s) AS total_turmas,
                (SELECT COUNT(*) FROM alunos WHERE escola_id=%s) AS total_alunos,
                (SELECT COUNT(*) FROM provas WHERE escola_id=%s) AS total_provas""",
                (escola_id, escola_id, escola_id, escola_id))
        row = cur.fetchone()
        cur.close(); conn.close()
        return jsonify({
            'total_escolas': int(row['total_escolas'] or 0),
            'total_turmas': int(row['total_turmas'] or 0),
            'total_alunos': int(row['total_alunos'] or 0),
            'total_provas': int(row['total_provas'] or 0)
        })
    except Exception as e:
        logging.error(f"Dashboard: {e}")
        try: conn.close()
        except: pass
        return jsonify({'total_escolas': 0, 'total_turmas': 0,
                        'total_alunos': 0, 'total_provas': 0})


# ============================================
# HISTÓRICO (isolado por escola)
# ============================================

@app.route('/api/historico', methods=['GET'])
def listar_historico():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola')
    turma_id = request.args.get('turma')
    aluno_id = request.args.get('aluno_id')
    prova_id = request.args.get('prova_id')
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT h.*, a.nome as aluno_nome, p.titulo as prova_titulo,
            p.disciplina, p.serie as prova_serie, t.serie,
            t.nome as turma_nome, e.nome as escola_nome,
            t.id as turma_id, e.id as escola_id,
            p.quantidade_questoes as total_questoes, p.tipo_questoes, p.bncc
            FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id
            LEFT JOIN provas p ON h.prova_id = p.id
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_sessao is not None:
            params.append(escola_sessao)
            query += " AND a.escola_id = %s"
        elif escola_param and escola_param not in ('', 'null'):
            try:
                params.append(int(escola_param))
                query += " AND e.id = %s"
            except: pass
        if turma_id and turma_id not in ('', 'null'):
            try: params.append(int(turma_id)); query += " AND t.id = %s"
            except: pass
        if aluno_id and aluno_id not in ('', 'null'):
            try: params.append(int(aluno_id)); query += " AND h.aluno_id = %s"
            except: pass
        if prova_id and prova_id not in ('', 'null'):
            try: params.append(int(prova_id)); query += " AND h.prova_id = %s"
            except: pass
        query += " ORDER BY h.data_correcao DESC LIMIT 100"
        cur.execute(query, params)
        historico = cur.fetchall()
        cur.close(); conn.close()
        for item in historico:
            total = item.get('total_questoes') or 20
            acertos = item.get('acertos', 0)
            pct = round((acertos / total) * 100) if total > 0 else 0
            conceito = calcular_conceito(pct)
            item['conceito'] = conceito['nome']
            item['conceito_rotulo'] = conceito['rotulo']
            item['conceito_cor'] = conceito['cor']
            item['porcentagem'] = pct
            if 'tipo_avaliacao' not in item or not item['tipo_avaliacao']:
                item['tipo_avaliacao'] = identificar_disciplina(
                    item.get('prova_titulo', ''),
                    item.get('disciplina', ''),
                    item.get('serie', ''))
        return jsonify(historico)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/historico/agrupado', methods=['GET'])
def historico_agrupado():
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    escola_param = request.args.get('escola')
    turma_id = request.args.get('turma')
    aluno_id = request.args.get('aluno_id')
    serie = request.args.get('serie')
    prova_id = request.args.get('prova')
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """SELECT h.*, a.nome as aluno_nome, p.titulo as prova_titulo,
            p.disciplina, p.serie as prova_serie, p.gabarito as prova_gabarito,
            p.quantidade_questoes, p.bncc as prova_bncc,
            t.serie, t.nome as turma_nome, e.nome as escola_nome
            FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id
            LEFT JOIN provas p ON h.prova_id = p.id
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE 1=1"""
        params = []
        if escola_sessao is not None:
            params.append(escola_sessao)
            query += " AND a.escola_id = %s"
        elif escola_param and escola_param not in ('', 'null'):
            try:
                params.append(int(escola_param))
                query += " AND e.id = %s"
            except: pass
        if turma_id and turma_id not in ('', 'null'):
            try: params.append(int(turma_id)); query += " AND t.id = %s"
            except: pass
        if aluno_id and aluno_id not in ('', 'null'):
            try: params.append(int(aluno_id)); query += " AND h.aluno_id = %s"
            except: pass
        if serie and serie not in ('', 'null'):
            params.append(serie); query += " AND t.serie = %s"
        if prova_id and prova_id not in ('', 'null'):
            try: params.append(int(prova_id)); query += " AND h.prova_id = %s"
            except: pass
        query += " ORDER BY a.nome, h.data_correcao DESC"
        tem_filtro = bool(
            (turma_id and turma_id not in ('', 'null')) or
            (aluno_id and aluno_id not in ('', 'null')) or
            (prova_id and prova_id not in ('', 'null')))
        if not tem_filtro: query += " LIMIT 1000"
        cur.execute(query, params)
        historico = cur.fetchall()
        cur.close(); conn.close()
        alunos_map = {}
        for item in historico:
            aluno_key = item.get('aluno_id') or item.get('aluno_nome')
            if not aluno_key: continue
            if aluno_key not in alunos_map:
                alunos_map[aluno_key] = {
                    'aluno_id': item.get('aluno_id'),
                    'aluno_nome': item.get('aluno_nome', 'Aluno'),
                    'serie': item.get('serie', ''),
                    'turma': item.get('turma_nome', ''),
                    'escola': item.get('escola_nome', ''),
                    'avaliacoes': {}
                }
            disciplina = item.get('disciplina', '')
            prova_titulo = item.get('prova_titulo', '')
            serie_aluno = item.get('serie', '')
            tipo = identificar_disciplina(prova_titulo, disciplina, serie_aluno)
            disc_lower = (disciplina or '').lower()
            prova_lower = (prova_titulo or '').lower()
            is_redacao = ('reda' in disc_lower or 'reda' in prova_lower
                          or item.get('tipo_correcao') == 'ia_redacao')
            is_prod_manual = item.get('tipo_correcao') == 'manual_producao'
            if is_prod_manual: tipo = 'Producao'
            if is_redacao or is_prod_manual:
                nota_red = float(item.get('nota') or 0)
                acertos_red = int(item.get('acertos') or 0)
                total_red = int(item.get('total') or 10)
                erros_red = max(0, total_red - acertos_red)
                qs = [{'numero': 1, 'resposta': f'Nota {nota_red}',
                       'gabarito': '10.0', 'acertou': nota_red >= 6,
                       'respondida': True, 'bncc': '',
                       'status': f'📝 Nota {nota_red}'}]
                if tipo not in alunos_map[aluno_key]['avaliacoes']:
                    alunos_map[aluno_key]['avaliacoes'][tipo] = {
                        'nota': nota_red, 'acertos': acertos_red,
                        'erros': erros_red, 'total': total_red,
                        'prova': prova_titulo, 'data': item.get('data_correcao',''),
                        'disciplina': disciplina, 'questoes_status': qs,
                        'bncc': [''], 'respostas': [f'Nota {nota_red}'],
                        'gabarito': ['10.0']
                    }
                else:
                    ex = alunos_map[aluno_key]['avaliacoes'][tipo]
                    if item.get('data_correcao','') > ex.get('data',''):
                        alunos_map[aluno_key]['avaliacoes'][tipo] = {
                            'nota': nota_red, 'acertos': acertos_red,
                            'erros': erros_red, 'total': total_red,
                            'prova': prova_titulo,
                            'data': item.get('data_correcao',''),
                            'disciplina': disciplina, 'questoes_status': qs,
                            'bncc': [''], 'respostas': [f'Nota {nota_red}'],
                            'gabarito': ['10.0']
                        }
                continue
            respostas = item.get('respostas', [])
            gabarito = item.get('prova_gabarito', []) or item.get('gabarito', [])
            total_q = item.get('quantidade_questoes', 20)
            if len(respostas) < total_q: respostas = list(respostas) + [''] * (total_q - len(respostas))
            if len(gabarito) < total_q: gabarito = list(gabarito) + [''] * (total_q - len(gabarito))
            bncc_list = item.get('prova_bncc', [])
            if len(bncc_list) < total_q: bncc_list = list(bncc_list) + [''] * (total_q - len(bncc_list))
            qs = []; acertos = 0; erros = 0
            for i in range(total_q):
                resp = str(respostas[i] if i < len(respostas) else '').strip().upper()
                gab = str(gabarito[i] if i < len(gabarito) else '').strip().upper()
                valida = resp and resp not in ('', '—', '-')
                correto = valida and resp == gab and gab != ''
                cod_bncc = bncc_list[i] if i < len(bncc_list) and bncc_list[i] else ''
                if correto: acertos += 1
                else: erros += 1
                qs.append({'numero': i+1, 'resposta': resp or '—',
                           'gabarito': gab or '—', 'acertou': correto,
                           'respondida': valida, 'bncc': cod_bncc,
                           'status': '✅ ACERTOU' if correto else ('❌ ERROU' if valida else '— NÃO RESPONDEU')})
            dados = {
                'nota': float(item.get('nota', 0)),
                'acertos': acertos, 'erros': erros, 'total': total_q,
                'prova': prova_titulo, 'data': item.get('data_correcao',''),
                'disciplina': disciplina, 'questoes_status': qs,
                'bncc': [q['bncc'] for q in qs],
                'respostas': [q['resposta'] for q in qs],
                'gabarito': [q['gabarito'] for q in qs]
            }
            if tipo not in alunos_map[aluno_key]['avaliacoes']:
                alunos_map[aluno_key]['avaliacoes'][tipo] = dados
            else:
                ex = alunos_map[aluno_key]['avaliacoes'][tipo]
                if item.get('data_correcao','') > ex.get('data',''):
                    alunos_map[aluno_key]['avaliacoes'][tipo] = dados
        resultado = []
        for _, d in alunos_map.items():
            av = d['avaliacoes']
            default = {'nota': 0, 'acertos': 0, 'erros': 0, 'total': 20,
                       'questoes_status': [], 'bncc': [], 'respostas': [], 'gabarito': []}
            port = dict(av.get('Portugues', default))
            mat = dict(av.get('Matematica', default))
            prod = dict(av.get('Producao', default))
            ch = dict(av.get('CH', default))
            cn = dict(av.get('CN', default))
            notas = [port.get('nota', 0), mat.get('nota', 0), prod.get('nota', 0),
                     ch.get('nota', 0), cn.get('nota', 0)]
            soma = sum(notas); media = soma / 5 if notas else 0
            resultado.append({
                'aluno_id': d['aluno_id'], 'aluno_nome': d['aluno_nome'],
                'serie': d['serie'], 'turma': d['turma'], 'escola': d['escola'],
                'portugues': port, 'matematica': mat, 'producao': prod,
                'ch': ch, 'cn': cn,
                'soma': round(soma, 1), 'media': round(media, 1)
            })
        return jsonify(resultado)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/historico/<int:id>', methods=['DELETE'])
def excluir_correcao(id):
    try:
        escola_sessao = get_escola_id()
    except PermissionError as e:
        return jsonify({'erro': str(e)}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT h.id, a.escola_id FROM historico h
            LEFT JOIN alunos a ON h.aluno_id = a.id WHERE h.id = %s""", (id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify({'erro': 'Correção não encontrada'}), 404
        if escola_sessao is not None and row.get('escola_id') != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("DELETE FROM historico WHERE id = %s", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'mensagem': 'Correção excluída', 'id': id})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ============================================
# GABARITOS (admin-only)
# ============================================

@app.route('/api/gabaritos', methods=['POST'])
def salvar_gabarito():
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        data = request.json or {}
        prova_id = data.get('prova_id')
        respostas = data.get('respostas', [])
        bncc = data.get('bncc', [])
        textos_questoes = data.get('textos_questoes', [])
        niveis = data.get('niveis', [])
        if not prova_id: return jsonify({'erro': 'Prova ID é obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, disciplina FROM provas WHERE id = %s", (prova_id,))
        prova = cur.fetchone()
        if not prova:
            cur.close(); conn.close()
            return jsonify({'erro': 'Prova não encontrada'}), 404
        is_producao = (prova.get('disciplina') or '').strip() == 'Produção de Texto'
        if is_producao:
            resp_ser = [item.strip() if isinstance(item, str) else str(item).strip() for item in respostas]
            texto_ser = [json.dumps(t, ensure_ascii=False) if isinstance(t, (dict, list))
                         else str(t).strip() for t in textos_questoes]
            bncc_v = [str(b).strip() for b in bncc if b and str(b).strip()]
            niveis_v = [str(n).strip().upper() for n in niveis if n and str(n).strip()]
            cur.execute("""UPDATE provas SET gabarito=%s::text[], quantidade_questoes=%s,
                bncc=%s::text[], textos_questoes=%s::text[], niveis=%s::text[]
                WHERE id=%s RETURNING id""",
                (resp_ser, len(resp_ser), bncc_v, texto_ser, niveis_v, prova_id))
            result = cur.fetchone()
            conn.commit(); cur.close(); conn.close()
            return jsonify({'id': result['id'],
                            'mensagem': 'Gabarito de Produção salvo',
                            'total_questoes': len(resp_ser),
                            'tipo': 'producao'})
        if not respostas or len(respostas) == 0:
            cur.close(); conn.close()
            return jsonify({'erro': 'Respostas obrigatórias'}), 400
        resp_v = [str(r).strip().upper() for r in respostas if r]
        if not resp_v:
            cur.close(); conn.close()
            return jsonify({'erro': 'Nenhuma resposta válida'}), 400
        bncc_v = [str(b).strip() for b in bncc if b and str(b).strip()]
        textos_v = [str(t).strip() for t in textos_questoes]
        niveis_v = [str(n).strip() for n in niveis]
        cur.execute("""UPDATE provas SET gabarito=%s::text[], quantidade_questoes=%s,
            bncc=%s::text[], textos_questoes=%s::text[], niveis=%s::text[]
            WHERE id=%s RETURNING id""",
            (resp_v, len(resp_v), bncc_v, textos_v, niveis_v, prova_id))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'id': result['id'], 'mensagem': 'Gabarito salvo',
                        'total_questoes': len(resp_v)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/gabaritos/<int:id>', methods=['DELETE'])
def excluir_gabarito(id):
    bloqueio = _bloqueia_nao_admin()
    if bloqueio: return bloqueio
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        cur = conn.cursor()
        cur.execute("SELECT id, titulo FROM provas WHERE id = %s", (id,))
        prova = cur.fetchone()
        if not prova:
            cur.close(); conn.close()
            return jsonify({'erro': 'Prova não encontrada'}), 404
        cur.execute("""UPDATE provas SET gabarito=NULL, quantidade_questoes=0,
            bncc=NULL, textos_questoes=NULL, niveis=NULL WHERE id=%s""", (id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True,
                        'mensagem': f'Gabarito da prova "{prova[1]}" removido!'})
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ============================================
# CORREÇÃO — /api/corrigir
# ============================================

@app.route('/api/corrigir', methods=['POST'])
def corrigir_com_ia():
    try:
        data = request.json or {}
        if not data: return jsonify({'erro': 'Nenhum dado'}), 400
        imagem_base64 = data.get('imagem')
        prova_id = data.get('prova_id')
        aluno_id = data.get('aluno_id')
        if not imagem_base64: return jsonify({'erro': 'Imagem obrigatória'}), 400
        if not prova_id: return jsonify({'erro': 'Prova ID obrigatório'}), 400
        if not aluno_id: return jsonify({'erro': 'Aluno ID obrigatório'}), 400

        imagem_hash = hashlib.md5(imagem_base64.encode()).hexdigest()
        cache_key = get_cache_key(imagem_hash, prova_id, aluno_id)
        cached = get_cache_correcao(cache_key)
        if cached:
            return jsonify(cached)

        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        try:
            try:
                escola_sessao = get_escola_id()
            except PermissionError as e:
                conn.close()
                return jsonify({'erro': str(e)}), 403
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""SELECT p.*, a.nome AS aluno_nome, a.turma_id,
                a.escola_id AS aluno_escola_id,
                t.serie AS turma_serie, e.nome AS escola_nome
                FROM provas p
                LEFT JOIN alunos a ON a.id = %s
                LEFT JOIN turmas t ON a.turma_id = t.id
                LEFT JOIN escolas e ON a.escola_id = e.id
                WHERE p.id = %s""", (aluno_id, prova_id))
            dados = cur.fetchone()
            if not dados:
                cur.close(); conn.close()
                return jsonify({'erro': 'Prova não encontrada'}), 404
            if escola_sessao is not None and dados.get('aluno_escola_id') != escola_sessao:
                cur.close(); conn.close()
                return jsonify({'erro': 'Acesso negado a este aluno'}), 403
            prova = dados
            gabarito = prova.get('gabarito', [])
            if not gabarito or len(gabarito) == 0:
                cur.close(); conn.close()
                return jsonify({'erro': 'Gabarito não cadastrado'}), 400
            tipo_questoes = prova.get('tipo_questoes') or 4
            if isinstance(tipo_questoes, str):
                try: tipo_questoes = int(tipo_questoes)
                except: tipo_questoes = 4
            if not validar_gabarito(gabarito, tipo_questoes):
                cur.close(); conn.close()
                return jsonify({'erro': 'Gabarito inválido'}), 400
            padrao = gerar_padrao_gabarito(gabarito, tipo_questoes)
            nome_aluno = dados.get('aluno_nome') or 'Aluno'
            serie = dados.get('turma_serie') or prova.get('serie') or '1º Ano'
            bncc_gab = prova.get('bncc', [])
            cur.close(); conn.close()
            disciplina = prova.get('disciplina', '')
            prova_titulo = prova.get('titulo', '')
            resultado = corrigir_com_gemini_com_padrao(
                imagem_base64, padrao, nome_aluno, serie, tipo_questoes,
                disciplina, bncc=bncc_gab, prova_id=prova_id, aluno_id=aluno_id)
            if resultado.get('erro'):
                return jsonify(resultado), 400
            tipo_avaliacao = identificar_disciplina(prova_titulo, disciplina, serie)
            if 'confianca_por_questao' not in resultado or not resultado['confianca_por_questao']:
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
                        cur.execute("""UPDATE historico SET respostas=%s::text[],
                            acertos=%s, nota=%s, total=%s, tipo_correcao=%s,
                            disciplina=%s, tipo_avaliacao=%s, questoes_status=%s::jsonb,
                            confianca=%s, confianca_por_questao=%s::jsonb,
                            bncc=%s::text[], data_correcao=CURRENT_TIMESTAMP
                            WHERE prova_id=%s AND aluno_id=%s""",
                            (resp, resultado.get('acertos',0), resultado.get('nota',0),
                             resultado.get('total',0), resultado.get('modo','ia'),
                             disciplina, tipo_avaliacao, qs_json,
                             resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])),
                             bncc_gab, prova_id, aluno_id))
                    else:
                        cur.execute("""INSERT INTO historico
                            (prova_id, aluno_id, respostas, acertos, nota, total,
                             tipo_correcao, disciplina, tipo_avaliacao, questoes_status,
                             confianca, confianca_por_questao, bncc)
                            VALUES (%s,%s,%s::text[],%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s::text[])""",
                            (prova_id, aluno_id, resp, resultado.get('acertos',0),
                             resultado.get('nota',0), resultado.get('total',0),
                             resultado.get('modo','ia'), disciplina, tipo_avaliacao,
                             qs_json, resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])),
                             bncc_gab))
                    conn.commit(); cur.close(); conn.close()
            except Exception as e:
                logging.error(f"⚠️ Salvar histórico: {e}")
            resultado['tipo_avaliacao'] = tipo_avaliacao
            resultado['disciplina'] = disciplina
            resultado['bncc'] = bncc_gab
            set_cache_correcao(cache_key, resultado)
            return jsonify(resultado)
        except Exception as e:
            logging.error(f"❌ Erro correção: {e}")
            traceback.print_exc()
            return jsonify({'erro': str(e)}), 500
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ============================================
# CORREÇÃO MANUAL
# ============================================

@app.route('/api/corrigir_manual', methods=['POST'])
def corrigir_manual():
    try:
        data = request.json or {}
        prova_id = data.get('prova_id')
        aluno_id = data.get('aluno_id')
        respostas = data.get('respostas', [])
        acertos = data.get('acertos', 0)
        nota = data.get('nota', 0)
        total = data.get('total', 0)
        if not prova_id or not aluno_id:
            return jsonify({'erro': 'Prova e aluno obrigatórios'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro no banco'}), 500
        try:
            escola_sessao = get_escola_id()
        except PermissionError as e:
            conn.close()
            return jsonify({'erro': str(e)}), 403
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT a.escola_id FROM alunos a WHERE a.id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado a este aluno'}), 403
        cur.execute("SELECT disciplina, titulo, serie, gabarito, bncc FROM provas WHERE id=%s", (prova_id,))
        prova = cur.fetchone()
        disciplina = prova['disciplina'] if prova else ''
        prova_titulo = prova['titulo'] if prova else ''
        serie_prova = prova['serie'] if prova else ''
        gabarito = prova['gabarito'] if prova else []
        bncc_gab = prova['bncc'] if prova else []
        if (disciplina or '').strip() == 'Produção de Texto':
            cur.close(); conn.close()
            return jsonify({'erro': 'Use SALVAR NOTA', 'tipo': 'producao'}), 400
        cur.execute("SELECT t.serie FROM alunos a LEFT JOIN turmas t ON a.turma_id=t.id WHERE a.id=%s",
                    (aluno_id,))
        s = cur.fetchone()
        serie = s['serie'] if s else serie_prova or '1º Ano'
        tipo_av = identificar_disciplina(prova_titulo, disciplina, serie)
        qs = []
        for i in range(total):
            resp = str(respostas[i]) if i < len(respostas) and respostas[i] is not None else ''
            gab = str(gabarito[i]) if i < len(gabarito) and gabarito[i] is not None else ''
            correto = bool(resp and gab and resp.upper() == gab.upper())
            cod = bncc_gab[i] if i < len(bncc_gab) and bncc_gab[i] else ''
            if correto: msg = 'ADQUIRIU HABILIDADE'
            elif resp: msg = 'RECOMPOSIÇÃO DE APRENDIZAGEM'
            else: msg = 'NÃO RESPONDEU'
            qs.append({'numero': i+1, 'resposta': resp or '—', 'gabarito': gab or '—',
                       'acertou': correto, 'status': msg,
                       'status_texto': f"{'✅ ACERTOU' if correto else '❌ ERROU'}: {msg}",
                       'bncc': cod})
        qs_json = json.dumps(qs)
        cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s",
                    (prova_id, aluno_id))
        existe = cur.fetchone()
        if existe:
            cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s,
                nota=%s, total=%s, tipo_correcao='manual', disciplina=%s,
                tipo_avaliacao=%s, questoes_status=%s::jsonb,
                data_correcao=CURRENT_TIMESTAMP
                WHERE prova_id=%s AND aluno_id=%s""",
                (respostas, acertos, nota, total, disciplina, tipo_av, qs_json,
                 prova_id, aluno_id))
            result_id = existe['id']
        else:
            cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas,
                acertos, nota, total, tipo_correcao, disciplina, tipo_avaliacao,
                questoes_status) VALUES (%s,%s,%s::text[],%s,%s,%s,'manual',%s,%s,%s::jsonb)
                RETURNING id""",
                (prova_id, aluno_id, respostas, acertos, nota, total,
                 disciplina, tipo_av, qs_json))
            result_id = cur.fetchone()['id']
        conn.commit(); cur.close(); conn.close()
        pct = round((acertos / total) * 100) if total > 0 else 0
        return jsonify({'sucesso': True, 'id': result_id,
                        'mensagem': 'Correção manual salva',
                        'conceito': calcular_conceito(pct), 'porcentagem': pct,
                        'tipo_avaliacao': tipo_av, 'questoes_status': qs,
                        'bncc': bncc_gab})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# SALVAR NOTA PRODUÇÃO
# ============================================

@app.route('/api/salvar_nota_producao', methods=['POST'])
def salvar_nota_producao():
    try:
        data = request.json or {}
        aluno_id = data.get('aluno_id')
        prova_id = data.get('prova_id')
        nota = data.get('nota')
        observacao = (data.get('observacao') or '').strip()
        qs_recebidas = data.get('questoes_status', [])
        if not aluno_id: return jsonify({'erro': 'Aluno obrigatório'}), 400
        if not prova_id: return jsonify({'erro': 'Prova obrigatória'}), 400
        if nota is None or nota == '': return jsonify({'erro': 'Nota obrigatória'}), 400
        try: nota_f = float(nota)
        except: return jsonify({'erro': 'Nota inválida'}), 400
        if nota_f < 0 or nota_f > 10: return jsonify({'erro': 'Nota 0-10'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        try:
            escola_sessao = get_escola_id()
        except PermissionError as e:
            conn.close()
            return jsonify({'erro': str(e)}), 403
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id FROM alunos WHERE id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""SELECT p.disciplina, p.titulo, p.serie AS prova_serie
            FROM provas p WHERE p.id = %s""", (prova_id,))
        prova = cur.fetchone()
        if not prova:
            cur.close(); conn.close()
            return jsonify({'erro': 'Prova não encontrada'}), 404
        cur.execute("""SELECT a.nome, t.serie AS turma_serie FROM alunos a
            LEFT JOIN turmas t ON a.turma_id=t.id WHERE a.id = %s""", (aluno_id,))
        aluno = cur.fetchone()
        if not aluno:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        disciplina = prova['disciplina'] or 'Produção de Texto'
        serie = aluno['turma_serie'] or prova.get('prova_serie') or '1º Ano'
        tipo_av = 'Producao'
        acertos_eq = int(round(nota_f)); total_eq = 10
        if qs_recebidas and isinstance(qs_recebidas, list) and len(qs_recebidas) > 0:
            qs = qs_recebidas
            for q in qs:
                if isinstance(q, dict): q['nota_manual'] = nota_f
        else:
            qs = [{'numero': 1, 'resposta': f'{nota_f:.1f}', 'gabarito': '10.0',
                   'acertou': nota_f >= 6, 'respondida': True, 'bncc': '',
                   'status': f'📝 Nota Manual {nota_f:.1f}',
                   'status_texto': f'📝 Nota {nota_f:.1f}',
                   'confianca': 100, 'correta': nota_f >= 6}]
        if observacao and qs:
            qs[0]['status_texto'] = qs[0].get('status_texto','') + f' — {observacao[:200]}'
        respostas = [f'{nota_f:.1f}']
        qs_json = json.dumps(qs, ensure_ascii=False, default=str)
        cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s",
                    (prova_id, aluno_id))
        existe = cur.fetchone()
        if existe:
            cur.execute("""UPDATE historico SET respostas=%s::text[], acertos=%s,
                nota=%s, total=%s, tipo_correcao='manual_producao', disciplina=%s,
                tipo_avaliacao=%s, questoes_status=%s::jsonb, confianca=100,
                confianca_por_questao=%s::jsonb, data_correcao=CURRENT_TIMESTAMP
                WHERE prova_id=%s AND aluno_id=%s""",
                (respostas, acertos_eq, nota_f, total_eq, disciplina, tipo_av,
                 qs_json, json.dumps([100]), prova_id, aluno_id))
            hist_id = existe['id']
        else:
            cur.execute("""INSERT INTO historico (prova_id, aluno_id, respostas,
                acertos, nota, total, tipo_correcao, disciplina, tipo_avaliacao,
                questoes_status, confianca, confianca_por_questao, bncc)
                VALUES (%s,%s,%s::text[],%s,%s,%s,'manual_producao',%s,%s,%s::jsonb,
                        100,%s::jsonb,%s::text[]) RETURNING id""",
                (prova_id, aluno_id, respostas, acertos_eq, nota_f, total_eq,
                 disciplina, tipo_av, qs_json, json.dumps([100]), []))
            hist_id = cur.fetchone()['id']
        conn.commit(); cur.close(); conn.close()
        pct = int(round((nota_f / 10) * 100))
        return jsonify({'sucesso': True, 'id': hist_id,
                        'mensagem': f'Nota {nota_f:.1f} salva!',
                        'aluno': aluno.get('nome'), 'prova': prova.get('titulo'),
                        'nota': nota_f, 'porcentagem': pct,
                        'conceito': calcular_conceito(pct),
                        'tipo_avaliacao': tipo_av, 'disciplina': disciplina})
    except Exception as e:
        logging.error(f"❌ salvar_nota: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# REDAÇÃO
# ============================================

@app.route('/api/corrigir_redacao', methods=['POST'])
def corrigir_redacao():
    try:
        data = request.json or {}
        texto = data.get('texto')
        aluno_id = data.get('aluno_id')
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
                    resultado = json.loads(m.group())
                    resultado['modo'] = 'openai'
                    return jsonify(resultado)
            except Exception as e:
                print(f"⚠️ Erro OpenAI redação: {e}")
        # Fallback local
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
                        'metricas': {'nota_coerencia': round(nc,1),
                                     'nota_estrutura': round(ne,1),
                                     'nota_gramatica': round(ng,1),
                                     'nota_vocabulario': round(nv,1)},
                        'feedback': ' '.join(fb), 'modo': 'local'})
    except Exception as e:
        print(f"❌ Erro redação: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/extrair_texto_redacao', methods=['POST'])
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
        logging.error(f"OCR: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


@app.route('/api/salvar_correcao_texto', methods=['POST'])
def salvar_correcao_texto():
    try:
        data = request.json or {}
        aluno_id = data.get('aluno_id')
        prova_id = data.get('prova_id')
        texto = data.get('texto')
        nota = data.get('nota')
        metricas = data.get('metricas', {})
        feedback = data.get('feedback', '')
        if not aluno_id: return jsonify({'erro': 'Aluno obrigatório'}), 400
        if not texto: return jsonify({'erro': 'Texto obrigatório'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        try:
            escola_sessao = get_escola_id()
        except PermissionError as e:
            conn.close()
            return jsonify({'erro': str(e)}), 403
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT escola_id FROM alunos WHERE id = %s", (aluno_id,))
        al = cur.fetchone()
        if not al:
            cur.close(); conn.close()
            return jsonify({'erro': 'Aluno não encontrado'}), 404
        if escola_sessao is not None and al['escola_id'] != escola_sessao:
            cur.close(); conn.close()
            return jsonify({'erro': 'Acesso negado'}), 403
        cur.execute("""INSERT INTO correcoes_texto (aluno_id, prova_id, texto, nota,
            metrica_coerencia, metrica_estrutura, metrica_gramatica,
            metrica_vocabulario, feedback, tipo_correcao)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'ia') RETURNING id""",
            (aluno_id, prova_id, texto, nota,
             metricas.get('nota_coerencia', 0), metricas.get('nota_estrutura', 0),
             metricas.get('nota_gramatica', 0), metricas.get('nota_vocabulario', 0),
             feedback))
        id_ct = cur.fetchone()['id']
        if prova_id and nota is not None:
            try:
                cur.execute("SELECT disciplina, titulo, serie FROM provas WHERE id = %s", (prova_id,))
                pr = cur.fetchone()
                cur.execute("""SELECT t.serie FROM alunos a LEFT JOIN turmas t
                    ON a.turma_id=t.id WHERE a.id = %s""", (aluno_id,))
                sr = cur.fetchone()
                disc_h = (pr['disciplina'] if pr else None) or 'Redação'
                tit_h = (pr['titulo'] if pr else '') or ''
                ser_h = (sr['serie'] if sr else None) or (pr['serie'] if pr else '') or '1º Ano'
                tipo_av = identificar_disciplina(tit_h, disc_h, ser_h)
                nf = float(nota or 0)
                ac_eq = int(round(nf)); tot_eq = 10
                qs_h = [{'numero': 1, 'resposta': f'{nf}', 'gabarito': '10.0',
                         'acertou': nf >= 6, 'respondida': True, 'bncc': '',
                         'status': f'📝 Nota {nf}', 'status_texto': f'📝 Nota {nf}',
                         'confianca': 100, 'correta': nf >= 6}]
                resp_h = [f'{nf}']
                cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s",
                            (prova_id, aluno_id))
                existe = cur.fetchone()
                if existe:
                    cur.execute("""UPDATE historico SET respostas=%s::text[],
                        acertos=%s, nota=%s, total=%s, tipo_correcao='ia_redacao',
                        disciplina=%s, tipo_avaliacao=%s, questoes_status=%s::jsonb,
                        confianca=100, confianca_por_questao=%s::jsonb,
                        data_correcao=CURRENT_TIMESTAMP
                        WHERE prova_id=%s AND aluno_id=%s""",
                        (resp_h, ac_eq, nf, tot_eq, disc_h, tipo_av,
                         json.dumps(qs_h), json.dumps([100]), prova_id, aluno_id))
                else:
                    cur.execute("""INSERT INTO historico (prova_id, aluno_id,
                        respostas, acertos, nota, total, tipo_correcao, disciplina,
                        tipo_avaliacao, questoes_status, confianca,
                        confianca_por_questao, bncc)
                        VALUES (%s,%s,%s::text[],%s,%s,%s,'ia_redacao',%s,%s,%s::jsonb,
                                100,%s::jsonb,%s::text[])""",
                        (prova_id, aluno_id, resp_h, ac_eq, nf, tot_eq,
                         disc_h, tipo_av, json.dumps(qs_h), json.dumps([100]), []))
            except Exception as e:
                logging.warning(f"Integração redação: {e}")
        conn.commit(); cur.close(); conn.close()
        return jsonify({'sucesso': True, 'id': id_ct,
                        'mensagem': 'Correção de texto salva'})
    except Exception as e:
        print(f"❌ Erro salvar correção texto: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# CARTÃO RESPOSTA (valida aluno escola)
# ============================================

def gerar_qrcode_base64(dados):
    try:
        import qrcode
        from io import BytesIO
        qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H,
                           box_size=10, border=2)
        qr.add_data(dados); qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO(); img.save(buffer, format="PNG"); buffer.seek(0)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        logging.error(f"❌ QR: {e}")
        return ""


def carregar_logo_base64(nome_arquivo):
    try:
        if not nome_arquivo or not os.path.isfile(nome_arquivo): return ''
        with open(nome_arquivo, 'rb') as f: dados = f.read()
        b64 = base64.b64encode(dados).decode('utf-8')
        ext = nome_arquivo.lower().rsplit('.',1)[-1]
        mime = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg',
                'gif':'image/gif','svg':'image/svg+xml','webp':'image/webp'}.get(ext, 'image/png')
        return f"data:{mime};base64,{b64}"
    except Exception as e:
        logging.error(f"❌ Logo: {e}")
        return ''


@app.route('/api/gerar_gabarito', methods=['POST'])
def gerar_gabarito():
    try:
        data = request.json or {}
        for campo in ['escola_id','turma_id','aluno_id','prova_id']:
            if not data.get(campo):
                return jsonify({'erro': f'Campo "{campo}" obrigatório'}), 400
        escola_id = data['escola_id']; turma_id = data['turma_id']
        aluno_id = data['aluno_id']; prova_id = data['prova_id']
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro ao conectar'}), 500
        try:
            escola_sessao = get_escola_id()
        except PermissionError as e:
            conn.close()
            return jsonify({'erro': str(e)}), 403
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT a.nome, a.escola_id, e.nome as escola_nome,
            t.nome as turma_nome, t.serie FROM alunos a
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id WHERE a.id = %s""", (aluno_id,))
        aluno = cur.fetchone()
        cur.execute("SELECT p.* FROM provas p WHERE p.id = %s", (prova_id,))
        prova = cur.fetchone()
        cur.close(); conn.close()
        if not aluno or not prova:
            return jsonify({'erro': 'Aluno ou prova não encontrados'}), 404
        if escola_sessao is not None and aluno['escola_id'] != escola_sessao:
            return jsonify({'erro': 'Acesso negado a este aluno'}), 403
        nome_aluno = aluno['nome']
        escola_nome = aluno['escola_nome'] or ''
        turma_nome = aluno['turma_nome'] or ''
        logo_b64 = carregar_logo_base64('logotipo cartão resposta.png')
        logo_html = (f'<img src="{logo_b64}" alt="Logo" style="height:20mm;max-width:100%;object-fit:contain;margin:0 auto 1.5mm auto;display:block;">' if logo_b64 else '')
        serie = prova.get('serie', '')
        titulo_prova = prova.get('titulo', 'Prova')
        disc_prova = (prova.get('disciplina') or '').strip()
        tipo_q = int(prova.get('tipo_questoes', 4))
        alternativas = ['A','B','C','D','E'][:tipo_q]
        qt_q = int(prova.get('quantidade_questoes', 20))
        if disc_prova == 'Redação':
            qr = gerar_qrcode_base64(f"ALUNO:{aluno_id}|PROVA:{prova_id}|ESCOLA:{escola_id}|TURMA:{turma_id}")
            nl = min(qt_q if qt_q >= 10 else 30, 50)
            linhas = ''
            for i in range(1, nl+1):
                linhas += f'<div style="display:flex;align-items:center;margin-bottom:1.5mm;"><div style="width:8mm;font-size:7pt;color:#999;text-align:right;padding-right:1.5mm;font-family:monospace;">{i:02d}</div><div style="flex:1;border-bottom:0.25mm solid #ccc;height:7.5mm;"></div></div>'
            html_red = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redação - {nome_aluno}</title><style>
*{{margin:0;padding:0;box-sizing:border-box;}}@page{{size:A4 portrait;margin:0;}}body{{font-family:Arial,sans-serif;background:#f5f5f5;padding:10px;display:flex;justify-content:center;}}.folha{{width:210mm;height:297mm;background:#fff;position:relative;}}.fiducial{{position:absolute;width:10mm;height:10mm;background:#000;z-index:100;}}.fiducial::after{{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4mm;height:4mm;background:#fff;border-radius:50%;}}.fiducial-tl{{left:15mm;top:15mm;}}.fiducial-tr{{right:15mm;top:15mm;}}.fiducial-bl{{left:15mm;bottom:15mm;}}.fiducial-br{{right:15mm;bottom:15mm;}}.qr-code-bloco{{position:absolute;top:28mm;right:15mm;width:35mm;height:35mm;}}.qr-code-bloco img{{width:100%;height:100%;border:0.3mm solid #000;padding:1mm;background:#fff;}}.header{{position:absolute;left:25mm;top:25mm;width:170mm;height:52mm;border-bottom:1.5px solid #000;padding-bottom:2mm;}}.header-titulo{{font-size:8pt;font-weight:bold;text-align:center;}}.header-cartao{{font-size:14pt;font-weight:900;text-align:center;border:2px solid #000;display:inline-block;padding:1mm 8mm;margin:1mm auto;}}.header-prova{{font-size:9pt;font-weight:bold;text-align:center;}}.header-escola{{font-size:7pt;color:#333;text-align:center;}}.header-aluno{{font-size:9pt;margin-top:2.5mm;padding:0 2mm;}}.campo{{border-bottom:0.3mm solid #000;display:inline-block;min-width:40mm;padding:0 1mm;}}.instrucoes{{position:absolute;left:25mm;top:75mm;width:160mm;font-size:7pt;padding:1.5mm 3mm;background:#f0f0f0;border:0.3mm solid #999;}}.area-redacao{{position:absolute;left:25mm;top:83mm;width:160mm;height:202mm;}}.area-redacao-titulo{{font-size:8pt;font-weight:700;margin-bottom:2mm;border-bottom:0.3mm solid #000;padding-bottom:1mm;}}.btn-print{{position:absolute;bottom:5mm;left:50%;transform:translateX(-50%);padding:3mm 10mm;background:#000;color:#fff;border:none;font-size:11pt;cursor:pointer;}}@media print{{body{{background:#fff;padding:0;}}.btn-print{{display:none;}}}}
</style></head><body><div class="folha"><div class="fiducial fiducial-tl"></div><div class="fiducial fiducial-tr"></div><div class="fiducial fiducial-bl"></div><div class="fiducial fiducial-br"></div><div class="qr-code-bloco"><img src="data:image/png;base64,{qr}" alt="QR"></div><div class="header">{logo_html}<div class="header-titulo">SECRETARIA MUN. DE EDUCAÇÃO — SISAM 2026</div><div style="text-align:center"><div class="header-cartao">FOLHA DE REDAÇÃO</div></div><div class="header-prova">{titulo_prova}</div><div class="header-escola">{escola_nome} | Série: {serie} | Turma: {turma_nome}</div><div class="header-aluno"><strong>Aluno(a):</strong> {nome_aluno}</div><div style="margin-top:1.5mm;padding:0 2mm;font-size:9pt"><strong>Data:</strong> <span class="campo">{datetime.now().strftime('%d/%m/%Y')}</span></div></div><div class="instrucoes"><strong>⚠️ INSTRUÇÕES:</strong> Caneta preta ou azul. Não rasure.</div><div class="area-redacao"><div class="area-redacao-titulo">✍️ TEXTO DEFINITIVO</div>{linhas}</div><button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button></div></body></html>"""
            return html_red, 200, {'Content-Type': 'text/html'}
        num_col = 1 if qt_q <= 12 else 2
        mapa = gerar_mapa_template_padrao(qt_q, alternativas, num_col)
        salvar_mapa_template(prova_id, aluno_id, tipo_q, qt_q, num_col, mapa)
        qr = gerar_qrcode_base64(f"ALUNO:{aluno_id}|PROVA:{prova_id}|ESCOLA:{escola_id}|TURMA:{turma_id}")
        bolhas = ''; nums = ''; qs = {}
        for b in mapa:
            q = b['questao']
            if q not in qs: qs[q] = []
            qs[q].append(b)
        for q in sorted(qs.keys()):
            for b in qs[q]:
                bolhas += f'<div class="bolha-abs" style="left:{b["x_mm"]-3.5}mm;top:{b["y_mm"]-3.5}mm;">{b["alternativa"]}</div>'
            y = qs[q][0]['y_mm']; x = qs[q][0]['x_mm'] - 12
            nums += f'<div class="num-abs" style="left:{x}mm;top:{y-3.5}mm;">{q:02d}</div>'
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cartão - {nome_aluno}</title><style>
*{{margin:0;padding:0;box-sizing:border-box;}}@page{{size:A4 portrait;margin:0;}}body{{font-family:Arial,sans-serif;background:#f5f5f5;padding:10px;display:flex;justify-content:center;}}.folha{{width:210mm;height:297mm;background:#fff;position:relative;}}.fiducial{{position:absolute;width:10mm;height:10mm;background:#000;}}.fiducial::after{{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4mm;height:4mm;background:#fff;border-radius:50%;}}.fiducial-tl{{left:15mm;top:15mm;}}.fiducial-tr{{right:15mm;top:15mm;}}.fiducial-bl{{left:15mm;bottom:15mm;}}.fiducial-br{{right:15mm;bottom:15mm;}}.qr-code-bloco{{position:absolute;top:28mm;right:15mm;width:41mm;height:41mm;}}.qr-code-bloco img{{width:100%;height:100%;border:1px solid #000;padding:1mm;background:#fff;}}.header-abs{{position:absolute;left:25mm;top:25mm;width:170mm;height:65mm;text-align:center;border-bottom:1.5px solid #000;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:2mm;}}.header-titulo{{font-size:8pt;font-weight:bold;}}.header-cartao{{font-size:12pt;font-weight:900;border:2px solid #000;display:inline-block;padding:1mm 6mm;margin:1mm auto;}}.header-prova{{font-size:8pt;font-weight:bold;}}.header-escola{{font-size:7pt;color:#333;}}.header-aluno{{font-size:9pt;text-align:left;padding:0 2mm;}}.instrucoes{{font-size:6pt;padding:0.8mm;background:#f0f0f0;border:1px solid #999;}}.bolha-abs{{position:absolute;width:7mm;height:7mm;border:1.5px solid #666;border-radius:50%;background:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9pt;font-weight:900;}}.num-abs{{position:absolute;font-size:9pt;font-weight:900;line-height:7mm;height:7mm;text-align:right;padding-right:1mm;border-right:1.5px solid #000;width:10mm;}}.btn-print{{position:absolute;bottom:5mm;left:50%;transform:translateX(-50%);padding:3mm 10mm;background:#000;color:#fff;border:none;font-size:11pt;cursor:pointer;}}@media print{{body{{background:#fff;padding:0;}}.btn-print{{display:none;}}}}
</style></head><body><div class="folha"><div class="fiducial fiducial-tl"></div><div class="fiducial fiducial-tr"></div><div class="fiducial fiducial-bl"></div><div class="fiducial fiducial-br"></div><div class="qr-code-bloco"><img src="data:image/png;base64,{qr}" alt="QR"></div><div class="header-abs">{logo_html}<div class="header-titulo">SECRETARIA MUN. DE EDUCAÇÃO — SISAM 2026</div><div class="header-cartao">CARTÃO RESPOSTA</div><div class="header-prova">{titulo_prova}</div><div class="header-escola">{escola_nome} | Série: {serie} | Turma: {turma_nome}</div><div class="header-aluno"><strong>Aluno(a):</strong> {nome_aluno} &nbsp;&nbsp; <strong>Data:</strong> {datetime.now().strftime('%d/%m/%Y')}</div><div class="instrucoes">⚠️ PINTE UM CÍRCULO POR QUESTÃO — CANETA PRETA/AZUL — NÃO RASURE</div></div>{bolhas}{nums}<button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button></div></body></html>"""
        return html, 200, {'Content-Type': 'text/html'}
    except Exception as e:
        print(f"❌ Erro cartão: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# BACKUP (admin-only)
# ============================================

@app.route('/api/backup', methods=['GET'])
def backup_database():
    backup_key = request.headers.get('X-Backup-Key') or request.args.get('key')
    expected_key = os.getenv('BACKUP_KEY', 'backup123')
    if not backup_key or backup_key != expected_key:
        return jsonify({'erro': 'Não autorizado'}), 403
    u = get_usuario_atual()
    if u and u.get('perfil') != 'admin':
        return jsonify({'erro': 'Apenas admins'}), 403
    try:
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro DB'}), 500
        tables = ['escolas','turmas','alunos','provas','historico','usuarios','correcoes_texto']
        data = {}
        cur = conn.cursor(cursor_factory=RealDictCursor)
        for table in tables:
            try:
                cur.execute(f"SELECT * FROM {table}")
                data[table] = cur.fetchall()
            except Exception as e:
                data[table] = []
        cur.close(); conn.close()
        json_str = json.dumps(data, default=str, indent=2, ensure_ascii=False)
        memory = io.BytesIO()
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        with zipfile.ZipFile(memory, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"backup_{ts}.json", json_str.encode('utf-8'))
        memory.seek(0)
        return send_file(memory, mimetype='application/zip',
                         as_attachment=True, download_name=f"backup_{ts}.zip")
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ============================================
# CORREÇÃO AUTOMÁTICA POR QR CODE
# ============================================

def extrair_dados_qrcode(imagem_base64):
    if not PYZBAR_AVAILABLE: return None
    try:
        from pyzbar.pyzbar import decode
        if ',' in imagem_base64 and imagem_base64.strip().startswith('data:'):
            imagem_base64 = imagem_base64.split(',',1)[1]
        imagem_base64 = imagem_base64.strip().replace('\n','').replace('\r','').replace(' ','')
        image_data = base64.b64decode(imagem_base64, validate=False)
        np_arr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None: return None
        codigos = decode(img)
        if not codigos:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            codigos = decode(clahe.apply(gray))
        if not codigos: return None
        for codigo in codigos:
            dados = codigo.data.decode('utf-8')
            if not dados.startswith('ALUNO:'): continue
            r = {}
            for parte in dados.split('|'):
                if ':' in parte:
                    k, v = parte.split(':', 1)
                    k = k.strip().upper(); v = v.strip()
                    if v.isdigit():
                        if k == 'ALUNO': r['aluno_id'] = int(v)
                        elif k == 'PROVA': r['prova_id'] = int(v)
                        elif k == 'ESCOLA': r['escola_id'] = int(v)
                        elif k == 'TURMA': r['turma_id'] = int(v)
            if 'aluno_id' in r and 'prova_id' in r: return r
        return None
    except Exception as e:
        logging.error(f"❌ QR: {e}")
        return None


@app.route('/api/corrigir-automatico', methods=['POST'])
def corrigir_automatico():
    try:
        data = request.json or {}
        imagem_base64 = data.get('imagem')
        if not imagem_base64: return jsonify({'erro': 'Imagem obrigatória'}), 400
        salvar_auto = data.get('salvar_auto', True)
        info_qr = extrair_dados_qrcode(imagem_base64)
        if not info_qr:
            return jsonify({'sucesso': False,
                            'erro': 'Não foi possível ler o QR Code',
                            'dicas': ['QR visível?','Foto nítida?','QR amassado?','Cartão do sistema?']}), 404
        aluno_id = info_qr.get('aluno_id')
        prova_id = info_qr.get('prova_id')
        if not aluno_id or not prova_id:
            return jsonify({'sucesso': False,
                            'erro': 'QR sem dados de aluno/prova'}), 400
        conn = get_db_connection()
        if not conn: return jsonify({'erro': 'Erro DB'}), 500
        try:
            escola_sessao = get_escola_id()
        except PermissionError as e:
            conn.close()
            return jsonify({'erro': str(e)}), 403
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT p.*, a.nome AS aluno_nome, a.escola_id AS aluno_escola_id,
            t.serie AS turma_serie, t.nome AS turma_nome, e.nome AS escola_nome
            FROM provas p
            LEFT JOIN alunos a ON a.id = %s
            LEFT JOIN turmas t ON a.turma_id = t.id
            LEFT JOIN escolas e ON a.escola_id = e.id
            WHERE p.id = %s""", (aluno_id, prova_id))
        dados = cur.fetchone()
        cur.close(); conn.close()
        if not dados:
            return jsonify({'sucesso': False,
                            'erro': f'Prova {prova_id} ou aluno {aluno_id} não encontrados'}), 404
        if escola_sessao is not None and dados.get('aluno_escola_id') != escola_sessao:
            return jsonify({'sucesso': False, 'erro': 'Acesso negado a este aluno'}), 403
        prova = dados
        gab = prova.get('gabarito', [])
        if not gab: return jsonify({'sucesso': False, 'erro': 'Sem gabarito'}), 400
        tipo_q = prova.get('tipo_questoes') or 4
        if isinstance(tipo_q, str):
            try: tipo_q = int(tipo_q)
            except: tipo_q = 4
        if not validar_gabarito(gab, tipo_q):
            return jsonify({'sucesso': False, 'erro': 'Gabarito inválido'}), 400
        padrao = gerar_padrao_gabarito(gab, tipo_q)
        nome = prova.get('aluno_nome') or 'Aluno'
        serie = prova.get('turma_serie') or prova.get('serie') or '1º Ano'
        bncc_gab = prova.get('bncc', [])
        disciplina = prova.get('disciplina', '')
        titulo = prova.get('titulo', '')
        escola_nome_bd = prova.get('escola_nome', '')
        turma_nome_bd = prova.get('turma_nome', '')
        resultado = corrigir_com_gemini_com_padrao(
            imagem_base64, padrao, nome, serie, tipo_q, disciplina,
            bncc=bncc_gab, prova_id=prova_id, aluno_id=aluno_id)
        if resultado.get('erro'):
            return jsonify({'sucesso': False, 'erro': resultado['erro'],
                            'aluno': nome, 'prova': titulo}), 400
        tipo_av = identificar_disciplina(titulo, disciplina, serie)
        if 'confianca_por_questao' not in resultado or not resultado['confianca_por_questao']:
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
                    cur.execute("SELECT id FROM historico WHERE prova_id=%s AND aluno_id=%s",
                                (prova_id, aluno_id))
                    if cur.fetchone():
                        cur.execute("""UPDATE historico SET respostas=%s::text[],
                            acertos=%s, nota=%s, total=%s, tipo_correcao=%s,
                            disciplina=%s, tipo_avaliacao=%s, questoes_status=%s::jsonb,
                            confianca=%s, confianca_por_questao=%s::jsonb,
                            bncc=%s::text[], data_correcao=CURRENT_TIMESTAMP
                            WHERE prova_id=%s AND aluno_id=%s""",
                            (resp, resultado.get('acertos',0), resultado.get('nota',0),
                             resultado.get('total',0), resultado.get('modo','ia'),
                             disciplina, tipo_av, qs_json, resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])),
                             bncc_gab, prova_id, aluno_id))
                    else:
                        cur.execute("""INSERT INTO historico
                            (prova_id, aluno_id, respostas, acertos, nota, total,
                             tipo_correcao, disciplina, tipo_avaliacao, questoes_status,
                             confianca, confianca_por_questao, bncc)
                            VALUES (%s,%s,%s::text[],%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s::jsonb,%s::text[])""",
                            (prova_id, aluno_id, resp, resultado.get('acertos',0),
                             resultado.get('nota',0), resultado.get('total',0),
                             resultado.get('modo','ia'), disciplina, tipo_av,
                             qs_json, resultado.get('confianca',70),
                             json.dumps(resultado.get('confianca_por_questao',[])), bncc_gab))
                    conn.commit(); cur.close(); conn.close()
            except Exception as e:
                logging.error(f"⚠️ Salvar auto: {e}")
        resultado.update({
            'sucesso': True, 'qr_lido': info_qr, 'aluno': nome,
            'aluno_id': aluno_id, 'prova_id': prova_id,
            'prova_titulo': titulo, 'escola_nome': escola_nome_bd,
            'turma_nome': turma_nome_bd, 'tipo_avaliacao': tipo_av,
            'disciplina': disciplina, 'bncc': bncc_gab,
            'escola_id': info_qr.get('escola_id'),
            'turma_id': info_qr.get('turma_id'), 'serie': serie})
        return jsonify(resultado)
    except Exception as e:
        logging.error(f"❌ automático: {e}")
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500


# ============================================
# ESTÁTICOS
# ============================================

MIME_TYPES = {
    '.html':'text/html','.css':'text/css','.js':'application/javascript',
    '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
    '.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff',
    '.woff2':'font/woff2','.ttf':'font/ttf',
    '.eot':'application/vnd.ms-fontobject','.pdf':'application/pdf',
    '.txt':'text/plain','.xml':'application/xml',
}

def _get_mimetype(filename):
    _, ext = os.path.splitext(filename.lower())
    return MIME_TYPES.get(ext, None)


@app.route('/')
def index():
    try:
        if os.path.isfile('index.html'):
            return send_file('index.html', mimetype='text/html')
        return jsonify({'mensagem':'CorrigePro API','status':'online'}), 200
    except Exception as e:
        return jsonify({'mensagem':'CorrigePro API','status':'online'}), 200


@app.route('/style.css')
def serve_css():
    try:
        if os.path.isfile('style.css'):
            return send_file('style.css', mimetype='text/css')
        return "/* não encontrado */", 404, {'Content-Type':'text/css'}
    except: return "/* erro */", 500, {'Content-Type':'text/css'}


@app.route('/script.js')
def serve_js():
    try:
        if os.path.isfile('script.js'):
            return send_file('script.js', mimetype='application/javascript')
        return "// não encontrado", 404, {'Content-Type':'application/javascript'}
    except: return "// erro", 500, {'Content-Type':'application/javascript'}


@app.route('/<path:filename>')
def serve_static_file(filename):
    try:
        if '..' in filename or filename.startswith('/'):
            return jsonify({'erro':'Caminho inválido'}), 400
        mimetype = _get_mimetype(filename)
        if os.path.isfile(filename):
            return send_file(filename, mimetype=mimetype)
        if filename.endswith('.css'):
            return "/* não encontrado */", 404, {'Content-Type':'text/css'}
        if filename.endswith('.js'):
            return "// não encontrado", 404, {'Content-Type':'application/javascript'}
        return jsonify({'erro':'Arquivo não encontrado','path':filename}), 404
    except Exception as e:
        return jsonify({'erro':str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    conn = get_db_connection()
    db_ok = conn is not None
    if conn: conn.close()
    return jsonify({
        'status': 'online',
        'openai': 'disponível' if OPENAI_AVAILABLE else 'indisponível',
        'openai_modelo': OPENAI_MODEL if OPENAI_AVAILABLE else None,
        'relay': 'disponível' if RELAY_AVAILABLE else 'indisponível',
        'pyzbar': 'disponível' if PYZBAR_AVAILABLE else 'indisponível',
        'database': 'conectado' if db_ok else 'desconectado',
        'pool': {'min': DB_POOL_MIN, 'max': DB_POOL_MAX},
        'versao': 'v6-monolítico-login-escola',
        'arquivos': {
            'index.html': os.path.isfile('index.html'),
            'style.css': os.path.isfile('style.css'),
            'script.js': os.path.isfile('script.js'),
        }
    })


# ============================================
# INIT_DB
# ============================================

_DB_INITIALIZED = False

def init_db():
    global _DB_INITIALIZED
    if _DB_INITIALIZED: return
    _DB_INITIALIZED = True
    conn = get_db_connection()
    if not conn:
        print("⚠️ Banco indisponível"); return
    try:
        cur = conn.cursor()
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='escolas')")
        existe = cur.fetchone()[0]
        if not existe:
            print("🔧 Criando tabelas...")
            cur.execute("""CREATE TABLE escolas (id SERIAL PRIMARY KEY, nome TEXT NOT NULL,
                inep TEXT, municipio TEXT, estado TEXT DEFAULT 'PA', telefone TEXT,
                diretor TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE turmas (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
                nome TEXT NOT NULL, serie TEXT, turno TEXT DEFAULT 'Manhã',
                professor TEXT, capacidade INTEGER DEFAULT 35,
                ano_letivo INTEGER DEFAULT 2025,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE alunos (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE CASCADE,
                turma_id INTEGER REFERENCES turmas(id) ON DELETE CASCADE,
                nome TEXT NOT NULL, matricula TEXT, numero_chamada INTEGER,
                data_nascimento DATE, genero TEXT, responsavel TEXT,
                telefone TEXT, email TEXT, observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE provas (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
                titulo TEXT NOT NULL, serie TEXT NOT NULL, disciplina TEXT,
                bimestre TEXT, data_prova DATE, valor_nota DECIMAL(5,2) DEFAULT 10,
                tipo_questoes TEXT DEFAULT '4', quantidade_questoes INTEGER DEFAULT 20,
                gabarito TEXT[], bncc TEXT[], textos_questoes TEXT[], niveis TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE historico (id SERIAL PRIMARY KEY,
                prova_id INTEGER REFERENCES provas(id) ON DELETE CASCADE,
                aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
                respostas TEXT[], acertos INTEGER, nota DECIMAL(5,2), total INTEGER,
                tipo_correcao TEXT DEFAULT 'ia', disciplina TEXT, tipo_avaliacao TEXT,
                questoes_status JSONB DEFAULT '[]', confianca DECIMAL(5,2),
                confianca_por_questao JSONB DEFAULT '[]', bncc TEXT[],
                data_correcao TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE usuarios (id SERIAL PRIMARY KEY,
                escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL,
                nome TEXT, username TEXT UNIQUE NOT NULL, senha_hash TEXT NOT NULL,
                email TEXT, perfil TEXT DEFAULT 'usuario', ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE correcoes_texto (id SERIAL PRIMARY KEY,
                aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
                prova_id INTEGER REFERENCES provas(id) ON DELETE SET NULL,
                texto TEXT NOT NULL, nota DECIMAL(5,2),
                metrica_coerencia DECIMAL(5,2), metrica_estrutura DECIMAL(5,2),
                metrica_gramatica DECIMAL(5,2), metrica_vocabulario DECIMAL(5,2),
                feedback TEXT, tipo_correcao TEXT DEFAULT 'ia',
                data_correcao TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
            print("✅ Tabelas criadas!")
        else:
            # Migrações
            def _has_col(table, col):
                cur.execute("""SELECT column_name FROM information_schema.columns
                    WHERE table_name=%s AND column_name=%s""", (table, col))
                return cur.fetchone() is not None
            if not _has_col('provas', 'escola_id'):
                try:
                    cur.execute("ALTER TABLE provas ADD COLUMN escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL")
                    print("✅ escola_id em provas")
                except Exception as e: print(f"⚠️ {e}")
            if not _has_col('usuarios', 'escola_id'):
                try:
                    cur.execute("ALTER TABLE usuarios ADD COLUMN escola_id INTEGER REFERENCES escolas(id) ON DELETE SET NULL")
                    print("✅ escola_id em usuarios")
                except Exception as e: print(f"⚠️ {e}")
            if not _has_col('provas', 'bncc'):
                try: cur.execute("ALTER TABLE provas ADD COLUMN bncc TEXT[]")
                except: pass
            for c in ['textos_questoes', 'niveis']:
                if not _has_col('provas', c):
                    try: cur.execute(f"ALTER TABLE provas ADD COLUMN {c} TEXT[]")
                    except: pass
            for c, sql in [
                ('questoes_status', "ALTER TABLE historico ADD COLUMN questoes_status JSONB DEFAULT '[]'"),
                ('confianca', "ALTER TABLE historico ADD COLUMN confianca DECIMAL(5,2)"),
                ('confianca_por_questao', "ALTER TABLE historico ADD COLUMN confianca_por_questao JSONB DEFAULT '[]'"),
                ('bncc', "ALTER TABLE historico ADD COLUMN bncc TEXT[]"),
            ]:
                if not _has_col('historico', c):
                    try: cur.execute(sql)
                    except: pass
        cur.execute("""CREATE TABLE IF NOT EXISTS cartoes_template (
            id SERIAL PRIMARY KEY, prova_id INTEGER REFERENCES provas(id) ON DELETE CASCADE,
            aluno_id INTEGER REFERENCES alunos(id) ON DELETE CASCADE,
            tipo_questoes INTEGER NOT NULL, quantidade_questoes INTEGER NOT NULL,
            num_colunas INTEGER NOT NULL, mapa_template JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(prova_id, aluno_id))""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_cartoes_template_prova_aluno ON cartoes_template(prova_id, aluno_id)")
        for username, dados in USUARIOS_FIXOS.items():
            cur.execute("SELECT * FROM usuarios WHERE username = %s", (username,))
            if not cur.fetchone():
                cur.execute("""INSERT INTO usuarios (nome, username, senha_hash, perfil, ativo)
                    VALUES (%s,%s,%s,%s,TRUE)""",
                    (dados['nome'], username, dados['senha'], dados['perfil']))
                print(f"✅ Usuário {username}")
        indices = [
            "CREATE INDEX IF NOT EXISTS idx_alunos_escola_id ON alunos(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_alunos_turma_id ON alunos(turma_id)",
            "CREATE INDEX IF NOT EXISTS idx_turmas_escola_id ON turmas(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_aluno_id ON historico(aluno_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_prova_id ON historico(prova_id)",
            "CREATE INDEX IF NOT EXISTS idx_historico_data_correcao ON historico(data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_historico_aluno_data ON historico(aluno_id, data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_correcoes_texto_data ON correcoes_texto(data_correcao DESC)",
            "CREATE INDEX IF NOT EXISTS idx_provas_created_at ON provas(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_provas_escola_id ON provas(escola_id)",
            "CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username)",
            "CREATE INDEX IF NOT EXISTS idx_usuarios_escola_id ON usuarios(escola_id)",
        ]
        for sql in indices:
            try: cur.execute(sql)
            except Exception as e: logging.warning(f"Índice: {e}")
        conn.commit(); cur.close(); conn.close()
        print("✅ Banco inicializado!")
    except Exception as e:
        print(f"❌ init_db: {e}")
        traceback.print_exc()


try:
    init_db()
    init_cache_table()
    limpar_cache_antigo()
except Exception as e:
    logging.error(f"⚠️ Init: {e}")


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=" * 60)
    print("🚀 CORRIGEPRO v6 — MONOLÍTICO COM LOGIN + ISOLAMENTO")
    print("=" * 60)
    print(f"📌 Porta: {port}")
    print(f"📌 Pool: {DB_POOL_MIN}-{DB_POOL_MAX}")
    print(f"🤖 OpenAI: {'✅' if OPENAI_AVAILABLE else '❌'}")
    print(f"📷 pyzbar: {'✅' if PYZBAR_AVAILABLE else '❌'}")
    print("=" * 60)
    print("🎯 v6 — NOVIDADES:")
    print("   ✅ /api/login restaurado")
    print("   ✅ /api/verificar-senha-admin com fallback")
    print("   ✅ Isolamento por escola em TODAS as rotas")
    print("   ✅ Admin vê tudo; usuário vê só a própria escola")
    print("   ✅ after_request preserva status 403/404 (não vira 500)")
    print("   ✅ Tabela 'matrizes' removida")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=False)