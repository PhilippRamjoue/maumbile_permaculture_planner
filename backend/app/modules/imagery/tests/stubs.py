"""Offline stand-ins for the upstream tile servers (no live network in CI)."""

from __future__ import annotations

import httpx

# Smallest valid 1x1 PNG / JPEG headers: enough for content sniffing and byte-equality checks.
PNG_TILE = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\xbd\xc2"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)
JPEG_TILE = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


class StubUpstream:
    """An ``httpx.MockTransport`` handler that records requests and answers from a script."""

    def __init__(
        self,
        body: bytes = JPEG_TILE,
        content_type: str = "image/jpeg",
        status: int = 200,
    ) -> None:
        self.body = body
        self.content_type = content_type
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(
            self.status, content=self.body, headers={"content-type": self.content_type}
        )

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))
