"""
Warp Ladger — Production Rate Limiter (Section 27)
Enforces distributed sliding-window rate limiting using Redis,
with in-memory fallback for test and standalone developer environments.

Returns HTTP 429 Too Many Requests with:
- Retry-After
- X-RateLimit-Limit
- X-RateLimit-Remaining
- X-RateLimit-Reset
"""
import collections
import time
from typing import Callable, Optional

import structlog
from fastapi import HTTPException, Request, Response, status

from app.core.config import settings

log = structlog.get_logger(__name__)

# In-memory sliding-window store: key -> list of timestamps
_in_memory_buckets: dict[str, list[float]] = collections.defaultdict(list)


class RateLimiter:
    """
    FastAPI dependency for rate limiting specific critical endpoints.
    Usage:
        Depends(RateLimiter(requests_per_minute=10, key_prefix="auth:login"))
    """

    def __init__(self, requests_per_minute: int, key_prefix: str = "rate_limit"):
        self.requests_per_minute = requests_per_minute
        self.key_prefix = key_prefix
        self.window_seconds = 60

    async def __call__(self, request: Request, response: Response) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return

        # Determine client identifier: authenticated user or remote IP
        user_id = request.state._state.get("user_id") if hasattr(request.state, "_state") else None
        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        identifier = f"{user_id or client_ip}"
        bucket_key = f"{self.key_prefix}:{identifier}"

        now = time.time()
        window_start = now - self.window_seconds

        # Attempt Redis if available
        redis_client = getattr(request.app.state, "redis", None)
        if redis_client:
            try:
                pipe = redis_client.pipeline()
                pipe.zremrangebyscore(bucket_key, 0, window_start)
                pipe.zcard(bucket_key)
                pipe.zadd(bucket_key, {str(now): now})
                pipe.expire(bucket_key, self.window_seconds)
                _, count, _, _ = await pipe.execute()

                remaining = max(0, self.requests_per_minute - count)
                response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
                response.headers["X-RateLimit-Remaining"] = str(remaining)
                response.headers["X-RateLimit-Reset"] = str(int(now + self.window_seconds))

                if count >= self.requests_per_minute:
                    retry_after = int(self.window_seconds)
                    response.headers["Retry-After"] = str(retry_after)
                    log.warning("rate_limit_exceeded", key=bucket_key, count=count)
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "message": "Too many requests. Please slow down.",
                            "retry_after_seconds": retry_after,
                        },
                        headers={"Retry-After": str(retry_after)},
                    )
                return
            except HTTPException:
                raise
            except Exception as e:
                log.debug("redis_rate_limit_fallback", error=str(e))

        # In-memory sliding window fallback
        timestamps = _in_memory_buckets[bucket_key]
        # Prune older than 60s
        _in_memory_buckets[bucket_key] = [t for t in timestamps if t > window_start]
        current_count = len(_in_memory_buckets[bucket_key])

        remaining = max(0, self.requests_per_minute - current_count)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(now + self.window_seconds))

        if current_count >= self.requests_per_minute:
            retry_after = int(self.window_seconds - (now - _in_memory_buckets[bucket_key][0]))
            retry_after = max(1, retry_after)
            response.headers["Retry-After"] = str(retry_after)
            log.warning("rate_limit_exceeded_memory", key=bucket_key, count=current_count)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Too many requests. Please slow down.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        _in_memory_buckets[bucket_key].append(now)
