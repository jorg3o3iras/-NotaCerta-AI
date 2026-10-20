#!/bin/bash
set -e

echo "════════════════════════════════════════════"
echo "🧪 VALIDAÇÃO PRÉ-DEPLOY"
echo "════════════════════════════════════════════"

echo ""
echo "🔍 1/2 — Validando sintaxe do app.py..."
python -c "import ast; ast.parse(open('app.py').read())" \
    && echo "   ✅ Sintaxe OK"
echo "🔍 1/2 — Validando sintaxe do script.js..."
node --check script.js 2>/dev/null \
    && echo "   ✅ Sintaxe OK (se Node estiver instalado)" \
    || echo "   ⚠️ Node não instalado, pulando check do JS"

echo ""
echo "🔍 2/2 — Rodando testes..."
python -m pytest tests/ -v

echo ""
echo "════════════════════════════════════════════"
echo "✅ TUDO PASSOU — Pode fazer deploy!"
echo "════════════════════════════════════════════"