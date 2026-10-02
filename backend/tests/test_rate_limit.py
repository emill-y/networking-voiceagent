import uuid

import pytest
from fastapi import HTTPException

from app.core.rate_limit import RateLimiter


def test_rate_limit_per_user_and_window():
    limiter = RateLimiter(max_requests=2, per_seconds=60)
    alice, bob = uuid.uuid4(), uuid.uuid4()
    limiter.check(alice, now=0)
    limiter.check(alice, now=1)
    with pytest.raises(HTTPException) as info:
        limiter.check(alice, now=2)
    assert info.value.status_code == 429
    assert info.value.headers["Retry-After"] == "59"
    limiter.check(bob, now=2)  # other users are unaffected
    limiter.check(alice, now=61)  # the window has moved on
