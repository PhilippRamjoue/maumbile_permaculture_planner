"""Renderer unit tests: pure functions, no database or Docker."""

from __future__ import annotations

import math
import re
import uuid
import zlib
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from unittest.mock import Mock

import pytest
from PIL import Image, ImageDraw

from app.modules.export import render
from app.modules.export.document import (
    ExportElementType,
    ExportFeature,
    ExportLayer,
    PlanDocument,
)
from app.modules.export.geojson import plan_to_geojson
from app.modules.export.rows import MAX_ROW_ICONS, row_points
from app.modules.export.service import filename_for


@pytest.mark.parametrize("px_per_m", [0.5, 3.0])
def test_path_width_is_in_ground_metres_at_each_print_scale(px_per_m: float) -> None:
    widths = []
    for metres in (1, 10):
        path = feature(
            LAYER_ELEMENTS,
            "path",
            {"type": "LineString", "coordinates": [[36.8, -1.2], [36.801, -1.2]]},
            properties={"width_m": metres},
        )
        draw = Mock()
        render._draw_feature(
            draw,
            Image.new("RGB", (1, 1)),
            path,
            render.style_for(path, None),
            lambda x, y: (x, y),
            [],
            [],
            px_per_m=px_per_m,
        )
        widths.append(draw.line.call_args.kwargs["width"])
    assert widths == [max(1, round(m * px_per_m * render.SUPERSAMPLE)) for m in (1, 10)]
    assert widths[1] > widths[0]


def test_planting_row_follows_bends_and_is_bounded() -> None:
    geometry = {
        "type": "LineString",
        "coordinates": [[36.8, -1.2], [36.801, -1.2], [36.801, -1.201]],
    }
    points = row_points(geometry, 20)
    assert points[0] == (36.8, -1.2)
    assert len(points) == 12
    assert any(point[0] == 36.801 and point[1] < -1.2 for point in points)
    assert len(row_points(geometry, 0.001)) <= MAX_ROW_ICONS + 1
    path = feature(
        LAYER_ELEMENTS, "element", geometry, properties={"row_icon": "tree", "row_spacing_m": 20}
    )
    icons: list[render._Icon] = []
    render._draw_feature(
        Mock(),
        Image.new("RGB", (1, 1)),
        path,
        render.style_for(path, None),
        lambda x, y: (x, y),
        [],
        icons,
    )
    assert [icon.xy for icon in icons] == points
    assert all(icon.key == "tree" for icon in icons)


LNG0, LAT0 = 36.80, -1.30
# 1 degree of latitude is 111.2 km (spherical Earth); longitude shrinks by cos(lat).
M_PER_DEG_LAT = render.EARTH_RADIUS_M * math.pi / 180
M_PER_DEG_LNG = M_PER_DEG_LAT * math.cos(math.radians(LAT0))


def square(west_m: float, south_m: float, size_m: float) -> dict[str, Any]:
    """A polygon ``size_m`` metres on a side, offset from the plan origin."""
    x0, y0 = LNG0 + west_m / M_PER_DEG_LNG, LAT0 + south_m / M_PER_DEG_LAT
    x1, y1 = x0 + size_m / M_PER_DEG_LNG, y0 + size_m / M_PER_DEG_LAT
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


LAYER_ZONES = ExportLayer(uuid.uuid4(), "Zones", 0, True)
LAYER_ELEMENTS = ExportLayer(uuid.uuid4(), "Elements", 1, True)
LAYER_HIDDEN = ExportLayer(uuid.uuid4(), "Hidden", 2, False)
POND = ExportElementType(1, "pond", "Pond", "element", "polygon", {"fill": "#29b6f6"})
TREE = ExportElementType(2, "tree", "Tree", "element", "point", {"fill": "#388e3c", "radius": 8})
SWALE = ExportElementType(3, "swale", "Swale", "element", "line", {"stroke": "#0277bd"})
FENCE = ExportElementType(
    4, "fence", "Fence", "element", "line", {"stroke": "#5d4037", "dash": True}
)


