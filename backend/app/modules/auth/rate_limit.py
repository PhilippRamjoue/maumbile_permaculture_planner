"""Small in-memory sliding-window rate limiter.

State is per process. That is fine for the lean single-backend deployment; when the optional
Redis scale-up is enabled, swap the storage behind this same interface.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self,
        *,
        max_attempts: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max_attempts
        self._window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> float | None:
        """Record an attempt. Returns ``None`` if allowed, else seconds until retry is allowed."""
        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self._window:
            hits.popleft()
        if len(hits) >= self._max:
            return max(self._window - (now - hits[0]), 1.0)
        hits.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()
