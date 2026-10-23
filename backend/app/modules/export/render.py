"""Server-side plan rendering (PNG / PDF): a to-scale vector plan with legend and attribution.

Pure functions over :class:`PlanDocument`; no database, no FastAPI. The page is A4 landscape at
200 dpi, so one pixel is a known distance on paper and the printed scale is honest. The map is
drawn in a local equirectangular projection centred on the plan (sub-0.1 % error at parcel
scale) and supersampled for smooth edges. Aerial imagery is deliberately not composited: it
would need per-provider licensing/caching decisions (see docs/EXPORT.md).
"""

from __future__ import annotations

import math
import zlib
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo
from shapely.geometry import shape

from app.modules.export.document import ExportElementType, ExportFeature, PlanDocument

DPI = 200
PAGE_W, PAGE_H = 2339, 1654  # A4 landscape at 200 dpi
MARGIN = 60
HEADER_H = 150
FOOTER_H = 80
LEGEND_W = 520
GAP = 30
SUPERSAMPLE = 2
EARTH_RADIUS_M = 6_371_008.8
M_PER_PAPER_PX = 0.0254 / DPI  # metres of paper per pixel, for the printed scale ratio
STROKE_SCALE = 1.6  # editor widths are screen pixels; the page is denser

INK = (33, 37, 41)
MUTED = (96, 104, 112)
PAPER = (255, 255, 255)
LAND = (247, 245, 238)
FRAME = (170, 170, 170)
DEFAULT_COLORS = {"zone": "#f59e0b", "sector": "#ef5350", "annotation": "#fdd835"}
DEFAULT_COLOR = "#2f855a"

Color = tuple[int, int, int]
XY = tuple[float, float]
Project = Callable[[float, float], XY]


# ── styling ────────────────────────────────────────────────────────────────────────────────
def _hex(value: Any, fallback: str) -> Color:
    """Parse ``#rrggbb``; anything else falls back to ``fallback`` (or the default green)."""
    for candidate in (value, fallback, DEFAULT_COLOR):
        if isinstance(candidate, str) and len(candidate) == 7 and candidate[0] == "#":
            try:
                return int(candidate[1:3], 16), int(candidate[3:5], 16), int(candidate[5:7], 16)
            except ValueError:
                continue
    raise AssertionError("unreachable: DEFAULT_COLOR is valid")


def _num(source: Any, key: str, fallback: float, low: float, high: float) -> float:
    value = source.get(key) if isinstance(source, dict) else None
    if isinstance(value, bool) or not isinstance(value, int | float):
        return fallback
    return min(max(float(value), low), high)


@dataclass(frozen=True)
class Style:
    color: Color
    stroke_width: float
    radius: float
    opacity: float
    dashed: bool


def style_for(feature: ExportFeature, element_type: ExportElementType | None) -> Style:
    """Per-feature style: user colour/overrides win over the catalogue entry's defaults."""
    base = element_type.default_style if element_type else {}
    user = feature.properties.get("style")
    catalogue_color = base.get("fill") or base.get("stroke")
    fallback = catalogue_color or DEFAULT_COLORS.get(feature.feature_type, DEFAULT_COLOR)
    return Style(
        color=_hex(feature.properties.get("color"), fallback),
        stroke_width=_num(user, "stroke_width", _num(base, "stroke_width", 3, 1, 12), 1, 12),
        radius=_num(user, "radius", _num(base, "radius", 8, 3, 24), 3, 24),
        opacity=_num(user, "fill_opacity", _num(base, "fill_opacity", 0.3, 0, 1), 0, 1),
        dashed=bool(base.get("dash")),
    )


# ── legend model ───────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class LegendEntry:
    label: str
    kind: str  # point | line | polygon
    style: Style


_TYPE_ORDER = {"zone": 0, "sector": 1, "element": 2, "path": 3, "annotation": 4}


