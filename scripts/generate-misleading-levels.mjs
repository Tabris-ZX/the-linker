import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEditorLevelAnswer } from "../src/editor/checker.js";
import { edgeKey, getAllGridEdges, getGridNodes, isAdjacent, normalizeGridType, pointsFromEdgeKey } from "../src/utils/geometry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const levelsDir = path.join(projectRoot, "data/levels/tests");
const configFile = path.join(__dirname, "misleading-levels.config.json");

const config = await readConfig();
const palette = config.palette;
const pairIds = Object.keys(palette);
const requestedIds = new Set((process.env.LEVEL_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean));
const specs = requestedIds.size > 0
  ? config.levels.filter((spec) => requestedIds.has(spec.id))
  : config.levels;

await fs.mkdir(levelsDir, { recursive: true });

for (const spec of specs) {
  const level = buildLevel(spec);
  const validationMessage = validateLevel(level);
  if (validationMessage) throw new Error(`${spec.id}: ${validationMessage}`);

  const outputLevel = stripBuildMetadata(level);
  await fs.writeFile(path.join(levelsDir, `${spec.id}.json`), `${JSON.stringify(outputLevel, null, 2)}\n`, "utf8");
  console.log(`${spec.id}: ${getLevelSizeLabel(level)}, ${level.pairs.length} pairs, ${level.removedEdges.length} removed, ${level.answers.length} answer edges, quality ${level.quality.score}`);
}

async function readConfig() {
  const rawConfig = JSON.parse(await fs.readFile(configFile, "utf8"));
  validateConfig(rawConfig);
  return rawConfig;
}

function validateConfig(rawConfig) {
  if (!rawConfig?.palette || typeof rawConfig.palette !== "object") {
    throw new Error("misleading-levels.config.json must define palette");
  }
  if (!Array.isArray(rawConfig.levels) || rawConfig.levels.length === 0) {
    throw new Error("misleading-levels.config.json must define levels");
  }

  const ids = new Set();
  rawConfig.levels.forEach((spec) => {
    const requiredFields = ["id", "difficulty", "radius", "pairs", "seed", "removals", "gateBias"];
    if (spec.gridType && normalizeGridType(spec.gridType) !== "equilateral-triangle") {
      requiredFields.splice(requiredFields.indexOf("radius"), 1, "width", "height");
    }
    const missingField = requiredFields.find((field) => spec[field] === undefined);
    if (missingField) throw new Error(`${spec.id ?? "unknown level"} missing ${missingField}`);
    if (ids.has(spec.id)) throw new Error(`duplicate level id in config: ${spec.id}`);
    ids.add(spec.id);
    if (spec.pairs > Object.keys(rawConfig.palette).length) {
      throw new Error(`${spec.id} requires ${spec.pairs} pairs but palette only has ${Object.keys(rawConfig.palette).length}`);
    }
  });
}

function stripBuildMetadata(level) {
  const { quality, ...outputLevel } = level;
  return outputLevel;
}

function buildLevel(spec) {
  const maxAttempts = spec.maxAttempts ?? 240;
  let best = null;
  const failures = new Map();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = spec.seed + attempt * 7919;
    const candidate = buildLevelCandidate(spec, seed);
    const validationMessage = validateLevel(candidate.level);
    const qualityMessage = validationMessage || validateLevelQuality(candidate.level, candidate.segments);
    if (!qualityMessage) return candidate.level;

    failures.set(qualityMessage, (failures.get(qualityMessage) ?? 0) + 1);
    if (!best || candidate.level.quality.score > best.level.quality.score) best = candidate;
  }

  const reasons = [...failures.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([message, count]) => `${message} x${count}`)
    .join("; ");
  const bestStats = best?.level.quality.pathStats
    ?.map((item) => `${item.pairId}:len${item.answerLength}/free${item.freeShortest}/blocked${item.blockedShortest}/ratio${roundMetric(item.constraintRatio)}/contact${item.contactEdges}/near${item.neighborSegmentCount}`)
    .join(", ");
  throw new Error(`${spec.id}: unable to build quality level after ${maxAttempts} attempts. Best score ${best?.level.quality.score ?? 0}. ${reasons}. Best stats: ${bestStats}`);
}

