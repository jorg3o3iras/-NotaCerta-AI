import os
from backend.scripts.init_db import init_db

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 NotaCerta AI — VERSÃO FATORADA")
    print("=" * 60)
    print("⏳ Inicializando banco...")
    init_db()

    from backend import create_app
    app = create_app()
    port = int(os.environ.get('PORT', 5000))

    print("=" * 60)
    print(f"📌 Porta: {port}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=False)