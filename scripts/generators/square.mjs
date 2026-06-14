import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { isAdjacent, keyOf } from "../../webui/src/utils/geometry.js";

export function buildSquareDifficultyPackJobs(config) {
  const specs = [1, 2, 3, 4, 5].map((difficulty) => ({
    difficulty,
    sizes: squareDifficultySizes(difficulty)
  }));
  return specs.flatMap((spec) => spec.sizes.map(([width, height, pairs], index) => ({
    config: {
      ...config,
      gridType: "square",
      difficulty: spec.difficulty,
      width,
      height,
      count: 1,
      pairs,
      name: config.name || `Alpha Square D${spec.difficulty}-${index + 1}`
    },
    index
  })));
}

export function squareDifficultySizes(difficulty) {
  const level = Math.max(1, Math.min(5, Number(difficulty) || 1));
  return [0, 1, 2, 3, 4].map((offset) => {
    const width = 3 * level - 2 + offset;
    const height = 2 * level + Math.min(offset, 2);
    return [width, height, Math.min(width, height) + 1];
  });
}

export function buildSquareGeneratedCandidate({ level, config, index, attempt, rng, targetPairs, context }) {
  const reference = runReferenceNumberlinkGenerator({
    rootDir: context.rootDir,
    width: level.width + 1,
    height: level.height + 1,
    seed: config.seed + index * 1009 + attempt * 9176,
    targetPairs
  });
  const segments = traceReferenceSolution(reference, level.gridType);
  return context.candidateFromSegments(level, segments);
}

function runReferenceNumberlinkGenerator({ rootDir, width, height, seed, targetPairs }) {
  const generatorDir = join(rootDir, "files/numberlink-master/gen");
  const minPairs = Math.max(2, targetPairs - 1);
  const maxPairs = Math.max(minPairs, targetPairs + 1);
  const source = `
import json
import random
import sys

sys.path.insert(0, ${JSON.stringify(generatorDir)})
import gen
from mitm import Mitm

random.seed(${JSON.stringify(seed)})
w = ${JSON.stringify(width)}
h = ${JSON.stringify(height)}
mitm = Mitm(lr_price=2, t_price=1)
mitm.prepare(min(20, max(h, 6)))
grid = gen.make(w, h, mitm, min_numbers=${JSON.stringify(minPairs)}, max_numbers=${JSON.stringify(maxPairs)})
tube_grid, uf = grid.make_tubes()

roots = {}
solution = []
endpoints = {}
for y in range(h):
    row = []
    for x in range(w):
        root = str(uf.find((x, y)))
        if root not in roots:
            roots[root] = str(len(roots) + 1)
        label = roots[root]
        row.append(label)
        if tube_grid[x, y] == 'x':
            endpoints.setdefault(label, []).append([x, y])
    solution.append(row)

print(json.dumps({"width": w, "height": h, "solution": solution, "endpoints": endpoints}, separators=(",", ":")))
`;
  const result = runPython(source, rootDir);
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "unknown reference generator error").trim();
    throw new Error(`Reference generator failed: ${message}`);
  }
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function runPython(source, rootDir) {
  const options = {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  };
  const first = spawnSync("python", ["-c", source], options);
  if (!first.error || first.error.code !== "ENOENT") return first;
  return spawnSync("python3", ["-c", source], options);
}

function traceReferenceSolution(reference, gridType) {
  const segments = [];
  const labels = Object.keys(reference.endpoints).sort((a, b) => Number(a) - Number(b));
  for (const label of labels) {
    const endpoints = reference.endpoints[label] ?? [];
    if (endpoints.length !== 2) continue;
    const segment = traceReferenceSegment(reference.solution, label, endpoints[0], endpoints[1], gridType);
    if (segment.length >= 2) segments.push(segment);
  }
  return segments;
}

function traceReferenceSegment(solution, label, start, end, gridType) {
  const width = solution[0]?.length ?? 0;
  const height = solution.length;
  const endKey = pointKey(end);
  const path = [start];
  const seen = new Set([pointKey(start)]);
  while (pointKey(path[path.length - 1]) !== endKey) {
    const current = path[path.length - 1];
    const next = neighbors({ gridType }, current)
      .filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height)
      .find((point) => solution[point[1]][point[0]] === label && !seen.has(pointKey(point)));
    if (!next) break;
    path.push(next);
    seen.add(pointKey(next));
    if (path.length > width * height) break;
  }
  if (pointKey(path[path.length - 1]) !== endKey) {
    throw new Error(`Unable to trace reference solution segment ${label}`);
  }
  return path;
}

function neighbors(level, point) {
  const [x, y] = point;
  const candidates = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
    [x + 1, y + 1],
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1]
  ];
  return candidates.filter((candidate) => isAdjacent(point, candidate, level.gridType));
}

function pointKey(point) {
  return keyOf(point[0], point[1]);
}