function buildLevelCandidate(spec, seed) {
  const rng = createRng(seed);
  const gridType = normalizeGridType(spec.gridType ?? "equilateral-triangle");
  const grid = buildGridSpec({ ...spec, gridType });
  const pathNodes = buildHamiltonianPath(grid, rng, spec.id);
  const segments = splitPath(pathNodes, createSegmentLengths(pathNodes.length, spec.pairs, rng), spec.id);
  const answers = [];
  const answerEdges = new Set();

  const pairs = segments.map((segment, index) => {
    const pairId = pairIds[index];
    for (let nodeIndex = 1; nodeIndex < segment.length; nodeIndex += 1) {
      const edge = edgeKey(segment[nodeIndex - 1], segment[nodeIndex]);
      answers.push({ edge, pairId });
      answerEdges.add(edge);
    }

    const endpoints = rng() < 0.5 ? [segment[0], segment[segment.length - 1]] : [segment[segment.length - 1], segment[0]];
    return {
      id: pairId,
      label: palette[pairId].label,
      color: palette[pairId].color,
      points: endpoints
    };
  });

  const removalResult = chooseRemovedEdges(grid, answerEdges, pairs, segments, spec, rng);
  const level = {
    id: spec.id,
    name: `Level ${spec.id.slice(6)}*`,
    difficulty: spec.difficulty,
    ...grid,
    pairs,
    removedEdges: removalResult.removedEdges,
    answers
  };
  level.quality = summarizeLevelQuality(level, segments);
  level.quality.failure = removalResult.failure;
  return { level, segments };
}

function buildGridSpec(spec) {
  if (spec.gridType === "equilateral-triangle") {
    return {
      gridType: spec.gridType,
      radius: spec.radius
    };
  }

  return {
    gridType: spec.gridType,
    width: spec.width,
    height: spec.height
  };
}

function buildHamiltonianPath(grid, rng, id) {
  if (grid.gridType === "square") {
    return buildSquareSnakePath(grid, rng);
  }

  const nodes = getGridNodes(grid);
  const nodeByKey = new Map(nodes.map((point) => [pointKey(point), point]));
  const neighbors = buildNeighborMap(grid);
  const starts = shuffle([...nodeByKey.keys()], rng);

  for (const start of starts) {
    const pathKeys = searchHamiltonianPath(start, neighbors, nodes.length, rng);
    if (!pathKeys) continue;
    const pathNodes = pathKeys.map((key) => nodeByKey.get(key));
    assertPathCoversGrid(pathNodes, grid);
    return pathNodes;
  }

  throw new Error(`${id}: unable to build Hamiltonian path`);
}

function buildSquareSnakePath(grid, rng) {
  const rows = [];
  for (let y = 0; y <= grid.height; y += 1) {
    const row = [];
    for (let x = 0; x <= grid.width; x += 1) row.push([x, y]);
    rows.push(y % 2 === 0 ? row : row.reverse());
  }
  const path = rows.flat();
  return rng() < 0.5 ? path : path.reverse();
}

function buildNeighborMap(grid, options = {}) {
  const removedEdges = options.ignoreRemovedEdges ? new Set() : new Set(grid.removedEdges ?? []);
  const neighbors = new Map(getGridNodes(grid).map((point) => [pointKey(point), []]));
  getAllGridEdges(grid).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    const [a, b] = points.map(pointKey);
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  });
  return neighbors;
}

function searchHamiltonianPath(start, neighbors, targetLength, rng) {
  const path = [start];
  const visited = new Set(path);
  const deadline = Date.now() + 900;

  function visit(current) {
    if (path.length === targetLength) return true;
    if (Date.now() > deadline) return false;

    const candidates = (neighbors.get(current) ?? [])
      .filter((key) => !visited.has(key))
      .map((key) => ({
        key,
        degree: countOpenNeighbors(key, neighbors, visited),
        noise: rng()
      }))
      .sort((a, b) => a.degree - b.degree || a.noise - b.noise);

    for (const candidate of candidates) {
      visited.add(candidate.key);
      path.push(candidate.key);

      if (canStillReachAllRemaining(candidate.key, neighbors, visited)
        && !hasForcedDeadEnd(neighbors, visited, targetLength - path.length)
        && visit(candidate.key)) {
        return true;
      }

      path.pop();
      visited.delete(candidate.key);
    }

    return false;
  }

  return visit(start) ? path : null;
}

function countOpenNeighbors(key, neighbors, visited) {
  return (neighbors.get(key) ?? []).filter((neighbor) => !visited.has(neighbor)).length;
}

