# ============================================================
# RUN — entrypoint
# Expõe `app` no nível do módulo (necessário para Render/Gunicorn)
# ============================================================

import os

from backend.scripts.init_db import init_db
from backend import create_app


# Init do banco (idempotente — roda uma vez)
try:
    init_db()
except Exception as e:
    print(f"⚠️ init_db falhou (non-fatal): {e}")


# App disponível no módulo (Render/Gunicorn procuram por `app`)
app = create_app()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=" * 60)
    print("🚀 NotaCerta AI")
    print("=" * 60)
    print(f"📌 Porta: {port}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=False)
