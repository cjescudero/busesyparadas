import json
import logging
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


class JsonLogFormatter(logging.Formatter):
    """Render logs as JSON strings with a minimal schema."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        base: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }

        request_id = request_id_ctx.get()
        if request_id:
            base["request_id"] = request_id

        for attr in ("path", "method", "status_code"):
            value = getattr(record, attr, None)
            if value is not None:
                base[attr] = value

        if record.exc_info:
            base["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(base, ensure_ascii=True)


def setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]

    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.handlers = [handler]
    uvicorn_access.propagate = False

    uvicorn_error = logging.getLogger("uvicorn.error")
    uvicorn_error.handlers = [handler]
    uvicorn_error.propagate = False
