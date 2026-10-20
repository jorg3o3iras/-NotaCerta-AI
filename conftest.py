# conftest.py
import sys, types

try:
    import pyzbar.pyzbar  # noqa: F401
except Exception:
    # Stub para permitir rodar os testes mesmo sem a DLL nativa do zbar no Windows
    pkg = types.ModuleType("pyzbar")
    mod = types.ModuleType("pyzbar.pyzbar")
    mod.decode = lambda *a, **k: []
    pkg.pyzbar = mod
    sys.modules["pyzbar"] = pkg
    sys.modules["pyzbar.pyzbar"] = mod