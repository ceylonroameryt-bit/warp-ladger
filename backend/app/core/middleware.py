"""
Warp Ladger — FastAPI Middleware Stack
Request IDs, security headers, timing, and rate limiting.
"""
import time
import uuid
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match
from starlette.types import ASGIApp

log = structlog.get_logger(__name__)


# ─── Request ID Middleware ────────────────────────────────────
class RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects a unique X-Request-ID header on every request/response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ─── Timing Middleware ────────────────────────────────────────
class TimingMiddleware(BaseHTTPMiddleware):
    """Adds X-Process-Time header and logs slow requests."""

    SLOW_REQUEST_THRESHOLD_MS = 1000

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Process-Time"] = f"{duration_ms}ms"

        if duration_ms > self.SLOW_REQUEST_THRESHOLD_MS:
            log.warning(
                "slow_request",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
            )
        return response


# ─── Security Headers Middleware ──────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security headers to every response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        if "location" in response.headers:
            loc = response.headers["location"]
            for prefix in ("https://127.0.0.1:8001", "http://127.0.0.1:8001", "https://localhost:8001", "http://localhost:8001"):
                if loc.startswith(prefix):
                    response.headers["location"] = loc[len(prefix):]
                    break
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Section 32: camera=(self) allows trusted same-origin photo capture for Smart Document capture
        response.headers["Permissions-Policy"] = (
            "camera=(self), microphone=(), geolocation=(), payment=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        # HSTS — only on HTTPS
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response


# ─── CSRF Protection Middleware (Section 28) ─────────────────
class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    Enforces CSRF protection for cookie-authenticated browser requests.
    Validates Origin/Referer against allowed origins on POST, PUT, PATCH, DELETE.
    """

    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
    EXEMPT_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method in self.SAFE_METHODS or request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Only apply CSRF check if authenticated via cookie
        has_auth_cookie = bool(request.cookies.get("wl_access_token"))
        if not has_auth_cookie:
            return await call_next(request)

        # Check Origin or Referer
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")

        from app.core.config import settings
        from urllib.parse import urlparse

        allowed_hosts = set(settings.ALLOWED_HOSTS)
        allowed_origins = set(settings.CORS_ORIGINS)

        # Extract origin from referer if origin header omitted
        req_origin = origin
        if not req_origin and referer:
            parsed = urlparse(referer)
            req_origin = f"{parsed.scheme}://{parsed.netloc}"

        if req_origin:
            parsed_origin = urlparse(req_origin)
            is_allowed = (
                req_origin in allowed_origins
                or parsed_origin.hostname in allowed_hosts
                or parsed_origin.hostname in ("localhost", "127.0.0.1", "testserver")
            )
            if not is_allowed:
                log.warning("csrf_origin_mismatch", origin=req_origin, path=request.url.path)
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF verification failed: origin not authorized."},
                )

        return await call_next(request)


# ─── Trailing Slash Normalization Middleware ─────────────────
class TrailingSlashMiddleware(BaseHTTPMiddleware):
    """
    Prevents 307 redirects for missing trailing slashes by matching routes
    internally and rewriting scope path so proxies and tunnels don't loop.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if not path.endswith("/") and "." not in path.split("/")[-1]:
            test_scope = dict(request.scope)
            test_scope["path"] = path + "/"
            for route in request.app.routes:
                match, _ = route.matches(test_scope)
                if match == Match.FULL:
                    request.scope["path"] = path + "/"
                    break
        return await call_next(request)


