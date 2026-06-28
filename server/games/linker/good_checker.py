from __future__ import annotations

import math
import time
from typing import Any

from server.utils.http import http_error

DEFAULT_SOLVE_MS = 4000


def check_level_good(
    level: dict[str, Any],
    answers: list[dict[str, Any]] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Check whether authored square paths have no shorter local reroute."""
    config = options or {}
    solve_ms = clamp_int(config.get("solveMs", DEFAULT_SOLVE_MS), 100, 60000)
    started_at = time.monotonic()
    deadline = started_at + solve_ms / 1000

    normalized = normalize_level(level)
    if normalized["gridType"] != "square":
        raise http_error(400, "Bad Request", "好解检查目前只支持方格")
    if not isinstance(answers, list) or not answers:
        raise http_error(400, "Bad Request", "好解检查需要 answers 里的作者答案线路")

    graph = build_playable_graph(normalized)
    pair_specs = build_pair_specs(normalized, graph)
    paths = paths_from_answers(normalized, answers, pair_specs, graph)
    required_nodes = set(graph.keys())
    filled_nodes: set[str] = set()
    bad_pairs = []

    for pair in pair_specs:
        if time.monotonic() > deadline:
            raise TimeoutError("好解检查超时")
        path = paths[pair["id"]]
        for node_key in path:
            if node_key in filled_nodes:
                raise http_error(400, "Bad Request", f"答案节点 {node_key} 被多条线路占用")
            filled_nodes.add(node_key)

        authored_length = len(path) - 1
        allowed_nodes = set(path)
        shortest_length = shortest_distance(graph, pair["start"], pair["end"], allowed_nodes, authored_length - 1, deadline)
        if 0 <= shortest_length < authored_length:
            bad_pairs.append({
                "pairId": pair["id"],
                "authoredLength": authored_length,
                "shortestLength": shortest_length,
            })

    if filled_nodes != required_nodes:
        missing = sorted(required_nodes - filled_nodes)
        bad_pairs.append({
            "pairId": "",
            "reason": "answer-does-not-cover-board",
            "missingNodes": missing[:12],
            "missingCount": len(missing),
        })

    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    is_good = not bad_pairs
    return {
        "status": "ok",
        "isGood": is_good,
        "badPairs": bad_pairs,
        "checkedMs": elapsed_ms,
        "message": "地图是好解" if is_good else get_bad_message(bad_pairs),
        "method": "square-local-shortest-path",
    }


def paths_from_answers(
    level: dict[str, Any],
    answers: list[dict[str, Any]],
    pair_specs: list[dict[str, str]],
    graph: dict[str, set[str]],
) -> dict[str, list[str]]:
    """把答案边集合还原成每个点对对应的完整路径。"""
    pair_ids = {pair["id"] for pair in pair_specs}
    answer_graphs: dict[str, dict[str, set[str]]] = {pair_id: {} for pair_id in pair_ids}

    for answer in answers:
        pair_id = str(answer.get("pairId", ""))
        if pair_id not in pair_ids:
            raise http_error(400, "Bad Request", f"答案线路使用了无效点对 {pair_id}")
        points = points_from_edge_key(str(answer.get("edge", "")))
        if not points:
            raise http_error(400, "Bad Request", f"答案边格式无效: {answer.get('edge')}")
        left, right = [point_key(point) for point in points]
        if right not in graph.get(left, set()):
            raise http_error(400, "Bad Request", f"答案边 {answer.get('edge')} 不可通行")
        answer_graphs[pair_id].setdefault(left, set()).add(right)
        answer_graphs[pair_id].setdefault(right, set()).add(left)

    paths: dict[str, list[str]] = {}
    for pair in pair_specs:
        pair_graph = answer_graphs[pair["id"]]
        paths[pair["id"]] = trace_answer_path(pair, pair_graph)
    return paths


def trace_answer_path(pair: dict[str, str], graph: dict[str, set[str]]) -> list[str]:
    """沿答案图还原单个点对的连续路径。"""
    start = pair["start"]
    end = pair["end"]
    if start not in graph or end not in graph:
        raise http_error(400, "Bad Request", f"点对 {pair['id']} 没有接入答案线路")

    for node_key, neighbors in graph.items():
        degree = len(neighbors)
        if node_key in {start, end}:
            if degree != 1:
                raise http_error(400, "Bad Request", f"点对 {pair['id']} 的端点度数必须为 1")
        elif degree != 2:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的答案线路存在分叉或断点")

    path = [start]
    previous = ""
    current = start
    while current != end:
        candidates = [node for node in graph.get(current, set()) if node != previous]
        if not candidates:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的两个端点没有连通")
        previous, current = current, candidates[0]
        if current in path:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的答案线路存在环")
        path.append(current)
        if len(path) > len(graph):
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的答案线路过长")
    if set(path) != set(graph.keys()):
        raise http_error(400, "Bad Request", f"点对 {pair['id']} 的答案线路存在未连通片段")
    return path


def shortest_distance(
    graph: dict[str, set[str]],
    start: str,
    end: str,
    allowed_nodes: set[str],
    stop_below_length: int,
    deadline: float,
) -> int:
    """在允许节点集合内寻找最短可通行距离。"""
    queue: list[tuple[str, int]] = [(start, 0)]
    seen = {start}
    cursor = 0
    while cursor < len(queue):
        if time.monotonic() > deadline:
            raise TimeoutError("好解检查超时")
        current, distance = queue[cursor]
        cursor += 1
        if current == end:
            return distance
        if distance >= stop_below_length:
            continue
        for next_key in graph.get(current, set()):
            if next_key not in allowed_nodes or next_key in seen:
                continue
            seen.add(next_key)
            queue.append((next_key, distance + 1))
    return -1


def build_pair_specs(level: dict[str, Any], graph: dict[str, set[str]]) -> list[dict[str, str]]:
    """为每个点对生成最小校验所需的起点、终点信息。"""
    endpoint_owner: dict[str, str] = {}
    pair_specs = []
    for pair in level["pairs"]:
        if len(pair["points"]) != 2:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 需要两个端点")
        start, end = [point_key(point) for point in pair["points"]]
        if start == end:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的两个端点不能重合")
        if start in endpoint_owner or end in endpoint_owner:
            raise http_error(400, "Bad Request", "不同点对不能共用端点")
        if start not in graph or end not in graph:
            raise http_error(400, "Bad Request", f"点对 {pair['id']} 的端点不在可通行图中")
        endpoint_owner[start] = pair["id"]
        endpoint_owner[end] = pair["id"]
        pair_specs.append({"id": pair["id"], "start": start, "end": end})
    if not pair_specs:
        raise http_error(400, "Bad Request", "至少需要一个点对")
    return pair_specs


def build_playable_graph(level: dict[str, Any]) -> dict[str, set[str]]:
    """根据关卡尺寸和移除边构建可通行图。"""
    removed_edges = set(level.get("removedEdges", []))
    graph: dict[str, set[str]] = {}
    for edge in get_all_square_edges(level):
        if edge in removed_edges:
            continue
        points = points_from_edge_key(edge)
        if not points:
            continue
        left, right = [point_key(point) for point in points]
        graph.setdefault(left, set()).add(right)
        graph.setdefault(right, set()).add(left)
    return graph


def get_all_square_edges(level: dict[str, Any]) -> list[str]:
    """列出方格关卡的全部候选边。"""
    width = int(level.get("width", 0))
    height = int(level.get("height", 0))
    edges = []
    for y in range(height + 1):
        for x in range(width):
            edges.append(edge_key([x, y], [x + 1, y]))
    for y in range(height):
        for x in range(width + 1):
            edges.append(edge_key([x, y], [x, y + 1]))
    return edges


def normalize_level(level: dict[str, Any]) -> dict[str, Any]:
    """把关卡输入规范化为好解检查所需的最小字段。"""
    grid_type = str(level.get("gridType", "square") or "square")
    if grid_type != "square":
        return {**level, "gridType": grid_type}
    return {
        **level,
        "gridType": "square",
        "width": clamp_int(level.get("width", 0), 1, 30),
        "height": clamp_int(level.get("height", 0), 1, 30),
        "pairs": normalize_pairs(level.get("pairs", [])),
        "removedEdges": [normalize_edge(edge) for edge in level.get("removedEdges", []) if normalize_edge(edge)],
    }


def normalize_pairs(pairs: Any) -> list[dict[str, Any]]:
    """把关卡点对数组规范为可校验结构。"""
    if not isinstance(pairs, list):
        raise http_error(400, "Bad Request", "pairs 必须是数组")
    normalized = []
    for index, pair in enumerate(pairs):
        if not isinstance(pair, dict):
            continue
        points = [normalize_point(point) for point in pair.get("points", []) if normalize_point(point) is not None]
        normalized.append({"id": str(pair.get("id") or index + 1), "points": points[:2]})
    return normalized


def normalize_edge(edge: Any) -> str:
    """把边规范成稳定的字符串键。"""
    points = points_from_edge_key(str(edge))
    return edge_key(points[0], points[1]) if points else ""


def points_from_edge_key(edge: str) -> list[list[int | float]] | None:
    """把边键解析为两个点坐标。"""
    points = [normalize_point(part) for part in str(edge).split("|")]
    if len(points) != 2 or any(point is None for point in points):
        return None
    return points  # type: ignore[return-value]


def normalize_point(point: Any) -> list[int | float] | None:
    """把点坐标规范为数值数组。"""
    if isinstance(point, str):
        parts = point.split(",")
    elif isinstance(point, list | tuple):
        parts = point
    else:
        return None
    if len(parts) != 2:
        return None
    parsed = [number(parts[0], nan=True), number(parts[1], nan=True)]
    if any(isinstance(value, float) and math.isnan(value) for value in parsed):
        return None
    return parsed


def edge_key(left: list[Any], right: list[Any]) -> str:
    """生成无方向的边键。"""
    left_key = point_key(left)
    right_key = point_key(right)
    return f"{left_key}|{right_key}" if left_key < right_key else f"{right_key}|{left_key}"


def point_key(point: list[Any]) -> str:
    """生成点的字符串键。"""
    return f"{format_number(point[0])},{format_number(point[1])}"


def get_bad_message(bad_pairs: list[dict[str, Any]]) -> str:
    first = bad_pairs[0] if bad_pairs else {}
    if first.get("reason") == "answer-does-not-cover-board":
        return f"答案未铺满地图，缺少 {first.get('missingCount', 0)} 个节点"
    return f"点对 {first.get('pairId')} 存在更短连接：答案 {first.get('authoredLength')} 步，最短 {first.get('shortestLength')} 步"


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = minimum
    return min(maximum, max(minimum, number))


def number(value: Any, nan: bool = False) -> int | float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return math.nan if nan else 0
    return int(parsed) if parsed.is_integer() else parsed


def format_number(value: Any) -> str:
    parsed = number(value)
    return str(parsed)
