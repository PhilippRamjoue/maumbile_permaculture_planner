"""Imagery: provider adapters, the tile proxy endpoint and the Postgres-backed tile cache (WP4).

The browser never calls an imagery provider directly. It asks
``/api/v1/sites/{id}/imagery/{z}/{x}/{y}.png``; the region resolver picks the provider for the
site's country/bbox, the proxy fetches the tile and caches it **only if** the provider declares
``cacheable`` (docs/ARCHITECTURE.md §7.1).
"""
