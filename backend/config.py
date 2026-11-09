# ============================================================
# CONFIG — variáveis de ambiente e constantes globais
# ============================================================

import os
from dotenv import load_dotenv

load_dotenv()

# ── Banco de dados ─────────────────────────────────────────
SUPABASE_URL = os.getenv('SUPABASE_URL')
DB_POOL_MIN  = int(os.getenv('DB_POOL_MIN', '3'))
DB_POOL_MAX  = int(os.getenv('DB_POOL_MAX', '50'))

# ── Cache de correções ─────────────────────────────────────
CORRECOES_CACHE_TTL_HORAS = 168  # 7 dias

# ── OpenAI / Relay ─────────────────────────────────────────
OPENAI_MODEL   = os.getenv('OPENAI_MODEL', 'gpt-4o')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
RELAY_API_URL  = os.getenv('RELAY_API_URL', '')

# ── Backup ─────────────────────────────────────────────────
BACKUP_KEY = os.getenv('BACKUP_KEY', 'backup123')

# ── Usuários fixos (DEV) ───────────────────────────────────
# NOTA: usados como fallback quando o banco não tem o usuário.
USUARIOS_FIXOS = {
    'admin':      {'senha': 'admin', 'perfil': 'admin',   'nome': 'Administrador', 'escola_id': None},
    'usuario':    {'senha': '123',   'perfil': 'usuario', 'nome': 'Usuário',       'escola_id': None},
    'professor1': {'senha': '123',   'perfil': 'usuario', 'nome': 'Professor 1',   'escola_id': None},
}