def feature(layer: ExportLayer, ftype: str, geometry: dict[str, Any], **kw: Any) -> ExportFeature:
    return ExportFeature(
        id=uuid.uuid4(),
        layer_id=layer.id,
        feature_type=ftype,
        element_type_id=kw.pop("element_type_id", None),
        geometry=geometry,
        properties=kw.pop("properties", {}),
        length_m=0.0,
        area_m2=0.0,
    )


def document(features: list[ExportFeature], **kw: Any) -> PlanDocument:
    return PlanDocument(
        plan_id=uuid.uuid4(),
        name=kw.pop("name", "Master plan"),
        description=kw.pop("description", "South-facing slope"),
        updated_at=datetime(2026, 10, 22, tzinfo=UTC),
        site_name="Test shamba",
        boundary=square(0, 0, 400),
        layers=[LAYER_ZONES, LAYER_ELEMENTS, LAYER_HIDDEN],
        features=features,
        element_types={t.id: t for t in (POND, TREE, SWALE, FENCE)},
        goals=kw.pop("goals", None),
    )


def sample() -> PlanDocument:
    return document(
        [
            feature(
                LAYER_ZONES,
                "zone",
                square(20, 20, 150),
                properties={"zone_number": 1, "color": "#ffa726", "name": "Kitchen garden"},
            ),
            feature(
                LAYER_ELEMENTS,
                "element",
                square(220, 60, 80),
                element_type_id=POND.id,
                properties={"name": "Pond"},
            ),
            feature(
                LAYER_ELEMENTS,
                "element",
                {
                    "type": "Point",
                    "coordinates": [LNG0 + 100 / M_PER_DEG_LNG, LAT0 + 300 / M_PER_DEG_LAT],
                },
                element_type_id=TREE.id,
            ),
            feature(
                LAYER_ELEMENTS,
                "element",
                {
                    "type": "LineString",
                    "coordinates": [
                        [LNG0 + 10 / M_PER_DEG_LNG, LAT0 + 200 / M_PER_DEG_LAT],
                        [LNG0 + 380 / M_PER_DEG_LNG, LAT0 + 260 / M_PER_DEG_LAT],
                    ],
                },
                element_type_id=FENCE.id,
            ),
            feature(LAYER_HIDDEN, "zone", square(10, 10, 30), properties={"zone_number": 5}),
        ]
    )


def test_png_is_a4_landscape_at_200_dpi() -> None:
    img = Image.open(BytesIO(render.render_png(sample())))
    assert img.format == "PNG"
    assert img.size == (2339, 1654)
    assert round(img.info["dpi"][0]) == 200
    assert img.info["Title"] == "Master plan"
    # Not blank: the zone fill and the pond are in the picture.
    colors: set[Any] = {c for _, c in img.getcolors(maxcolors=1 << 20) or []}
    assert any(abs(c[0] - 41) < 20 and abs(c[1] - 182) < 20 and c[2] > 230 for c in colors)


def test_map_is_to_scale() -> None:
    """A 100 m square drawn opaque must span 100 m * px_per_m pixels, and the printed ratio
    must agree with what the pixel size means on A4 at 200 dpi."""
    doc = document(
        [
            feature(
                LAYER_ZONES,
                "zone",
                square(100, 100, 100),
                properties={"zone_number": 1, "color": "#ff0000", "style": {"fill_opacity": 1}},
            )
        ]
    )
    frame = render.plan_frame(doc)
    img = render.render_plan_image(doc)
    row = frame.y + frame.h // 2 + 1  # a row through the square's middle
    red = [x for x in range(img.width) if _is_red(img.getpixel((x, row)))]  # type: ignore[arg-type]
    assert red, "the square should be visible on the middle row"
    assert abs((max(red) - min(red) + 1) - 100 * frame.px_per_m) <= 8  # stroke + antialiasing
    # Printed scale: 1 px = 0.0254/200 m of paper, so 1:N with N = (m/px) / (paper m/px).
    expected = (1 / frame.px_per_m) / (0.0254 / 200)
    assert abs(render._scale_denominator(frame.px_per_m) - expected) / expected < 0.03


def _is_red(px: tuple[int, int, int]) -> bool:
    return px[0] > 200 and px[1] < 60 and px[2] < 60


def test_projection_matches_haversine_at_parcel_scale() -> None:
    project = render.Projection(36.805, -1.295)
    x0, y0 = project(36.800, -1.300)
    x1, y1 = project(36.810, -1.290)
    planar = math.hypot(x1 - x0, y1 - y0)
    a = (
        math.sin(math.radians(0.010) / 2) ** 2
        + math.cos(math.radians(-1.300))
        * math.cos(math.radians(-1.290))
        * math.sin(math.radians(0.010) / 2) ** 2
    )
    great_circle = 2 * render.EARTH_RADIUS_M * math.asin(math.sqrt(a))
    assert abs(planar - great_circle) / great_circle < 1e-3


def test_hidden_layers_are_not_drawn_but_stay_in_geojson() -> None:
    doc = sample()
    drawn = render.drawn_features(doc)
    assert all(f.layer_id != LAYER_HIDDEN.id for f in drawn)
    assert len(plan_to_geojson(doc)["features"]) == 5


def test_draw_order_puts_top_layer_and_points_last() -> None:
    drawn = render.drawn_features(sample())
    # Higher sort_order draws on top, matching the editor; within a layer polygons come first,
    # then lines, then points.
    assert [f.geometry["type"] for f in drawn] == ["Polygon", "Polygon", "LineString", "Point"]
    assert drawn[0].feature_type == "zone"


