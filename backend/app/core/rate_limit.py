"""A small per-user rate limit for the expensive endpoints (AI calls).

It protects the hosted model's quota and your bill from one runaway
client. It's in memory, so with several server instances each counts
separately, which is fine as a safety net. A shared store (e.g. Redis)
would be the upgrade path at larger scale.
"""

import threading
import time
from collections import defaultdict, deque
from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user_id


class RateLimiter:
    def __init__(self, max_requests: int, per_seconds: float) -> None:
        self.max_requests = max_requests
        self.per_seconds = per_seconds
        self._hits: dict[UUID, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, user_id: UUID, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[user_id]
            while hits and now - hits[0] > self.per_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = int(self.per_seconds - (now - hits[0])) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "You're going a bit fast. Please try again in a minute.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)


# Generous for one person capturing notes; tight enough to stop a loop.
ai_limiter = RateLimiter(max_requests=30, per_seconds=60)


def limit_ai_requests(user_id: UUID = Depends(get_current_user_id)) -> UUID:
    ai_limiter.check(user_id)
    return user_id