function canStillReachAllRemaining(current, neighbors, visited) {
  const unvisited = [...neighbors.keys()].filter((key) => !visited.has(key));
  if (unvisited.length === 0) return true;

  const queue = [current];
  const reachable = new Set(queue);
  while (queue.length > 0) {
    const key = queue.shift();
    for (const neighbor of neighbors.get(key) ?? []) {
      if (reachable.has(neighbor) || (visited.has(neighbor) && neighbor !== current)) continue;
      reachable.add(neighbor);
      queue.push(neighbor);
    }
  }

  return unvisited.every((key) => reachable.has(key));
}

function hasForcedDeadEnd(neighbors, visited, remainingCount) {
  if (remainingCount <= 1) return false;
  let deadEnds = 0;
  for (const key of neighbors.keys()) {
    if (visited.has(key)) continue;
    if (countOpenNeighbors(key, neighbors, visited) === 0) deadEnds += 1;
    if (deadEnds > 1) return true;
  }
  return false;
}

function createSegmentLengths(totalNodes, segmentCount, rng) {
  const minLength = Math.max(5, Math.min(8, Math.floor(totalNodes / (segmentCount * 1.8))));
  const lengths = Array.from({ length: segmentCount }, () => minLength);
  let remaining = totalNodes - segmentCount * minLength;
  while (remaining > 0) {
    const index = Math.floor(rng() * segmentCount);
    const amount = Math.min(remaining, 1 + Math.floor(rng() * 4));
    lengths[index] += amount;
    remaining -= amount;
  }
  return shuffle(lengths, rng);
}

function splitPath(pathNodes, segmentLengths, id) {
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength !== pathNodes.length) {
    throw new Error(`${id}: segment total mismatch`);
  }

  let offset = 0;
  return segmentLengths.map((length) => {
    const segment = pathNodes.slice(offset, offset + length);
    offset += length;
    return segment;
  });
}

function chooseRemovedEdges(grid, answerEdges, pairs, segments, spec, rng) {
  const endpointKeys = new Set(pairs.flatMap((pair) => pair.points.map(pointKey)));
  const allEdges = getAllGridEdges(grid);
  const removedEdges = new Set(getInternalShortcutEdges(grid, segments, answerEdges));
  const nonAnswerEdges = allEdges.filter((edge) => !answerEdges.has(edge));
  const targetCount = Math.max(removedEdges.size, Math.floor(nonAnswerEdges.length * getRemovalRatio(spec)));
  const minOpenNonAnswerEdges = Math.max(
    pairs.length * 5,
    Math.floor(nonAnswerEdges.length * getDecoyRatio(spec))
  );

  const candidates = nonAnswerEdges
    .map((edge) => {
      const points = pointsFromEdgeKey(edge);
      const keys = points.map(pointKey);
      const endpointTouch = keys.some((key) => endpointKeys.has(key));
      const centerBias = getEdgeCenterBias(points, grid);
      return {
        edge,
        score: rng() + centerBias * 0.02 - (endpointTouch ? spec.gateBias : 0)
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (removedEdges.has(candidate.edge)) continue;
    if (removedEdges.size >= targetCount) break;
    if (nonAnswerEdges.length - removedEdges.size <= minOpenNonAnswerEdges) break;

    removedEdges.add(candidate.edge);
    if (getSingleEdgeNodeKeys(grid, removedEdges).length > 0
      || countOpenComponents({ ...grid, removedEdges: [...removedEdges] }) > 1) {
      removedEdges.delete(candidate.edge);
    }
  }

  const leaves = getSingleEdgeNodeKeys(grid, removedEdges);
  if (leaves.length > 0) {
    return {
      removedEdges: [...removedEdges].sort(),
      failure: `存在只有 1 条可通行边的节点：${leaves.join(", ")}`
    };
  }

  return {
    removedEdges: [...removedEdges].sort(),
    failure: ""
  };
}

function getInternalShortcutEdges(grid, segments, answerEdges) {
  const nodeSegment = new Map();
  segments.forEach((segment, segmentIndex) => {
    segment.forEach((point) => {
      nodeSegment.set(pointKey(point), segmentIndex);
    });
  });

  return getAllGridEdges(grid).filter((edge) => {
    if (answerEdges.has(edge)) return false;
    const points = pointsFromEdgeKey(edge);
    if (!points) return false;
    const [a, b] = points.map(pointKey);
    return nodeSegment.get(a) !== undefined && nodeSegment.get(a) === nodeSegment.get(b);
  });
}

function getRemovalRatio(spec) {
  return Math.min(0.12, Math.max(0, Number(spec.removals ?? 0.06)));
}

function getDecoyRatio(spec) {
  return spec.difficulty >= 4 ? 0.46 : 0.4;
}

function getEdgeCenterBias(points, grid) {
  if (grid.gridType === "equilateral-triangle") {
    return points.reduce((sum, [q, r]) => sum + Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)), 0) / 2;
  }

  const centerX = grid.width / 2;
  const centerY = grid.height / 2;
  return points.reduce((sum, [x, y]) => sum + Math.hypot(x - centerX, y - centerY), 0) / 2;
}