def _geometry_kind(geometry: dict[str, Any]) -> str:
    return {"Point": "point", "LineString": "line"}.get(str(geometry.get("type")), "polygon")


def _legend_key(f: ExportFeature, et: ExportElementType | None) -> tuple[Any, ...]:
    if f.feature_type == "zone":
        return ("zone", f.properties.get("zone_number"))
    if f.feature_type == "sector":
        return ("sector", f.properties.get("sector_kind"))
    if et is not None:
        return ("element", et.id)
    return (f.feature_type,)


def _legend_label(f: ExportFeature, et: ExportElementType | None) -> str:
    if f.feature_type == "zone":
        return f"Zone {f.properties.get('zone_number', '?')}"
    if f.feature_type == "sector":
        return f"Sector: {f.properties.get('sector_kind', 'other')}"
    if et is not None:
        return et.name
    return "Note" if f.feature_type == "annotation" else f.feature_type.capitalize()


def build_legend(doc: PlanDocument, features: Sequence[ExportFeature]) -> list[LegendEntry]:
    """One entry per kind of thing drawn (zone number, sector kind, element type)."""
    seen: dict[tuple[Any, ...], tuple[int, LegendEntry]] = {}
    for f in features:
        et = doc.element_types.get(f.element_type_id) if f.element_type_id is not None else None
        key = _legend_key(f, et)
        if key not in seen:
            entry = LegendEntry(_legend_label(f, et), _geometry_kind(f.geometry), style_for(f, et))
            seen[key] = (_TYPE_ORDER.get(f.feature_type, 9), entry)
    return [e for _, e in sorted(seen.values(), key=lambda t: (t[0], t[1].label))]


# ── geometry helpers ───────────────────────────────────────────────────────────────────────
class Projection:
    """Local equirectangular map projection with metric axes (x east, y north)."""

    def __init__(self, lon0: float, lat0: float) -> None:
        self.lon0, self.lat0 = lon0, lat0
        self._kx = EARTH_RADIUS_M * math.cos(math.radians(lat0)) * math.pi / 180
        self._ky = EARTH_RADIUS_M * math.pi / 180

    def __call__(self, lon: float, lat: float) -> XY:
        return (lon - self.lon0) * self._kx, (lat - self.lat0) * self._ky


def _rings(geometry: dict[str, Any]) -> list[list[XY]]:
    """Coordinate sequences (lon, lat) of a Polygon (exterior first) or LineString."""
    kind, coords = geometry.get("type"), geometry.get("coordinates", [])
    if kind == "Polygon":
        return [[(c[0], c[1]) for c in ring] for ring in coords]
    if kind == "LineString":
        return [[(c[0], c[1]) for c in coords]]
    return []


def _all_points(geometry: dict[str, Any]) -> list[XY]:
    if geometry.get("type") == "Point":
        c = geometry["coordinates"]
        return [(c[0], c[1])]
    return [p for ring in _rings(geometry) for p in ring]


