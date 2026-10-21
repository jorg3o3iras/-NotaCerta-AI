# ============================================================
# DB — pool Postgres, PooledConnection e helpers
# ============================================================

import logging
from psycopg2 import extensions
from psycopg2.pool import ThreadedConnectionPool

from backend.config import SUPABASE_URL, DB_POOL_MIN, DB_POOL_MAX

# Pool global (lazy init)
DB_POOL = None


class PooledConnection:
    """Wrapper que devolve a conn ao pool quando .close() é chamado."""

    __slots__ = ('_conn', '_pool', '_closed')

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._closed = False

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            if self._conn.status != extensions.STATUS_READY:
                try:
                    self._conn.rollback()
                except:
                    pass
        finally:
            try:
                self._pool.putconn(self._conn)
            except:
                try:
                    self._conn.close()
                except:
                    pass


def _get_pool():
    """Lazy init do ThreadedConnectionPool. Retorna None se sem SUPABASE_URL."""
    global DB_POOL
    if DB_POOL is not None:
        return DB_POOL
    if not SUPABASE_URL:
        logging.error("❌ SUPABASE_URL não definida")
        return None
    try:
        DB_POOL = ThreadedConnectionPool(
            minconn=DB_POOL_MIN,
            maxconn=DB_POOL_MAX,
            dsn=SUPABASE_URL,
            connect_timeout=8,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3,
        )
        logging.info("✅ Pool PostgreSQL: %s-%s", DB_POOL_MIN, DB_POOL_MAX)
        return DB_POOL
    except Exception as e:
        logging.error("❌ Erro pool: %s", e)
        DB_POOL = None
        return None


def get_db_connection():
    """Retorna PooledConnection ou None se pool esgotado/offline."""
    pool = _get_pool()
    if not pool:
        return None
    try:
        conn = pool.getconn()
        if conn.closed:
            pool.putconn(conn, close=True)
            conn = pool.getconn()
        return PooledConnection(conn, pool)
    except Exception as e:
        logging.error("❌ Erro getconn (pool pode estar esgotado): %s", e)
        return None


def get_pool_status():
    """Retorna dict com status do pool para /health e /api/debug/pool."""
    pool = _get_pool()
    if not pool:
        return None
    try:
        return {
            'minconn': pool.minconn,
            'maxconn': pool.maxconn,
            'disponiveis_na_pool': len(pool._pool),
            'em_uso': pool.maxconn - len(pool._pool),
            'total_criadas': len(pool._used) + len(pool._pool),
        }
    except Exception:
        return None