function validateLevel(level) {
  const editorState = {
    gridType: level.gridType,
    radius: level.radius,
    width: level.width,
    height: level.height,
    pairIds: level.pairs.map((pair) => pair.id),
    points: Object.fromEntries(level.pairs.map((pair) => [pair.id, pair.points])),
    removedEdges: level.removedEdges,
    answers: Object.fromEntries(level.answers.map((answer) => [answer.edge, answer.pairId]))
  };
  return validateEditorLevelAnswer(
    editorState,
    (pairId) => editorState.points[pairId],
    (pairId) => level.pairs.find((pair) => pair.id === pairId)?.label ?? pairId
  ) || validateNoSingleEdgeNodes(level);
}

function validateLevelQuality(level, segments) {
  const quality = level.quality;
  if (quality.failure) return quality.failure;

  const minTurns = getMinTurnsByDifficulty(level);
  const nonShortestPath = quality.pathStats.find((item) => !item.isBlockedShortest);
  if (nonShortestPath) return `路径 ${nonShortestPath.pairId} 不是受其他颜色限制后的最短路`;

  const independentPath = quality.pathStats.find((item) => item.contactEdges < getMinPathContactEdges(level)
    || item.neighborSegmentCount < 1);
  if (independentPath) return `路径 ${independentPath.pairId} 受其他路径影响不足`;

  const shortPath = quality.pathStats.find((item) => {
    const dynamicMinTurns = Math.min(minTurns, Math.max(1, Math.floor(item.answerLength / 3)));
    const isShortBlocker = item.answerLength <= 2 && item.contactEdges >= 4;
    return !isShortBlocker
      && item.turns < dynamicMinTurns
      && item.contactEdges < getHighContactEdges(level)
      && item.neighborSegmentCount < Math.min(3, level.pairs.length - 1);
  });
  if (shortPath) return `路径 ${shortPath.pairId} 过于直连且转折不足`;

  if (quality.overlapRatio < getMinOverlapRatio(level)) return "路径包围区域重叠不足，像分区题";
  if (quality.minContactEdges < getMinPathContactEdges(level)) return "存在几乎不影响其他路径的独立线";
  if (quality.averageContactEdges < getMinAverageContactEdges(level)) return "路径之间争夺通道不足";
  if (quality.misleadingEndpoints < Math.min(segments.length, 5)) return "误导端点布局不足";
  if (quality.openComponents > 1) return "开放图被切成多个分区";
  if (quality.nonAnswerOpenEdges < Math.max(segments.length * 4, 10)) return "非答案开放边过少，题面过于一本道";
  if (quality.score < getMinQualityScore(level)) return "综合质量分不足";
  return "";
}

