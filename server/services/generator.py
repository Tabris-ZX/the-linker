from __future__ import annotations

import json
import random
import subprocess
import time
from pathlib import Path
from typing import Any

from server.config import PROJECT_ROOT
from server.services.levels import normalize_level_difficulty
from server.utils.http import http_error

GENERATOR_CONFIG_PATH = PROJECT_ROOT / "config" / "settings" / "generator.json"
GENERATOR_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "generate-alpha-levels.mjs"
GRID_TYPES = {"square", "right-triangle", "equilateral-triangle"}


def generate_editor_level(request_payload: dict[str, Any]) -> dict[str, Any]:
    difficulty = normalize_level_difficulty(request_payload.get("difficulty", 1))
    grid_type = normalize_grid_type(request_payload.get("gridType", "square"))
    profiles = pick_generator_profiles(difficulty, grid_type)
    last_message = "生成失败"
    for profile in profiles:
        try:
            return run_generator_profile(request_payload, difficulty, grid_type, profile)
        except subprocess.TimeoutExpired:
            last_message = "生成超时，请降低点对数或尺寸"
        except RuntimeError as error:
            last_message = str(error) or "生成失败"
    raise http_error(500, "Error", last_message)


def run_generator_profile(request_payload: dict[str, Any], difficulty: int, grid_type: str, profile: dict[str, Any]) -> dict[str, Any]:
    pairs = clamp_int(profile.get("pairs", 5), 1, 16)

    args = [
        "node",
        str(GENERATOR_SCRIPT_PATH),
        "--dry-run",
        "--json",
        "--no-rebuild",
        "--type",
        grid_type,
        "--difficulty",
        str(difficulty),
        "--pairs",
        str(pairs),
        "--seed",
        str(int(time.time() * 1000) + random.randint(0, 99999)),
        "--attempts",
        str(clamp_int(request_payload.get("attempts", profile.get("attempts", 40)), 1, 500)),
    ]

    if grid_type == "equilateral-triangle":
        args.extend(["--radius", str(clamp_int(profile.get("radius", 3), 1, 6))])
    else:
        width = clamp_int(profile.get("width", 7), 1, 19)
        height = clamp_int(profile.get("height", 5), 1, 17)
        args.extend(["--width", str(width), "--height", str(height)])

    loop_passes = clamp_int(request_payload.get("loopPasses", profile.get("loopPasses", 360)), 0, 5000)
    args.extend([
        "--loop-passes",
        str(loop_passes),
    ])
    if profile.get("qualityCandidates") or grid_type == "square":
        args.extend(["--quality-candidates", str(clamp_int(profile.get("qualityCandidates", 3), 1, 20))])

    result = subprocess.run(
        args,
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        timeout=clamp_int(profile.get("timeout", 24), 5, 45),
        check=False,
    )

    if result.returncode != 0:
        message = summarize_generator_error(result.stderr or result.stdout or "生成失败")
        raise RuntimeError(message)

    try:
        generated = json.loads(result.stdout)
        level = generated["levels"][0]
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
        raise RuntimeError("生成器输出格式无效") from error

    return level


def pick_generator_profiles(difficulty: int, grid_type: str) -> list[dict[str, Any]]:
    config = read_generator_config()
    editor_config = config.get("editorGenerator", {})
    profiles = (
        editor_config
        .get("profiles", {})
        .get(str(difficulty), {})
        .get(grid_type, [])
    )
    if not isinstance(profiles, list) or not profiles:
        profiles = [{"radius": 3, "pairs": 5}] if grid_type == "equilateral-triangle" else [{"width": 7, "height": 5, "pairs": 5}]

    merged = []
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        merged.extend(expand_generator_profile(editor_config, difficulty, grid_type, profile))
    return random.sample(merged, len(merged)) if merged else [{}]


def expand_generator_profile(editor_config: dict[str, Any], difficulty: int, grid_type: str, profile: dict[str, Any]) -> list[dict[str, Any]]:
    repeat = clamp_int(profile.get("repeat", 1), 1, 20)
    merged = merge_generator_profile(editor_config, difficulty, grid_type, profile)
    merged.pop("repeat", None)
    return [merged.copy() for _ in range(repeat)]


def merge_generator_profile(editor_config: dict[str, Any], difficulty: int, grid_type: str, profile: dict[str, Any]) -> dict[str, Any]:
    return {
        **object_config(editor_config.get("defaults")),
        **profile,
    }


def read_generator_config() -> dict[str, Any]:
    try:
        payload = json.loads(GENERATOR_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def object_config(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_grid_type(value: Any) -> str:
    grid_type = str(value or "square")
    if grid_type not in GRID_TYPES:
        raise http_error(500, "Error", "不支持的格子类型")
    return grid_type


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = minimum
    return min(maximum, max(minimum, number))


def summarize_generator_error(output: str) -> str:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        return "生成失败"
    for line in reversed(lines):
        if line.startswith("Error: ") or "Failed to generate" in line or "Generated " in line:
            return line.replace("Error: ", "", 1)
    return lines[-1]
