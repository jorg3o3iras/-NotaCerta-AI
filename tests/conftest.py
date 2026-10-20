import os
import sys

# ── Desabilita DB e IA ANTES de importar app ──
os.environ['SUPABASE_URL'] = ''
os.environ['OPENAI_API_KEY'] = ''
os.environ['BACKUP_KEY'] = 'test'
os.environ['DB_POOL_MIN'] = '1'
os.environ['DB_POOL_MAX'] = '2'

# ── Adiciona o diretório raiz ao sys.path ──
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)