function summarizeLevelQuality(level, segments) {
  const interactionStats = getSegmentInteractionStats(level, segments);
  const pathStats = level.pairs.map((pair, index) => {
    const segment = segments[index];
    const turns = countTurns(segment, level.gridType);
    const blockedKeys = new Set(segments
      .filter((_, segmentIndex) => segmentIndex !== index)
      .flat()
      .map(pointKey));
    const freeShortest = shortestPathLength(level, pair.points[0], pair.points[1]);
    const blockedShortest = shortestPathLength(level, pair.points[0], pair.points[1], {
      blockedKeys
    });
    const answerLength = segment.length - 1;
    const interaction = interactionStats[index];
    return {
      pairId: pair.id,
      answerLength,
      freeShortest,
      blockedShortest,
      turns,
      isBlockedShortest: blockedShortest === answerLength,
      constraintRatio: freeShortest > 0 ? answerLength / freeShortest : answerLength,
      contactEdges: interaction.contactEdges,
      neighborSegmentCount: interaction.neighborSegmentCount
    };
  });
  const overlapRatio = getBoundingBoxOverlapRatio(segments);
  const misleadingEndpoints = countMisleadingEndpoints(level);
  const openComponents = countOpenComponents(level);
  const nonAnswerOpenEdges = countNonAnswerOpenEdges(level);
  const averageTurns = pathStats.reduce((sum, item) => sum + item.turns, 0) / pathStats.length;
  const averageConstraintRatio = pathStats.reduce((sum, item) => sum + item.constraintRatio, 0) / pathStats.length;
  const averageContactEdges = pathStats.reduce((sum, item) => sum + item.contactEdges, 0) / pathStats.length;
  const minNeighborSegmentCount = Math.min(...pathStats.map((item) => item.neighborSegmentCount));
  const minContactEdges = Math.min(...pathStats.map((item) => item.contactEdges));

  return {
    score: Math.round(
      averageTurns * 8
      + Math.min(averageConstraintRatio, 3) * 34
      + overlapRatio * 70
      + misleadingEndpoints * 6
      + averageContactEdges * 7
      + minNeighborSegmentCount * 18
      + nonAnswerOpenEdges * 0.7
      - level.removedEdges.length * 2.5
    ),
    averageTurns: roundMetric(averageTurns),
    averageConstraintRatio: roundMetric(averageConstraintRatio),
    averageContactEdges: roundMetric(averageContactEdges),
    minNeighborSegmentCount,
    minContactEdges,
    overlapRatio: roundMetric(overlapRatio),
    misleadingEndpoints,
    openComponents,
    nonAnswerOpenEdges,
    pathStats
  };
}

function countTurns(pathNodes, gridType) {
  let turns = 0;
  for (let index = 2; index < pathNodes.length; index += 1) {
    const previous = directionKey(pathNodes[index - 2], pathNodes[index - 1], gridType);
    const current = directionKey(pathNodes[index - 1], pathNodes[index], gridType);
    if (previous !== current) turns += 1;
  }
  return turns;
}

function directionKey(from, to, gridType) {
  const dx = Math.sign(to[0] - from[0]);
  const dy = Math.sign(to[1] - from[1]);
  if (normalizeGridType(gridType) === "right-triangle") return `${dx},${dy}`;
  if (normalizeGridType(gridType) === "equilateral-triangle") return `${dx},${dy}`;
  return dx === 0 ? "v" : "h";
}

function shortestPathLength(level, start, end, options = {}) {
  const neighbors = buildNeighborMap(level);
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const blockedKeys = options.blockedKeys ?? new Set();
  const queue = [[startKey, 0]];
  const visited = new Set([startKey]);
  while (queue.length > 0) {
    const [key, distance] = queue.shift();
    if (key === endKey) return distance;
    for (const neighbor of neighbors.get(key) ?? []) {
      if (visited.has(neighbor)) continue;
      if (neighbor !== endKey && blockedKeys.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push([neighbor, distance + 1]);
    }
  }
  return 0;
}

function getSegmentInteractionStats(level, segments) {
  const nodeToSegment = new Map();
  segments.forEach((segment, segmentIndex) => {
    segment.forEach((point) => {
      nodeToSegment.set(pointKey(point), segmentIndex);
    });
  });

  return segments.map((segment, segmentIndex) => {
    const neighborSegments = new Set();
    let contactEdges = 0;

    segment.forEach((point) => {
      for (const neighbor of getOpenNeighborKeys(level, point)) {
        const neighborSegment = nodeToSegment.get(neighbor);
        if (neighborSegment === undefined || neighborSegment === segmentIndex) continue;
        neighborSegments.add(neighborSegment);
        contactEdges += 1;
      }
    });

    return {
      contactEdges,
      neighborSegmentCount: neighborSegments.size
    };
  });
}

function getOpenNeighborKeys(level, point) {
  const removedEdges = new Set(level.removedEdges);
  const key = pointKey(point);
  const neighbors = [];

  getAllGridEdges(level).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    const keys = points.map(pointKey);
    if (keys[0] === key) neighbors.push(keys[1]);
    if (keys[1] === key) neighbors.push(keys[0]);
  });

  return neighbors;
}

