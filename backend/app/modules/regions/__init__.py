"""Region resolution, provider registry and attribution (WP3B).

Three layers (see docs/ARCHITECTURE.md §7.0):

1. provider adapters (code) -- registered in a :class:`ProviderRegistry`;
2. region profiles (data)   -- per-country ordered provider chains, see ``seed.py``;
3. a generic resolver       -- :class:`RegionResolver`, no per-country branching.
"""
