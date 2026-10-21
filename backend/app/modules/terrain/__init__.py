"""Terrain: DEM fetch and slope/contour derivation for a site (WP5).

A planning aid, deliberately **not** a survey instrument: Copernicus GLO-30 has ~30 m posts and
metre-level vertical error, so results show where water tends to flow and where land is steep,
not engineered grades.

Terrain never changes, so it is derived once per site (a FastAPI background task, lean v1: no
queue or worker) and stored; later requests serve the stored result. See docs/ARCHITECTURE.md §7.3.
"""