function getBoundingBoxOverlapRatio(segments) {
  const boxes = segments.map(getBoundingBox);
  let overlappingPairs = 0;
  let totalPairs = 0;
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      totalPairs += 1;
      if (boxesOverlap(boxes[a], boxes[b])) overlappingPairs += 1;
    }
  }
  return totalPairs > 0 ? overlappingPairs / totalPairs : 0;
}

function getBoundingBox(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function boxesOverlap(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function countMisleadingEndpoints(level) {
  const endpoints = level.pairs.flatMap((pair) => pair.points.map((point) => ({ pairId: pair.id, point })));
  const threshold = level.gridType === "equilateral-triangle" ? 2 : 3;
  let count = 0;
  for (const endpoint of endpoints) {
    const hasOtherClose = endpoints.some((other) => {
      if (other.pairId === endpoint.pairId) return false;
      return shortestPathLength(level, endpoint.point, other.point) <= threshold;
    });
    if (hasOtherClose) count += 1;
  }
  return count;
}

function countOpenComponents(level) {
  const removedEdges = new Set(level.removedEdges);
  const neighbors = new Map(getGridNodes(level).map((point) => [pointKey(point), []]));
  getAllGridEdges(level).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    const [a, b] = points.map(pointKey);
    neighbors.get(a)?.push(b);
    neighbors.get(b)?.push(a);
  });

  const openNodes = [...neighbors.entries()].filter(([, links]) => links.length > 0).map(([key]) => key);
  const visited = new Set();
  let components = 0;
  for (const key of openNodes) {
    if (visited.has(key)) continue;
    components += 1;
    const queue = [key];
    visited.add(key);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of neighbors.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return components;
}

function countNonAnswerOpenEdges(level) {
  const answerEdges = new Set(level.answers.map((answer) => answer.edge));
  const removedEdges = new Set(level.removedEdges);
  return getAllGridEdges(level).filter((edge) => !answerEdges.has(edge) && !removedEdges.has(edge)).length;
}

function getMinTurnsByDifficulty(level) {
  return Math.max(2, Math.min(6, level.difficulty + 1));
}

function getMinOverlapRatio(level) {
  const pairPressure = Math.max(0, level.pairs.length - 8) * 0.035;
  return Math.max(0.3, (level.difficulty >= 4 ? 0.44 : 0.34) - pairPressure);
}

function getMinQualityScore(level) {
  return 105 + level.difficulty * 14;
}

function getMinAverageContactEdges(level) {
  return Math.max(4, Math.min(10, level.pairs.length + level.difficulty));
}

function getMinPathContactEdges(level) {
  return level.difficulty >= 4 ? 4 : 3;
}

function getHighContactEdges(level) {
  return level.difficulty >= 4 ? 8 : 6;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function validateNoSingleEdgeNodes(level) {
  const leaves = getSingleEdgeNodeKeys(level, new Set(level.removedEdges));
  return leaves.length > 0 ? `存在只有 1 条可通行边的节点：${leaves.join(", ")}` : "";
}

function getSingleEdgeNodeKeys(level, removedEdges) {
  const degree = new Map(getGridNodes(level).map((point) => [pointKey(point), 0]));
  getAllGridEdges(level).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    points.forEach((point) => {
      const key = pointKey(point);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    });
  });
  return [...degree.entries()].filter(([, count]) => count === 1).map(([key]) => key);
}

function assertPathCoversGrid(pathNodes, grid) {
  const gridNodes = getGridNodes(grid);
  const seen = new Set(pathNodes.map(pointKey));
  if (seen.size !== gridNodes.length || seen.size !== pathNodes.length) {
    throw new Error(`path does not cover ${getLevelSizeLabel(grid)}`);
  }
  for (let index = 1; index < pathNodes.length; index += 1) {
    if (!isAdjacent(pathNodes[index - 1], pathNodes[index], grid.gridType)) {
      throw new Error(`path has invalid step ${pointKey(pathNodes[index - 1])} -> ${pointKey(pathNodes[index])}`);
    }
  }
}

function pointKey(point) {
  return `${point[0]},${point[1]}`;
}

function getLevelSizeLabel(level) {
  if (level.gridType === "equilateral-triangle") return `equilateral r${level.radius}`;
  return `${level.gridType} ${level.width}x${level.height}`;
}

function shuffle(values, rng) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
