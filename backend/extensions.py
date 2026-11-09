# ============================================================
# EXTENSIONS — providers Flask (JSON customizado)
# ============================================================

import decimal
import uuid
from datetime import date, datetime, time

from flask.json.provider import DefaultJSONProvider


class CustomJSONProvider(DefaultJSONProvider):
    """Serializa Decimal→float, date/datetime→ISO, UUID→str, bytes→utf-8."""

    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (date, datetime, time)):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, bytes):
            return obj.decode('utf-8', errors='replace')
        try:
            return super().default(obj)
        except TypeError:
            return str(obj)


def init_json_provider(app):
    """Registra o CustomJSONProvider na app Flask."""
    app.json = CustomJSONProvider(app)