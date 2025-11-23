import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import get_settings
from app.core.logging import request_id_ctx


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach and propagate a correlation ID via headers and contextvars."""

    def __init__(self, app) -> None:  # type: ignore[override]
        super().__init__(app)
        self.settings = get_settings()

    async def dispatch(  # type: ignore[override]
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        header_name = self.settings.request_id_header
        request_id = request.headers.get(header_name, str(uuid.uuid4()))
        token = request_id_ctx.set(request_id)
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)

        response.headers[header_name] = request_id
        return response
