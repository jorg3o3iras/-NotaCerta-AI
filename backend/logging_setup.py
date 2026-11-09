# ============================================================
# LOGGING — configuração centralizada
# ============================================================

import logging


def setup_logging():
    """Configura logging global. Idempotente."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
    )