import os
import time
from collections import defaultdict, deque
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


DEFAULT_SERVICE_TOKEN = "team-b-lab-token"
PUBLIC_PATHS = {
    "/",
    "/health",
    "/ready",
    "/docs",
    "/redoc",
    "/openapi.json",
}
RATE_LIMIT = 1000
RATE_WINDOW_SECONDS = 1.0


class TeamBContractMiddleware(BaseHTTPMiddleware):
    """Correlation ID, optional lab service auth, and a local in-memory rate limit."""

    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid4()))
        path = request.url.path
        protected_path = (
            path.startswith("/api/v1/")
            or path.startswith("/internal/v1/")
        )

        if protected_path and path not in PUBLIC_PATHS:
            expected_token = os.getenv("TEAM_B_API_TOKEN")
            if expected_token is not None and expected_token != "":
                authorization = request.headers.get("Authorization", "")
                if authorization != f"Bearer {expected_token}":
                    return JSONResponse(
                        status_code=401,
                        content={
                            "error": {
                                "code": "UNAUTHORIZED",
                                "message": "Bearer service credential required",
                                "details": [],
                            },
                            "meta": {"correlation_id": correlation_id},
                        },
                    )

                client_key = request.client.host if request.client else "local"
                now = time.monotonic()
                bucket = self._hits[client_key]
                while bucket and now - bucket[0] > RATE_WINDOW_SECONDS:
                    bucket.popleft()
                if len(bucket) >= RATE_LIMIT:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": {
                                "code": "RATE_LIMITED",
                                "message": "Too many requests",
                                "details": [],
                            },
                            "meta": {"correlation_id": correlation_id},
                        },
                    )
                bucket.append(now)
            else:
                client_key = request.client.host if request.client else "local"
                now = time.monotonic()
                bucket = self._hits[client_key]
                while bucket and now - bucket[0] > RATE_WINDOW_SECONDS:
                    bucket.popleft()
                if len(bucket) >= RATE_LIMIT:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "error": {
                                "code": "RATE_LIMITED",
                                "message": "Too many requests",
                                "details": [],
                            },
                            "meta": {"correlation_id": correlation_id},
                        },
                    )
                bucket.append(now)

        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-API-Version"] = "v1"
        return response
