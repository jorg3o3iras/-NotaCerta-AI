# ============================================================
# CACHE — correções persistidas em correcoes_cache (JSONB)
# ============================================================

import json
import logging

from psycopg2.extras import RealDictCursor

from backend.config import CORRECOES_CACHE_TTL_HORAS
from backend.db import get_db_connection


def init_cache_table():
    """Cria tabela + índices se não existirem."""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return
        cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS correcoes_cache (
            id SERIAL PRIMARY KEY, chave_hash TEXT NOT NULL,
            resultado JSONB NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_correcoes_cache_hash ON correcoes_cache(chave_hash, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_correcoes_cache_created ON correcoes_cache(created_at DESC)")
        conn.commit()
        cur.close()
        logging.info("✅ Tabela de cache de correções pronta")
    except Exception as e:
        logging.warning(f"⚠️ Erro cache: {e}")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def get_cache_key(imagem_hash, prova_id, aluno_id):
    return f"{imagem_hash}_{prova_id}_{aluno_id}"


def get_cache_correcao(chave):
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return None
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""SELECT resultado FROM correcoes_cache
            WHERE chave_hash = %s AND created_at > NOW() - make_interval(hours => %s)
            ORDER BY created_at DESC LIMIT 1""", (chave, CORRECOES_CACHE_TTL_HORAS))
        row = cur.fetchone()
        cur.close()
        if row:
            return row['resultado'] if isinstance(row['resultado'], dict) else json.loads(row['resultado'])
        return None
    except Exception as e:
        logging.warning(f"⚠️ Erro cache get: {e}")
        return None
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def set_cache_correcao(chave, resultado):
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO correcoes_cache (chave_hash, resultado) VALUES (%s, %s::jsonb)",
            (chave, json.dumps(resultado, default=str))
        )
        conn.commit()
        cur.close()
    except Exception as e:
        logging.warning(f"⚠️ Erro cache set: {e}")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def limpar_cache_antigo():
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM correcoes_cache WHERE created_at < NOW() - make_interval(hours => %s)",
            (CORRECOES_CACHE_TTL_HORAS,)
        )
        removidas = cur.rowcount
        conn.commit()
        cur.close()
        if removidas > 0:
            logging.info(f"🧹 Cache antigo limpo: {removidas}")
    except Exception as e:
        logging.warning(f"⚠️ Erro limpar cache: {e}")
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass