from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from typing import Any

from server.config import get_settings


def create_level_hash(level: dict[str, Any]) -> dict[str, str]:
    canonical = canonicalize_level(level)
    return {"hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(), "canonical": canonical}


def create_empty_levels_hash_index() -> dict[str, Any]:
    return {
        "version": 1,
        "algorithm": "sha256:canonical-level-v1",
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "levels": {},
        "hashes": {},
    }


def add_level_hash_to_index(index: dict[str, Any], level_id: str, level_hash: dict[str, str]) -> dict[str, Any]:
    next_index = remove_level_hash_from_index(index, level_id)
    next_index["levels"][level_id] = {"hash": level_hash["hash"], "canonical": level_hash["canonical"]}
    next_index["hashes"][level_hash["hash"]] = sorted(set(next_index["hashes"].get(level_hash["hash"], []) + [level_id]))
    next_index["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return next_index


def remove_level_hash_from_index(index: dict[str, Any], level_id: str) -> dict[str, Any]:
    current_hash = index["levels"].get(level_id, {}).get("hash")
    if not current_hash:
        return index
    index["levels"].pop(level_id, None)
    index["hashes"][current_hash] = [item for item in index["hashes"].get(current_hash, []) if item != level_id]
    if not index["hashes"][current_hash]:
        index["hashes"].pop(current_hash, None)
    return index


def write_levels_hash_index(index: dict[str, Any]) -> None:
    levels_hash_file = get_settings().levels_hash_file
    levels_hash_file.parent.mkdir(parents=True, exist_ok=True)
    levels_hash_file.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def canonicalize_level(level: dict[str, Any]) -> str:
    grid_type = normalize_grid_type(level.get("gridType", "square"))
    variants = [canonicalize_variant(level, grid_type, transform) for transform in get_level_transforms(level, grid_type)]
    return sorted(variants)[0] if variants else ""


def canonicalize_variant(level: dict[str, Any], grid_type: str, transform: Any) -> str:
    removed_edges = sorted(filter(None, [transform_edge(edge, transform) for edge in level.get("removedEdges", [])]))
    pair_points = []
    for pair in level.get("pairs", []):
        points = pair.get("points", [])[:2] if isinstance(pair, dict) else []
        key = "~".join(sorted(point_key(transform(point)) for point in points))
        if key:
            pair_points.append(key)
    payload = {
        "gridType": grid_type,
        "size": get_transformed_size(level, grid_type, transform),
        "removedEdges": removed_edges,
        "pairs": sorted(pair_points),
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def get_level_transforms(level: dict[str, Any], grid_type: str) -> list[Any]:
    if grid_type == "equilateral-triangle":
        return [
            lambda point: [point[0], point[1]],
            lambda point: [-point[1], point[0] + point[1]],
            lambda point: [-point[0] - point[1], point[0]],
            lambda point: [-point[0], -point[1]],
            lambda point: [point[1], -point[0] - point[1]],
            lambda point: [point[0] + point[1], -point[0]],
        ]

    width = number(level.get("width", 0))
    height = number(level.get("height", 0))
    transforms = [
        (lambda p, w, h: [p[0], p[1], w, h]),
        (lambda p, w, h: [w - p[0], h - p[1], w, h]),
        (lambda p, w, h: [h - p[1], w - p[0], h, w]),
        (lambda p, w, h: [p[1], w - p[0], h, w]),
    ]
    mapped_transforms = []
    for transform in transforms:
        transformed_origin = transform([0, 0], width, height)
        if transformed_origin[2] == width and transformed_origin[3] == height:
            def mapped(point: list[Any], selected_transform: Any = transform, size: list[float] = transformed_origin[2:4]) -> list[float]:
                return selected_transform(point, width, height)[:2]
            mapped.size = transformed_origin[2:4]  # type: ignore[attr-defined]
            mapped_transforms.append(mapped)
    return mapped_transforms


def get_transformed_size(level: dict[str, Any], grid_type: str, transform: Any) -> dict[str, Any]:
    if grid_type == "equilateral-triangle":
        return {"radius": number(level.get("radius", level.get("width", 0)))}
    width = number(level.get("width", 0))
    height = number(level.get("height", 0))
    next_width, next_height = getattr(transform, "size", [width, height])
    return {"width": next_width, "height": next_height}


def transform_edge(edge: str, transform: Any) -> str:
    points = points_from_edge_key(edge)
    if not points:
        return ""
    return edge_key(transform(points[0]), transform(points[1]))


def normalize_grid_type(grid_type: Any = "square") -> str:
    return "right-triangle" if grid_type == "triangle" else str(grid_type)


def points_from_edge_key(edge: str) -> list[list[float]] | None:
    points = [point_from_key(point) for point in str(edge).split("|")]
    if len(points) != 2 or any(any(math.isnan(value) for value in point) for point in points):
        return None
    return points


def point_from_key(key: str) -> list[float]:
    return [number(part, nan=True) for part in str(key).split(",")]


def edge_key(left: list[Any], right: list[Any]) -> str:
    a = point_key(left)
    b = point_key(right)
    return f"{a}|{b}" if a < b else f"{b}|{a}"


def point_key(point: list[Any]) -> str:
    return f"{format_js_number(point[0])},{format_js_number(point[1])}"


def number(value: Any, nan: bool = False) -> float | int:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return math.nan if nan else 0
    if parsed.is_integer():
        return int(parsed)
    return parsed


def format_js_number(value: Any) -> str:
    parsed = number(value)
    return str(parsed)