def _dashes(points: Sequence[XY], dash: float, gap: float) -> Iterator[list[XY]]:
    """Split a polyline into dash segments of ``dash`` px separated by ``gap`` px."""
    on, remaining = True, dash
    current: list[XY] = [points[0]]
    for (x0, y0), (x1, y1) in zip(points, points[1:], strict=False):
        length = math.hypot(x1 - x0, y1 - y0)
        pos = 0.0
        while length - pos > remaining:
            pos += remaining
            t = pos / length
            pt = (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
            if on:
                current.append(pt)
                yield current
            current = [pt]
            on = not on
            remaining = dash if on else gap
        remaining -= length - pos
        if on:
            current.append((x1, y1))
    if on and len(current) > 1:
        yield current


# ── fonts & text ───────────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=32)
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def _fit(
    draw: ImageDraw.ImageDraw, text: str, size: int, max_w: float, min_size: int = 20
) -> tuple[str, int]:
    """Shrink the font, then ellipsise, until ``text`` fits in ``max_w`` pixels."""
    while size > min_size and draw.textlength(text, font=_font(size)) > max_w:
        size -= 2
    if draw.textlength(text, font=_font(size)) <= max_w:
        return text, size
    while len(text) > 1 and draw.textlength(text + "…", font=_font(size)) > max_w:
        text = text[:-1]
    return text.rstrip() + "…", size


# ── map drawing ────────────────────────────────────────────────────────────────────────────
def _fill_polygon(img: Image.Image, rings: list[list[XY]], color: Color, opacity: float) -> None:
    """Alpha-blend a polygon (holes cut out) into ``img`` through a bbox-sized mask."""
    xs = [p[0] for p in rings[0]]
    ys = [p[1] for p in rings[0]]
    x0, y0 = max(int(min(xs)) - 1, 0), max(int(min(ys)) - 1, 0)
    x1, y1 = min(int(max(xs)) + 2, img.width), min(int(max(ys)) + 2, img.height)
    if x1 <= x0 or y1 <= y0:
        return
    mask = Image.new("L", (x1 - x0, y1 - y0), 0)
    md = ImageDraw.Draw(mask)
    for i, ring in enumerate(rings):
        md.polygon([(x - x0, y - y0) for x, y in ring], fill=round(255 * opacity) if i == 0 else 0)
    img.paste(color, (x0, y0, x1, y1), mask)


@dataclass(frozen=True)
class _Label:
    xy: XY  # final (not supersampled) pixels, relative to the map frame
    text: str
    anchor: str


def _draw_feature(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    f: ExportFeature,
    style: Style,
    project: Project,
    labels: list[_Label],
) -> None:
    ss = SUPERSAMPLE
    kind = f.geometry.get("type")
    width = max(round(style.stroke_width * STROKE_SCALE * ss), 1)
    anchor: tuple[XY, str]
    if kind == "Point":
        x, y = project(*f.geometry["coordinates"][:2])
        r = style.radius * STROKE_SCALE * ss * 0.75
        draw.ellipse((x - r, y - r, x + r, y + r), fill=style.color, outline=PAPER, width=2 * ss)
        anchor = ((x + r) / ss + 6, y / ss), "lm"
    else:
        rings = [[project(*p) for p in ring] for ring in _rings(f.geometry)]
        if not rings or len(rings[0]) < 2:
            return
        if kind == "Polygon":
            _fill_polygon(img, rings, style.color, style.opacity)
            for ring in rings:
                draw.line(ring, fill=style.color, width=width, joint="curve")
            c = shape(f.geometry).representative_point()
            cx, cy = project(c.x, c.y)
            anchor = (cx / ss, cy / ss), "mm"
        else:
            pts = rings[0]
            segments = _dashes(pts, 8 * width, 5 * width) if style.dashed else iter([pts])
            for seg in segments:
                draw.line(seg, fill=style.color, width=width, joint="curve")
            mid = shape(f.geometry).interpolate(0.5, normalized=True)
            mx, my = project(mid.x, mid.y)
            anchor = (mx / ss, my / ss - 14), "mb"
    name = f.properties.get("name")
    if isinstance(name, str) and name.strip():
        labels.append(_Label(anchor[0], name.strip()[:40], anchor[1]))


def _nice_length(target_m: float) -> float:
    """Largest 1/2/5 x 10^k that does not exceed ``target_m``."""
    if target_m <= 0:
        return 1.0
    exp = math.floor(math.log10(target_m))
    for mult in (5, 2, 1):
        if mult * 10**exp <= target_m:
            return float(mult * 10**exp)
    return float(10**exp)


def _format_length(m: float) -> str:
    return f"{m / 1000:g} km" if m >= 1000 else f"{m:g} m"


def _scale_denominator(px_per_m: float) -> int:
    """Printed scale ratio N for 1:N, rounded to two significant figures."""
    ratio = 1 / px_per_m / M_PER_PAPER_PX
    magnitude = 10 ** max(math.floor(math.log10(ratio)) - 1, 0)
    return int(round(ratio / magnitude) * magnitude)


def _draw_scale_bar(
    canvas: ImageDraw.ImageDraw, x: float, y: float, px_per_m: float, max_px: float
) -> None:
    meters = _nice_length(max_px / px_per_m)
    total = meters * px_per_m
    canvas.rectangle((x - 12, y - 46, x + total + 130, y + 24), fill=(255, 255, 255, 215))
    canvas.rectangle((x, y, x + total / 2, y + 12), fill=INK, outline=INK)
    canvas.rectangle((x + total / 2, y, x + total, y + 12), fill=PAPER, outline=INK)
    canvas.text((x, y - 8), "0", font=_font(24), fill=INK, anchor="ls")
    canvas.text((x + total, y - 8), _format_length(meters), font=_font(24), fill=INK, anchor="ms")


def _draw_north_arrow(canvas: ImageDraw.ImageDraw, x: float, y: float) -> None:
    canvas.polygon([(x, y), (x + 16, y + 52), (x, y + 40), (x - 16, y + 52)], fill=INK)
    canvas.text((x, y - 6), "N", font=_font(30), fill=INK, anchor="ms")


# ── legend & chrome ────────────────────────────────────────────────────────────────────────
def _draw_swatch(draw: ImageDraw.ImageDraw, entry: LegendEntry, x: int, y: int) -> None:
    s = entry.style
    cy = y + 20
    if entry.kind == "point":
        draw.ellipse((x + 16, cy - 12, x + 40, cy + 12), fill=s.color, outline=INK, width=1)
    elif entry.kind == "line":
        w = max(round(s.stroke_width * 1.2), 2)
        for seg in (
            _dashes([(x, cy), (x + 56, cy)], 4 * w, 3 * w)
            if s.dashed
            else [[(x, cy), (x + 56, cy)]]
        ):
            draw.line(seg, fill=s.color, width=w)
    else:
        strength = max(s.opacity, 0.35)
        tint = (
            round(255 - (255 - s.color[0]) * strength),
            round(255 - (255 - s.color[1]) * strength),
            round(255 - (255 - s.color[2]) * strength),
        )
        draw.rectangle((x, cy - 13, x + 56, cy + 13), fill=tint, outline=s.color, width=3)


def _draw_legend(
    draw: ImageDraw.ImageDraw, entries: list[LegendEntry], x: int, y: int, h: int
) -> None:
    draw.rectangle((x, y, x + LEGEND_W, y + h), outline=FRAME, width=2)
    draw.text((x + 24, y + 18), "Legend", font=_font(34), fill=INK)
    row_h, top = 52, y + 80
    boundary = LegendEntry("Site boundary", "line", Style((51, 51, 51), 3, 0, 0, True))
    rows = [boundary, *entries]
    capacity = max((y + h - top - 20) // row_h, 1)
    shown = rows if len(rows) <= capacity else rows[: capacity - 1]
    for i, entry in enumerate(shown):
        ry = top + i * row_h
        _draw_swatch(draw, entry, x + 24, ry)
        label, size = _fit(draw, entry.label, 28, LEGEND_W - 130)
        draw.text((x + 100, ry + 20), label, font=_font(size), fill=INK, anchor="lm")
    if len(shown) < len(rows):
        more = f"+ {len(rows) - len(shown)} more types"
        draw.text(
            (x + 24, top + len(shown) * row_h + 20), more, font=_font(26), fill=MUTED, anchor="lm"
        )


GOAL_LABELS = {
    "water": "Water",
    "food": "Food",
    "income": "Income",
    "habitat": "Habitat & biodiversity",
    "beauty": "Beauty",
    "shelter": "Shelter & privacy",
    "education": "Learning & sharing",
    "low_maintenance": "Low maintenance",
}


def goals_line(goals: dict[str, Any] | None) -> str | None:
    """The owner's goals as one printed line, or None when they set none."""
    if not goals:
        return None
    priorities = [GOAL_LABELS.get(str(k), str(k)) for k in goals.get("priorities") or []]
    vision = " ".join(str(goals.get("vision") or "").split())
    parts = []
    if priorities:
        parts.append(" · ".join(priorities))
    if vision:
        parts.append(vision)
    return "Goals: " + "  |  ".join(parts) if parts else None


def _draw_header(draw: ImageDraw.ImageDraw, doc: PlanDocument) -> None:
    width = PAGE_W - 2 * MARGIN
    title, size = _fit(draw, doc.name, 60, width, 32)
    draw.text((MARGIN, MARGIN), title, font=_font(size), fill=INK)
    sub = f"{doc.site_name}  ·  last saved {doc.updated_at:%Y-%m-%d}"
    if doc.description:
        sub += "  ·  " + " ".join(doc.description.split())
    sub, sub_size = _fit(draw, sub, 30, width, 22)
    draw.text((MARGIN, MARGIN + 78), sub, font=_font(sub_size), fill=MUTED)
    goals = goals_line(doc.goals)
    if goals:
        goals, goals_size = _fit(draw, goals, 26, width, 20)
        draw.text((MARGIN, MARGIN + 110), goals, font=_font(goals_size), fill=INK)


def _draw_footer(draw: ImageDraw.ImageDraw, scale_text: str) -> None:
    y = PAGE_H - MARGIN - FOOTER_H + 14
    lines = [
        "Created with Permaculture Planner, free and open-source software (AGPL-3.0). "
        "Positions are WGS84; measurements are geodesic.",
        f"{scale_text}. No aerial imagery is included in this export, so no imagery licence "
        "applies.",
    ]
    for i, line in enumerate(lines):
        text, size = _fit(draw, line, 24, PAGE_W - 2 * MARGIN, 16)
        draw.text((MARGIN, y + i * 32), text, font=_font(size), fill=MUTED)


# ── entry points ───────────────────────────────────────────────────────────────────────────
def drawn_features(doc: PlanDocument) -> list[ExportFeature]:
    """Features on visible layers, bottom layer first; polygons below lines below points."""
    layers = {layer.id: layer for layer in doc.layers if layer.visible}
    rank = {"polygon": 0, "line": 1, "point": 2}
    items = [(layers[f.layer_id].sort_order, f) for f in doc.features if f.layer_id in layers]
    items.sort(key=lambda t: (-t[0], rank[_geometry_kind(t[1].geometry)]))
    return [f for _, f in items]


@dataclass(frozen=True)
class MapFrame:
    """Where the map sits on the page and how metres map to pixels."""

    local: Projection
    cx: float
    cy: float
    px_per_m: float
    x: int
    y: int
    w: int
    h: int

    def project(self, lon: float, lat: float) -> XY:
        """Supersampled map-image pixels of a WGS84 position."""
        x, y = self.local(lon, lat)
        ss = SUPERSAMPLE
        return (
            (self.w / 2 + (x - self.cx) * self.px_per_m) * ss,
            (self.h / 2 - (y - self.cy) * self.px_per_m) * ss,
        )


def fit_map(points: Sequence[XY]) -> MapFrame:
    """Frame all ``points`` (lon, lat) in the page's map area with a 6 % margin each side."""
    lons, lats = [p[0] for p in points], [p[1] for p in points]
    local = Projection((min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2)
    mxs, mys = zip(*(local(*p) for p in points), strict=True)
    ext_w, ext_h = max(max(mxs) - min(mxs), 1.0), max(max(mys) - min(mys), 1.0)
    x, y = MARGIN, MARGIN + HEADER_H
    w = PAGE_W - 2 * MARGIN - LEGEND_W - GAP
    h = PAGE_H - y - MARGIN - FOOTER_H
    return MapFrame(
        local,
        (max(mxs) + min(mxs)) / 2,
        (max(mys) + min(mys)) / 2,
        min(w / (ext_w * 1.12), h / (ext_h * 1.12)),
        x,
        y,
        w,
        h,
    )


def plan_frame(doc: PlanDocument) -> MapFrame:
    pts = _all_points(doc.boundary) + [
        p for f in drawn_features(doc) for p in _all_points(f.geometry)
    ]
    return fit_map(pts)


def render_plan_image(doc: PlanDocument) -> Image.Image:
    drawn = drawn_features(doc)
    frame = plan_frame(doc)
    fx, fy, fw, fh, px_per_m, project = (
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        frame.px_per_m,
        frame.project,
    )
    ss = SUPERSAMPLE

    map_img = Image.new("RGB", (fw * ss, fh * ss), LAND)
    draw = ImageDraw.Draw(map_img)
    labels: list[_Label] = []

    ring = [project(*p) for p in _rings(doc.boundary)[0]]
    _fill_polygon(map_img, [ring], (255, 255, 255), 1.0)
    for seg in _dashes(ring, 24 * ss, 12 * ss):
        draw.line(seg, fill=(51, 51, 51), width=3 * ss, joint="curve")
    for f in drawn:
        et = doc.element_types.get(f.element_type_id) if f.element_type_id is not None else None
        _draw_feature(draw, map_img, f, style_for(f, et), project, labels)

    page = Image.new("RGB", (PAGE_W, PAGE_H), PAPER)
    page.paste(map_img.resize((fw, fh), Image.Resampling.LANCZOS), (fx, fy))
    canvas = ImageDraw.Draw(page, "RGBA")
    canvas.rectangle((fx, fy, fx + fw, fy + fh), outline=FRAME, width=2)
    for label in labels:
        canvas.text(
            (fx + label.xy[0], fy + label.xy[1]),
            label.text,
            font=_font(24),
            fill=INK,
            anchor=label.anchor,
            stroke_width=4,
            stroke_fill=(255, 255, 255, 235),
        )
    _draw_scale_bar(canvas, fx + 30, fy + fh - 50, px_per_m, fw * 0.22)
    _draw_north_arrow(canvas, fx + fw - 50, fy + 50)
    _draw_header(canvas, doc)
    _draw_legend(canvas, build_legend(doc, drawn), fx + fw + GAP, fy, fh)
    _draw_footer(canvas, f"Scale 1:{_scale_denominator(px_per_m):,} when printed at A4 landscape")
    return page


def render_png(doc: PlanDocument) -> bytes:
    info = PngInfo()
    info.add_text("Title", doc.name)
    info.add_text("Software", "Permaculture Planner")
    buf = BytesIO()
    render_plan_image(doc).save(buf, "PNG", dpi=(DPI, DPI), pnginfo=info)
    return buf.getvalue()


def render_pdf(doc: PlanDocument) -> bytes:
    return image_to_pdf(render_plan_image(doc), doc.name)


def _pdf_text(value: str) -> bytes:
    return b"<FEFF" + value.encode("utf-16-be").hex().upper().encode() + b">"


def image_to_pdf(img: Image.Image, title: str) -> bytes:
    """A one-page PDF whose page is the image at 200 dpi, Flate-compressed (lossless)."""
    w, h = img.size
    pw, ph = w * 72 / DPI, h * 72 / DPI
    pixels = zlib.compress(img.convert("RGB").tobytes(), 6)
    content = f"q {pw:.2f} 0 0 {ph:.2f} 0 0 cm /Im0 Do Q".encode()
    bodies: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pw:.2f} {ph:.2f}] "
        f"/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>".encode(),
        f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB "
        f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(pixels)} >>\nstream\n".encode()
        + pixels
        + b"\nendstream",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
        b"<< /Title " + _pdf_text(title) + b" /Producer (Permaculture Planner) >>",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for number, body in enumerate(bodies, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(bodies) + 1}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(bodies) + 1} /Root 1 0 R /Info 6 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)
