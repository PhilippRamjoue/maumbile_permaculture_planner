"""Bound expensive in-process work without building an unbounded waiting queue."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class CapacityExceeded(Exception):
    pass


class Capacity:
    def __init__(self, limit: int) -> None:
        self._slots = asyncio.Semaphore(limit)

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[None]:
        if self._slots.locked():
            raise CapacityExceeded("The server is busy. Try again shortly.")
        async with self._slots:
            yield