def test_goals_are_printed_in_the_header_and_exported_as_data() -> None:
    assert render.goals_line(None) is None
    assert render.goals_line({"priorities": [], "vision": " "}) is None
    goals = {"priorities": ["water", "food"], "vision": "A shady\nfamily garden"}
    assert render.goals_line(goals) == "Goals: Water · Food  |  A shady family garden"
    plain = document([], goals=None)
    with_goals = document([], goals=goals)
    assert plan_to_geojson(plain)["plan"]["goals"] is None
    assert plan_to_geojson(with_goals)["plan"]["goals"] == goals
    # A long vision wraps onto a second line instead of being cut off at the first.
    long = {"priorities": ["water"], "vision": "A shady family garden with fruit trees. " * 6}
    probe = Image.new("RGB", (10, 10))
    wrapped = render._wrap(ImageDraw.Draw(probe), render.goals_line(long) or "", 26, 800, 2)
    assert len(wrapped) == 2 and wrapped[1].endswith("…")
    assert render._wrap(ImageDraw.Draw(probe), "Goals: Water", 26, 2000, 2) == ["Goals: Water"]
    # The line takes ink in the band under the sub-title that is empty without goals.
    band = (render.MARGIN, render.MARGIN + 122, render.PAGE_W // 2, render.MARGIN + 142)
    assert render.render_plan_image(with_goals).crop(band).getbbox() is not None
    assert render.render_plan_image(plain).crop(band).convert("L").getextrema() == (255, 255)


def test_icons_replace_dots_and_stay_legible_in_greyscale() -> None:
    from app.modules.planning.icons import GLYPHS, ICON_BY_TYPE

    # Every glyph named by the catalog exists, and every glyph is used.
    assert {k for k in ICON_BY_TYPE.values() if k} == set(GLYPHS)

    lng, lat = LNG0 + 0.001, LAT0 + 0.001
    point = {"type": "Point", "coordinates": [lng, lat]}
    tank = ExportElementType(
        9, "water_tank", "Water tank", "element", "point", {"fill": "#0d47a1"}, "tank"
    )
    plain = ExportElementType(
        10, "water_tank", "Water tank", "element", "point", {"fill": "#0d47a1"}, None
    )
    marked = document([feature(LAYER_ELEMENTS, "element", point, element_type_id=9)])
    marked = PlanDocument(**{**marked.__dict__, "element_types": {9: tank}})
    unmarked = PlanDocument(**{**marked.__dict__, "element_types": {9: plain}})
    assert [e.icon for e in render.build_legend(marked, render.drawn_features(marked))] == ["tank"]

    frame = render.plan_frame(marked)
    px, py = frame.project(lng, lat)
    cx, cy = px / render.SUPERSAMPLE, py / render.SUPERSAMPLE
    r = render.ICON_RADIUS
    box = (
        round(frame.x + cx - r),
        round(frame.y + cy - r),
        round(frame.x + cx + r),
        round(frame.y + cy + r),
    )
    with_icon = render.render_plan_image(marked).crop(box).convert("L")
    without = render.render_plan_image(unmarked).crop(box).convert("L")
    # The badge has dark ink (rim and glyph strokes) and a light glyph on the dark fill.
    shades = list(with_icon.tobytes())
    assert min(shades) < 80 and max(shades) > 200
    assert with_icon.tobytes() != without.tobytes()


def test_legend_lists_each_kind_once_with_readable_labels() -> None:
    doc = sample()
    labels = [e.label for e in render.build_legend(doc, render.drawn_features(doc))]
    assert labels == ["Zone 1", "Fence", "Pond", "Tree"]  # "Zone 5" is on a hidden layer


def test_user_color_wins_over_catalogue() -> None:
    f = feature(LAYER_ELEMENTS, "element", square(0, 0, 10), properties={"color": "#112233"})
    assert render.style_for(f, POND).color == (0x11, 0x22, 0x33)
    bad = feature(LAYER_ELEMENTS, "element", square(0, 0, 10), properties={"color": "red"})
    assert render.style_for(bad, POND).color == (0x29, 0xB6, 0xF6)  # falls back to the catalogue


def test_dashes_cover_the_line_with_gaps() -> None:
    segs = list(render._dashes([(0, 0), (100, 0)], 10, 10))
    assert len(segs) == 5
    assert segs[0] == [(0, 0), (10.0, 0.0)]


def test_empty_plan_still_renders() -> None:
    img = Image.open(BytesIO(render.render_png(document([]))))
    assert img.size == (2339, 1654)


def test_long_and_unicode_names_do_not_break_rendering() -> None:
    doc = document(
        [
            feature(
                LAYER_ELEMENTS,
                "element",
                square(5, 5, 20),
                properties={"name": "Shamba ya Mama ñ ü 🌱" * 5},
            )
        ],
        name="Mpango wa Shamba " * 20,
    )
    assert Image.open(BytesIO(render.render_png(doc))).size == (2339, 1654)


def test_pdf_is_a_valid_single_page_document() -> None:
    pdf = render.render_pdf(sample())
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")
    # Every xref offset points at its "N 0 obj".
    xref_at = int(re.search(rb"startxref\n(\d+)\n", pdf).group(1))  # type: ignore[union-attr]
    table = pdf[xref_at:].split(b"\n")
    assert table[0] == b"xref"
    count = int(table[1].split()[1])
    for number in range(1, count):
        offset = int(table[2 + number][:10])
        assert pdf[offset : offset + len(f"{number} 0 obj".encode())] == f"{number} 0 obj".encode()
    media = re.search(rb"/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", pdf)
    assert media is not None
    assert (float(media.group(1)), float(media.group(2))) == (842.04, 595.44)  # A4 landscape, pt
    # The embedded image decompresses to exactly W*H*3 bytes.
    stream = pdf.split(b"/Length ", 2)[1]
    length = int(stream.split(b" ", 1)[0])
    body = stream.split(b"stream\n", 1)[1][:length]
    assert len(zlib.decompress(body)) == 2339 * 1654 * 3


def test_geojson_features_match_the_batch_endpoint_shape() -> None:
    doc = sample()
    out = plan_to_geojson(doc)
    assert out["type"] == "FeatureCollection"
    assert {la["name"] for la in out["layers"]} == {"Zones", "Elements", "Hidden"}
    first = out["features"][0]
    assert set(first) == {
        "type",
        "id",
        "layer_id",
        "feature_type",
        "element_type_id",
        "geometry",
        "properties",
    }


def test_filename_is_ascii_and_never_empty() -> None:
    assert filename_for("Mpango wa Shamba #1", "png") == "mpango-wa-shamba-1.png"
    assert filename_for("日本語", "pdf") == "plan.pdf"
    assert filename_for("../../etc/passwd", "png") == "etc-passwd.png"
