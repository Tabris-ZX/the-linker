#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildEquilateralTriangleGeneratedCandidate } from "./generators/equilateral-triangle.mjs";
import { buildRightTriangleGeneratedCandidate } from "./generators/right-triangle.mjs";
import { buildSquareDifficultyPackJobs, buildSquareGeneratedCandidate, squareDifficultySizes } from "./generators/square.mjs";
import { edgeKey, getAllGridEdges, getGridNodes, isAdjacent, keyOf, pointsFromEdgeKey } from "../../webui/src/utils/geometry.js";

const ROOT_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const LEVELS_ROOT = join(ROOT_DIR, "data/levels");
const ANSWERS_ROOT = join(ROOT_DIR, "data/answers");
const ALPHA_LEVEL_DIR = join(LEVELS_ROOT, "alpha");
const ALPHA_ANSWER_DIR = join(ANSWERS_ROOT, "alpha");
const TEMP_LEVEL_ID_RE = /^[1-5]\d{3}-tmp$/;
const GRID_TYPES = new Set(["square", "right-triangle", "equilateral-triangle"]);
const DEFAULTS = {
  count: 1,
  difficulty: 3,
  gridType: "square",
  width: 7,
  height: 5,
  pairs: 0,
  attempts: 200,
  loopPasses: 240,
  minSegmentLength: 3,
  qualityCandidates: 1,
  seed: Date.now()
};

const options = parseArgs(process.argv.slice(2));
applyDifficultyDefaults(options);
options.storageMethod = detectStorageMethod();
const rng = createRng(options.seed);

if (options.help) {
  printHelp();
  process.exit(0);
}

await mkdir(ALPHA_LEVEL_DIR, { recursive: true });
await mkdir(ALPHA_ANSWER_DIR, { recursive: true });

const generated = [];
const jobs = options.squareDifficultyPack ? buildSquareDifficultyPack(options) : buildSingleConfigJobs(options);
for (let index = 0; index < jobs.length; index += 1) {
  const job = jobs[index];
  const level = generateLevel(job.config, job.index);
  const levelId = options.dryRun
    ? `dry-${index + 1}`
    : options.storageMethod === "sqlite"
      ? ""
      : await nextAlphaLevelId(job.config.difficulty);
  level.id = levelId;
  const generatedName = job.config.name
    ? `${job.config.name}${job.nameSuffix ?? ""}`
    : `Generated ${labelForGridType(level.gridType)} ${levelId || "Level"}`;
  level.name = options.storageMethod === "sqlite" && !options.dryRun && !job.config.name ? "" : generatedName;
  level.difficulty = job.config.difficulty;

  const answerPayload = {
    levelId,
    answers: buildAnswers(level.solutionSegments)
  };
  const storedLevel = stripGeneratorFields(level);

  validateGeneratedLevel(storedLevel, answerPayload.answers);

  if (!options.dryRun) {
    if (options.storageMethod === "sqlite") {
      const savedLevel = saveLevelToSqlite(storedLevel, answerPayload.answers);
      storedLevel.id = savedLevel.id;
      storedLevel.name = savedLevel.name;
      answerPayload.levelId = savedLevel.id;
    } else {
      await writeJson(join(ALPHA_LEVEL_DIR, `${levelId}.json`), storedLevel);
      await writeJson(join(ALPHA_ANSWER_DIR, `${levelId}.json`), answerPayload);
    }
  }
  generated.push({ level: storedLevel, answerPayload, answers: answerPayload.answers.length });
}

if (!options.dryRun) {
  await refreshIndexes();
  await rebuildRunningBackendIndex(options);
}

if (options.json) {
  printGeneratedJson(generated);
} else {
  printGeneratedSummary(generated, options);
}

function buildSingleConfigJobs(config) {
  return Array.from({ length: config.count }, (_, index) => ({
    config,
    index,
    nameSuffix: config.count > 1 ? ` ${index + 1}` : ""
  }));
}

function buildSquareDifficultyPack(config) {
  return buildSquareDifficultyPackJobs(config);
}

function generateLevel(config, index) {
  const level = buildLevelShape(config);
  const targetPairs = normalizePairCount(config, level);
  const shouldRankCandidates = config.gridType === "square";
  const qualityCandidates = shouldRankCandidates ? Math.max(1, config.qualityCandidates ?? DEFAULTS.qualityCandidates) : 1;
  let bestCandidate = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let acceptedCandidates = 0;

  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    const attemptRng = createRng(nextRandomInt(1, 2 ** 31 - 1));
    let candidate;
    try {
      candidate = buildGeneratedCandidate(level, config, index, attempt, attemptRng, targetPairs);
    } catch (error) {
      debugGenerator(`attempt ${attempt + 1}: ${error.message}`);
      continue;
    }
    const endpointOk = isEndpointLayoutReasonable(candidate);
    const solutionOk = isSolutionLayoutReasonable(candidate);
    if (!endpointOk || !solutionOk) {
      debugGenerator(`attempt ${attempt + 1}: rejected endpoint=${endpointOk} solution=${solutionOk} metrics=${JSON.stringify(solutionLayoutMetrics(candidate.solutionSegments ?? []))}`);
    }
    if (
      candidate.pairs.length === targetPairs &&
      endpointOk &&
      solutionOk
    ) {
      if (!isAcceptedGeneratedCandidate(candidate, config)) {
        debugGenerator(`attempt ${attempt + 1}: rejected acceptance=false`);
        continue;
      }
      if (shouldRankCandidates) {
        acceptedCandidates += 1;
        const score = squareNoRemoveQualityScore(candidate);
        debugGenerator(`attempt ${attempt + 1}: accepted score=${score.toFixed(3)}`);
        if (score > bestScore) {
          bestCandidate = candidate;
          bestScore = score;
        }
        if (acceptedCandidates >= qualityCandidates) return bestCandidate;
        continue;
      }
      return candidate;
    }
  }

  if (bestCandidate) return bestCandidate;
  throw new Error(`Failed to generate ${config.gridType} level after ${config.attempts} attempts`);
}

function debugGenerator(message) {
  if (process.env.LINKER_GENERATOR_DEBUG) console.error(`[generator] ${message}`);
}

function buildGeneratedCandidate(level, config, index, attempt, attemptRng, targetPairs) {
  const context = {
    rootDir: ROOT_DIR,
    buildSolutionPaths,
    candidateFromSegments
  };
  if (config.gridType === "square") {
    return buildSquareGeneratedCandidate({ level, config, index, attempt, rng: attemptRng, targetPairs, context });
  }
  if (config.gridType === "right-triangle") {
    return buildRightTriangleGeneratedCandidate({ level, config, index, attempt, rng: attemptRng, targetPairs, context });
  }
  if (config.gridType === "equilateral-triangle") {
    return buildEquilateralTriangleGeneratedCandidate({ level, config, index, attempt, rng: attemptRng, targetPairs, context });
  }
  throw new Error(`Unsupported grid type: ${config.gridType}`);
}

function candidateFromSegments(level, segments) {
  const filteredSegments = segments.filter((path) => path.length >= 2);
  return {
    ...level,
    pairs: filteredSegments.map((segment, segmentIndex) => ({
      id: String(segmentIndex + 1),
      points: [segment[0], segment[segment.length - 1]]
    })),
    removedEdges: [],
    solutionSegments: filteredSegments
  };
}

function isAcceptedGeneratedCandidate(candidate) {
  if (candidate.gridType === "square") return isGoodSquareCandidate(candidate);
  return true;
}

function isGoodSquareCandidate(level) {
  if (level.gridType !== "square") return true;
  const segmentsByPair = new Map((level.solutionSegments ?? []).map((segment, index) => [String(index + 1), segment]));
  for (const pair of level.pairs ?? []) {
    const segment = segmentsByPair.get(String(pair.id));
    if (!segment || segment.length < 2) return false;
    const authoredLength = segment.length - 1;
    const allowedNodes = new Set(segment.map(pointKey));
    const shortestLength = shortestSquarePairDistance(level, pair.points[0], pair.points[1], allowedNodes, authoredLength - 1);
    if (shortestLength >= 0 && shortestLength < authoredLength) return false;
  }
  return true;
}

function shortestSquarePairDistance(level, start, end, allowedNodes, stopBelowLength = Number.POSITIVE_INFINITY) {
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const graph = buildPlayableGraph(level);
  const queue = [[startKey, 0]];
  const seen = new Set([startKey]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [current, distance] = queue[cursor];
    if (current === endKey) return distance;
    if (distance >= stopBelowLength) continue;
    for (const next of graph.get(current) ?? []) {
      if (!allowedNodes.has(next)) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([next, distance + 1]);
    }
  }
  return -1;
}

function squareNoRemoveQualityScore(level) {
  const segments = level.solutionSegments ?? [];
  const metrics = solutionLayoutMetrics(segments);
  const lengths = segments.map((segment) => Math.max(0, segment.length - 1));
  const meanLength = lengths.reduce((total, length) => total + length, 0) / Math.max(1, lengths.length);
  const variance = lengths.reduce((total, length) => total + (length - meanLength) ** 2, 0) / Math.max(1, lengths.length);
  const balance = meanLength ? Math.max(0, 1 - Math.sqrt(variance) / meanLength) : 0;
  const overlap = segmentBoxOverlapRatio(segments);
  const endpointSpread = averageEndpointDistance(level) / Math.max(1, Number(level.width ?? 1) + Number(level.height ?? 1));
  const borderRatio = endpointBorderRatio(level);
  const edgeUsageRatio = borderUsageRatio(level);
  const shortPathPenalty = lengths.filter((length) => length <= 3).length / Math.max(1, lengths.length);

  return metrics.directionChangeRate * 3.2
    - metrics.axisContinuousSegmentRatio * 2.4
    + overlap * 2.2
    + balance * 1.2
    + endpointSpread * 1.0
    - borderRatio * 0.35
    - edgeUsageRatio * 1.1
    - shortPathPenalty * 1.5;
}

function segmentBoxOverlapRatio(segments) {
  const boxes = segments.map((segment) => {
    const xs = segment.map(([x]) => x);
    const ys = segment.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  });
  let overlaps = 0;
  let possible = 0;
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      possible += 1;
      if (boxes[left].minX <= boxes[right].maxX &&
        boxes[right].minX <= boxes[left].maxX &&
        boxes[left].minY <= boxes[right].maxY &&
        boxes[right].minY <= boxes[left].maxY) {
        overlaps += 1;
      }
    }
  }
  return possible ? overlaps / possible : 0;
}

function averageEndpointDistance(level) {
  const distances = (level.pairs ?? []).map((pair) => {
    const [a, b] = pair.points ?? [];
    if (!a || !b) return 0;
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  });
  return distances.reduce((total, value) => total + value, 0) / Math.max(1, distances.length);
}

function endpointBorderRatio(level) {
  const width = Number(level.width ?? 0);
  const height = Number(level.height ?? 0);
  const endpoints = (level.pairs ?? []).flatMap((pair) => pair.points ?? []);
  const borderCount = endpoints.filter(([x, y]) => x === 0 || y === 0 || x === width || y === height).length;
  return borderCount / Math.max(1, endpoints.length);
}

function borderUsageRatio(level) {
  const width = Number(level.width ?? 0);
  const height = Number(level.height ?? 0);
  const nodes = (level.solutionSegments ?? []).flat();
  const borderCount = nodes.filter(([x, y]) => x === 0 || y === 0 || x === width || y === height).length;
  return borderCount / Math.max(1, nodes.length);
}

function buildSolutionPaths(level, config) {
  let path = buildHamiltonianPath(level, config.variant, config.rng);
  path = perturbHamiltonianPath(level, path, config.loopPasses, config.rng);
  return splitPath(path, config.targetPairs, config.minSegmentLength, config.rng);
}

function buildHamiltonianPath(level, variant, random) {
  if (level.gridType === "equilateral-triangle") {
    return buildBacktrackingHamiltonianPath(level, variant, random);
  }
  if (level.gridType === "right-triangle") {
    try {
      return buildBacktrackingHamiltonianPath(level, variant, random);
    } catch {
      return buildPerturbedSerpentineHamiltonianPath(level, variant, random);
    }
  }
  return buildRectangularSerpentinePath(level, variant);
}

function buildRectangularSerpentinePath(level, variant) {
  const rows = [];
  for (let y = 0; y <= level.height; y += 1) {
    const row = [];
    for (let x = 0; x <= level.width; x += 1) row.push([x, y]);
    rows.push((y + variant) % 2 === 0 ? row : row.reverse());
  }
  let path = rows.flat();
  if (variant % 4 === 1) path = path.slice().reverse();
  if (variant % 4 === 2) path = path.map(([x, y]) => [level.width - x, level.height - y]);
  if (variant % 4 === 3) path = path.map(([x, y]) => [level.width - x, y]).reverse();
  assertPath(level, path);
  return path;
}

function buildPerturbedSerpentineHamiltonianPath(level, variant, random) {
  let bestPath = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const nodeCount = getGridNodes(level).length;
  const variants = [variant, variant + 1, variant + 2, variant + 3];
  for (const seedVariant of variants) {
    let current = buildRectangularSerpentinePath(level, seedVariant);
    const passes = Math.max(700, nodeCount * 34);
    for (let pass = 0; pass < passes; pass += 1) {
      const next = pass % 2 === 0
        ? tryBackbiteMove(level, current, random)
        : pass % 5 === 0
        ? tryRepeatedCellFlip(level, current, random)
        : tryRepeatedTwoOptFlip(level, current, random);
      if (!next) continue;
      current = next;
      const score = solutionPathScore(current);
      if (score < bestScore) {
        bestPath = current;
        bestScore = score;
      }
    }
  }
  if (!bestPath) throw new Error(`Unable to perturb ${level.gridType} Hamiltonian path`);
  assertPath(level, bestPath);
  return bestPath;
}

function tryBackbiteMove(level, path, random) {
  if (path.length < 4) return null;
  const useStart = random() < 0.5;
  const endpoint = useStart ? path[0] : path[path.length - 1];
  const excluded = new Set([
    pointKey(endpoint),
    pointKey(useStart ? path[1] : path[path.length - 2])
  ]);
  const candidates = shuffle(neighbors(level, endpoint), random)
    .map((point) => path.findIndex((item) => samePoint(item, point)))
    .filter((index) => index >= 0 && !excluded.has(pointKey(path[index])));
  for (const index of candidates) {
    const next = useStart
      ? path.slice(0, index).reverse().concat([path[index]], path.slice(index + 1))
      : path.slice(0, index).concat([path[index]], path.slice(index + 1).reverse());
    if (isPathUsable(level, next)) return next;
  }
  return null;
}

function solutionPathScore(path) {
  const metrics = solutionLayoutMetrics([path]);
  return metrics.axisContinuousSegmentRatio * 9
    + metrics.axisScanRatio * 3
    - metrics.directionChangeRate * 4
    + longestDirectionRun(path) * 0.12;
}

function longestDirectionRun(path) {
  let longest = 0;
  let current = 0;
  let previousDirection = "";
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const direction = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])].join(",");
    current = direction === previousDirection ? current + 1 : 1;
    longest = Math.max(longest, current);
    previousDirection = direction;
  }
  return longest;
}

function buildBacktrackingHamiltonianPath(level, variant, random = Math.random) {
  const nodes = getGridNodes(level);
  const nodeKeys = new Set(nodes.map(pointKey));
  const starts = shuffle(orderHamiltonianStarts(nodes, variant), random).slice(0, Math.min(nodes.length, 18));
  const maxSearchMs = level.gridType === "equilateral-triangle" ? 2600 : 1200;
  const perNodeMs = level.gridType === "equilateral-triangle" ? 28 : 12;
  const deadline = Date.now() + Math.max(450, Math.min(maxSearchMs, nodes.length * perNodeMs));
  for (const start of starts) {
    const path = [start];
    const visited = new Set([pointKey(start)]);
    if (searchHamiltonian(level, path, visited, nodeKeys, variant, random, deadline)) {
      assertPath(level, path);
      return path;
    }
  }
  throw new Error(`Unable to build ${level.gridType} Hamiltonian path`);
}

function searchHamiltonian(level, path, visited, nodeKeys, variant, random, deadline) {
  if (Date.now() > deadline) return false;
  if (path.length === nodeKeys.size) return true;
  const candidates = shuffle(neighbors(level, path[path.length - 1]), random)
    .filter((point) => nodeKeys.has(pointKey(point)) && !visited.has(pointKey(point)))
    .sort((a, b) => candidateScore(level, path, a, visited, nodeKeys, variant, random) - candidateScore(level, path, b, visited, nodeKeys, variant, random));

  for (const next of candidates) {
    visited.add(pointKey(next));
    path.push(next);
    if (keepsUnvisitedGraphFeasible(level, visited, nodeKeys) && searchHamiltonian(level, path, visited, nodeKeys, variant, random, deadline)) return true;
    path.pop();
    visited.delete(pointKey(next));
  }
  return false;
}

function candidateScore(level, path, point, visited, nodeKeys, variant, random) {
  const onward = neighbors(level, point).filter((neighbor) => {
    const key = pointKey(neighbor);
    return nodeKeys.has(key) && !visited.has(key);
  }).length;
  const [x, y] = point;
  const tie = variant % 3 === 0 ? Math.abs(x) + Math.abs(y) : variant % 3 === 1 ? x - y : x + y;
  const previous = path[path.length - 1];
  const beforePrevious = path[path.length - 2];
  const direction = previous ? [Math.sign(point[0] - previous[0]), Math.sign(point[1] - previous[1])] : [0, 0];
  const previousDirection = previous && beforePrevious
    ? [Math.sign(previous[0] - beforePrevious[0]), Math.sign(previous[1] - beforePrevious[1])]
    : [0, 0];
  const continuesDirection = direction[0] === previousDirection[0] && direction[1] === previousDirection[1];
  let score = onward * 1.8 + tie * 0.002 + random() * 0.45;

  if (continuesDirection) score += 1.4 + sameDirectionRunLength(path, direction) * 0.35;
  if (level.gridType === "right-triangle") {
    if (direction[0] !== 0 && direction[1] !== 0) score -= 3.6;
    if (direction[0] === 0 || direction[1] === 0) score += 3.2;
    if (continuesDirection && (direction[0] === 0 || direction[1] === 0)) score += 5.2;
    if (continuesDirection && direction[0] !== 0 && direction[1] !== 0) score += 1.4;
  } else if (level.gridType === "equilateral-triangle") {
    if (continuesDirection) score += 1.5;
    if (hexShell(point) === hexShell(previous)) score += 0.9;
    if (crossesHexSector(point, previous)) score -= 0.6;
  }
  return score;
}

function crossesHexSector(point, previous) {
  if (!previous) return false;
  return Math.sign(point[0]) !== Math.sign(previous[0])
    || Math.sign(point[1]) !== Math.sign(previous[1])
    || Math.sign(point[0] + point[1]) !== Math.sign(previous[0] + previous[1]);
}

function sameDirectionRunLength(path, direction) {
  let run = 0;
  for (let index = path.length - 1; index > 0; index -= 1) {
    const current = path[index];
    const previous = path[index - 1];
    if (Math.sign(current[0] - previous[0]) !== direction[0] || Math.sign(current[1] - previous[1]) !== direction[1]) break;
    run += 1;
  }
  return run;
}

function hexShell(point) {
  return Math.max(Math.abs(point?.[0] ?? 0), Math.abs(point?.[1] ?? 0), Math.abs((point?.[0] ?? 0) + (point?.[1] ?? 0)));
}

function keepsUnvisitedGraphFeasible(level, visited, nodeKeys) {
  let isolated = 0;
  for (const key of nodeKeys) {
    if (visited.has(key)) continue;
    const point = pointFromString(key);
    const freeDegree = neighbors(level, point).filter((neighbor) => {
      const neighborKey = pointKey(neighbor);
      return nodeKeys.has(neighborKey) && !visited.has(neighborKey);
    }).length;
    if (freeDegree === 0) isolated += 1;
    if (isolated > 1) return false;
  }
  return true;
}

function perturbHamiltonianPath(level, path, passes, random) {
  let current = path.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = random() < 0.65
      ? tryRepeatedTwoOptFlip(level, current, random)
      : tryRepeatedCellFlip(level, current, random);
    if (next) current = next;
  }
  assertPath(level, current);
  return current;
}

function tryRepeatedTwoOptFlip(level, path, random) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const next = tryTwoOptFlip(level, path, random);
    if (next) return next;
  }
  return null;
}

function tryRepeatedCellFlip(level, path, random) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const next = tryFlipOneCell(level, path, random);
    if (next) return next;
  }
  return null;
}

function tryTwoOptFlip(level, path, random) {
  if (path.length < 8) return null;
  const edges = new Set(getAllGridEdges(level));
  const first = randomInt(random, 0, path.length - 4);
  const second = randomInt(random, first + 2, path.length - 2);
  const a = path[first];
  const b = path[first + 1];
  const c = path[second];
  const d = path[second + 1];
  if (!edges.has(edgeKey(a, c)) || !edges.has(edgeKey(b, d))) return null;
  const next = [
    ...path.slice(0, first + 1),
    ...path.slice(first + 1, second + 1).reverse(),
    ...path.slice(second + 1)
  ];
  if (!isPathUsable(level, next)) return null;
  return next;
}

function tryFlipOneCell(level, path, random) {
  if (level.gridType !== "square" && level.gridType !== "right-triangle") return null;
  const width = Number(level.width);
  const height = Number(level.height);
  if (width < 1 || height < 1) return null;
  const x = randomInt(random, 0, width - 1);
  const y = randomInt(random, 0, height - 1);
  const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
  const positions = corners.map((corner) => path.findIndex((point) => samePoint(point, corner)));
  if (positions.some((position) => position < 0)) return null;

  const sorted = positions.slice().sort((a, b) => a - b);
  const firstRun = sorted[1] === sorted[0] + 1;
  const secondRun = sorted[3] === sorted[2] + 1;
  if (!firstRun || !secondRun) return null;
  if (sorted[2] === sorted[1] + 1) return null;

  const a = path[sorted[0]];
  const b = path[sorted[1]];
  const c = path[sorted[2]];
  const d = path[sorted[3]];
  if (!isAdjacent(a, c, level.gridType) || !isAdjacent(b, d, level.gridType)) return null;

  const next = path.slice();
  next.splice(sorted[1] + 1, sorted[2] - sorted[1] - 1, ...path.slice(sorted[1] + 1, sorted[2]).reverse());
  if (!isPathUsable(level, next)) return null;
  return next;
}

function splitPath(path, targetPairs, minSegmentLength, random) {
  const pairCount = Math.max(2, Math.min(targetPairs, Math.floor(path.length / minSegmentLength)));
  const cutSet = new Set();
  const maxCut = path.length - minSegmentLength;
  let guard = 0;
  while (cutSet.size < pairCount - 1 && guard < 2000) {
    guard += 1;
    const cut = randomInt(random, minSegmentLength, maxCut);
    const sortedCuts = [...cutSet, cut].sort((a, b) => a - b);
    const lengths = [sortedCuts[0], ...sortedCuts.slice(1).map((value, index) => value - sortedCuts[index]), path.length - sortedCuts.at(-1)];
    if (lengths.every((length) => length >= minSegmentLength)) cutSet.add(cut);
  }

  const cuts = [...cutSet].sort((a, b) => a - b);
  const boundaries = [0, ...cuts, path.length];
  return boundaries.slice(0, -1).map((start, index) => path.slice(start, boundaries[index + 1]));
}

function buildAnswers(segments) {
  return segments.flatMap((segment, index) => {
    const pairId = String(index + 1);
    const answers = [];
    for (let pointIndex = 1; pointIndex < segment.length; pointIndex += 1) {
      answers.push({
        edge: edgeKey(segment[pointIndex - 1], segment[pointIndex]),
        pairId
      });
    }
    return answers;
  });
}

function validateGeneratedLevel(level, answers) {
  if ((level.removedEdges ?? []).length) {
    throw new Error("Generated levels must keep the full grid graph; removedEdges is not allowed");
  }
  const paths = pathsFromAnswers(level, answers);
  const endpoints = new Map(level.pairs.flatMap((pair) => pair.points.map((point) => [pointKey(point), pair.id])));
  const filledNodes = new Set();
  for (const pair of level.pairs) {
    const path = paths.get(pair.id);
    if (!path || path.length < 2) throw new Error(`Pair ${pair.id} has no path`);
    if (!samePoint(path[0], pair.points[0]) || !samePoint(path[path.length - 1], pair.points[1])) {
      throw new Error(`Pair ${pair.id} path endpoints do not match pair points`);
    }
    assertPath(level, path);
    for (let index = 0; index < path.length; index += 1) {
      const key = pointKey(path[index]);
      if (filledNodes.has(key)) throw new Error(`Node ${key} is used by multiple paths`);
      filledNodes.add(key);
      const isEndpoint = endpoints.get(key) === pair.id;
      const degree = Number(Boolean(path[index - 1])) + Number(Boolean(path[index + 1]));
      if (isEndpoint && degree > 1) throw new Error(`Endpoint ${key} has degree ${degree}`);
    }
  }
  const requiredNodes = getRequiredNodeKeys(level);
  if (filledNodes.size !== requiredNodes.size) throw new Error(`Generated answer fills ${filledNodes.size}/${requiredNodes.size} nodes`);
  if (level.gridType === "square" && !isGoodSquareCandidate({ ...level, solutionSegments: [...paths.values()] })) {
    throw new Error("Generated square puzzle has a shorter single-pair route");
  }
}

function buildPlayableGraph(level) {
  const removedEdges = new Set(level.removedEdges ?? []);
  const graph = new Map();
  for (const edge of getAllGridEdges(level)) {
    if (removedEdges.has(edge)) continue;
    const points = pointsFromEdgeKey(edge);
    if (!points) continue;
    const [a, b] = points.map(pointKey);
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b);
    graph.get(b).add(a);
  }
  return graph;
}

function getRequiredNodeKeys(level) {
  const removedEdges = new Set(level.removedEdges ?? []);
  const nodes = new Set();
  for (const edge of getAllGridEdges(level)) {
    if (removedEdges.has(edge)) continue;
    const points = pointsFromEdgeKey(edge);
    if (!points) continue;
    points.forEach((point) => nodes.add(pointKey(point)));
  }
  return nodes;
}

function pathsFromAnswers(level, answers) {
  const graphByPair = new Map();
  for (const answer of answers) {
    const points = pointsFromEdgeKey(answer.edge);
    if (!points) throw new Error(`Invalid answer edge ${answer.edge}`);
    if (!graphByPair.has(answer.pairId)) graphByPair.set(answer.pairId, new Map());
    const graph = graphByPair.get(answer.pairId);
    for (const [from, to] of [[points[0], points[1]], [points[1], points[0]]]) {
      const key = pointKey(from);
      if (!graph.has(key)) graph.set(key, []);
      graph.get(key).push(to);
    }
  }

  const paths = new Map();
  for (const pair of level.pairs) {
    const graph = graphByPair.get(pair.id) ?? new Map();
    const end = pointKey(pair.points[1]);
    const path = [pair.points[0]];
    const seen = new Set([pointKey(pair.points[0])]);
    while (pointKey(path[path.length - 1]) !== end) {
      const current = pointKey(path[path.length - 1]);
      const next = (graph.get(current) ?? []).find((point) => !seen.has(pointKey(point)) || pointKey(point) === end);
      if (!next) break;
      path.push(next);
      seen.add(pointKey(next));
      if (path.length > getGridNodes(level).length) break;
    }
    paths.set(pair.id, path);
  }
  return paths;
}

async function nextAlphaLevelId(difficulty) {
  const used = new Set();
  for (const category of ["alpha", "removed"]) {
    const dir = join(LEVELS_ROOT, category);
    if (!existsSync(dir)) continue;
    const names = await readDirectoryNames(dir);
    for (const name of names) {
      const levelId = name.replace(/\.json$/i, "");
      if (!TEMP_LEVEL_ID_RE.test(levelId) || Number(levelId[0]) !== difficulty) continue;
      used.add(Number(levelId.slice(1, 4)));
    }
  }
  for (let number = 1; number < 1000; number += 1) {
    if (!used.has(number)) return `${difficulty}${String(number).padStart(3, "0")}-tmp`;
  }
  throw new Error(`No alpha ids left for difficulty ${difficulty}`);
}

async function readDirectoryNames(dir) {
  const { readdir } = await import("node:fs/promises");
  return readdir(dir);
}

async function refreshIndexes() {
  const result = runPython("from server.games.linker.services.levels import refresh_all_level_indexes; refresh_all_level_indexes()")
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`Failed to refresh level indexes: ${message}`);
  }
}

function runPython(source) {
  const options = {
    cwd: ROOT_DIR,
    encoding: "utf8"
  };
  const uv = spawnSync("uv", ["run", "python", "-c", source], options);
  if (!uv.error || uv.error.code !== "ENOENT") return uv;
  const first = spawnSync("python", ["-c", source], options);
  if (!first.error || first.error.code !== "ENOENT") return first;
  return spawnSync("python3", ["-c", source], options);
}

function detectStorageMethod() {
  const result = runPython("from server.config import get_settings; print(get_settings().storage_method)");
  if (result.status !== 0) return "file";
  return result.stdout.trim() === "sqlite" ? "sqlite" : "file";
}

function saveLevelToSqlite(level, answers) {
  const source = [
    "import json, sys",
    "from server.games.linker.services.levels import save_level",
    "payload = json.load(sys.stdin)",
    "level = dict(payload['level'])",
    "level['answers'] = payload['answers']",
    "saved = save_level(level)",
    "print(json.dumps(saved, ensure_ascii=False))"
  ].join("\n");
  const result = runPythonWithInput(source, JSON.stringify({ level, answers }));
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`Failed to save generated level to sqlite: ${message}`);
  }
  return JSON.parse(result.stdout);
}

function runPythonWithInput(source, input) {
  const options = {
    cwd: ROOT_DIR,
    encoding: "utf8",
    input
  };
  const uv = spawnSync("uv", ["run", "python", "-c", source], options);
  if (!uv.error || uv.error.code !== "ENOENT") return uv;
  const first = spawnSync("python", ["-c", source], options);
  if (!first.error || first.error.code !== "ENOENT") return first;
  return spawnSync("python3", ["-c", source], options);
}

async function rebuildRunningBackendIndex(config) {
  if (!config.rebuildUrl) return;
  try {
    const response = await fetch(config.rebuildUrl, {
      method: "POST",
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : {}
    });
    if (!response.ok) {
      console.warn(`Backend index rebuild failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn(`Backend index rebuild skipped: ${error.message}`);
  }
}

function stripGeneratorFields(level) {
  const payload = { ...level };
  delete payload.solutionSegments;
  return payload;
}

function buildLevelShape(config) {
  return {
    gridType: config.gridType,
    width: config.width,
    height: config.height
  };
}

function normalizePairCount(config, level) {
  const nodeCount = getGridNodes(level).length;
  const fallback = Math.max(3, Math.round(Math.sqrt(nodeCount)));
  return Math.max(2, Math.min(config.pairs || fallback, Math.floor(nodeCount / Math.max(2, config.minSegmentLength))));
}

function isEndpointLayoutReasonable(level) {
  const endpointKeys = new Set();
  for (const pair of level.pairs) {
    const [a, b] = pair.points;
    if (samePoint(a, b)) return false;
    if (isAdjacent(a, b, level.gridType)) return false;
    for (const point of pair.points) {
      const key = pointKey(point);
      if (endpointKeys.has(key)) return false;
      endpointKeys.add(key);
    }
  }
  return true;
}

function isSolutionLayoutReasonable(level) {
  if (level.gridType !== "right-triangle" && level.gridType !== "equilateral-triangle") return true;
  const metrics = solutionLayoutMetrics(level.solutionSegments ?? []);
  if (metrics.comparable <= 0) return true;
  if (level.gridType === "right-triangle") {
    return metrics.directionChangeRate >= 0.24 &&
      metrics.axisContinuousSegmentRatio <= 0.48;
  }
  return metrics.directionChangeRate >= 0.35 &&
    metrics.axisContinuousSegmentRatio <= 0.36;
}

function solutionLayoutMetrics(segments) {
  let answerEdges = 0;
  let comparable = 0;
  let turns = 0;
  let axisEdges = 0;
  let longAxisEdges = 0;

  for (const segment of segments) {
    let previousDirection = null;
    let axisRunDirection = null;
    let axisRun = 0;
    for (let index = 1; index < segment.length; index += 1) {
      answerEdges += 1;
      const a = segment[index - 1];
      const b = segment[index];
      const direction = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])].join(",");
      const isAxis = a[0] === b[0] || a[1] === b[1] || a[0] + a[1] === b[0] + b[1];
      if (isAxis) axisEdges += 1;

      if (previousDirection !== null) {
        comparable += 1;
        if (direction !== previousDirection) turns += 1;
      }

      if (isAxis && direction === axisRunDirection) {
        axisRun += 1;
      } else {
        if (axisRun >= 4) longAxisEdges += axisRun;
        axisRun = isAxis ? 1 : 0;
        axisRunDirection = direction;
      }
      previousDirection = direction;
    }
    if (axisRun >= 4) longAxisEdges += axisRun;
  }

  return {
    answerEdges,
    comparable,
    directionChangeRate: comparable ? turns / comparable : 0,
    axisScanRatio: answerEdges ? axisEdges / answerEdges : 0,
    axisContinuousSegmentRatio: answerEdges ? longAxisEdges / answerEdges : 0
  };
}

function assertPath(level, path) {
  if (!isPathUsable(level, path)) throw new Error("Invalid path generated");
}

function isPathUsable(level, path) {
  const nodes = new Set(getGridNodes(level).map(pointKey));
  const edges = new Set(getAllGridEdges(level));
  const seen = new Set();
  for (let index = 0; index < path.length; index += 1) {
    const key = pointKey(path[index]);
    if (!nodes.has(key) || seen.has(key)) return false;
    seen.add(key);
    if (index > 0 && !edges.has(edgeKey(path[index - 1], path[index]))) return false;
  }
  return true;
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

function orderHamiltonianStarts(nodes, variant) {
  return nodes.slice().sort((a, b) => {
    if (variant % 3 === 1) return (b[0] - a[0]) || (a[1] - b[1]);
    if (variant % 3 === 2) return (a[1] - b[1]) || (b[0] - a[0]);
    return (a[0] - b[0]) || (a[1] - b[1]);
  });
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function pointKey(point) {
  return keyOf(point[0], point[1]);
}

function pointFromString(key) {
  return key.split(",").map(Number);
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function shuffle(items, random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(random, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function nextRandomInt(min, max) {
  return randomInt(rng, min, max);
}

function createRng(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(args) {
  const parsed = { ...DEFAULTS };
  const provided = new Set();
  parsed.token = process.env.LINKER_DEV_TOKEN ?? "njuit1918";
  parsed.rebuildUrl = process.env.LINKER_REBUILD_URL ?? "http://127.0.0.1:8081/api/linker/levels/index/rebuild";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--no-rebuild") parsed.rebuildUrl = "";
    else if (arg === "--square-difficulty-pack") parsed.squareDifficultyPack = true;
    else if (arg === "--type") parsed.gridType = String(next());
    else if (arg === "--count") parsed.count = toInt(next(), parsed.count);
    else if (arg === "--difficulty") parsed.difficulty = toInt(next(), parsed.difficulty);
    else if (arg === "--width") {
      parsed.width = toInt(next(), parsed.width);
      provided.add("width");
    }
    else if (arg === "--height") {
      parsed.height = toInt(next(), parsed.height);
      provided.add("height");
    }
    else if (arg === "--pairs") {
      parsed.pairs = toInt(next(), parsed.pairs);
      provided.add("pairs");
    }
    else if (arg === "--attempts") parsed.attempts = toInt(next(), parsed.attempts);
    else if (arg === "--loop-passes") parsed.loopPasses = toInt(next(), parsed.loopPasses);
    else if (arg === "--min-segment-length") parsed.minSegmentLength = toInt(next(), parsed.minSegmentLength);
    else if (arg === "--extra-edges") throw new Error("--extra-edges has been removed; generated levels keep the full grid graph");
    else if (arg === "--no-remove-edges") throw new Error("--no-remove-edges has been removed; full-grid generation is now the only mode");
    else if (arg === "--quality-candidates") parsed.qualityCandidates = toInt(next(), parsed.qualityCandidates);
    else if (arg === "--seed") parsed.seed = toInt(next(), parsed.seed);
    else if (arg === "--name") parsed.name = String(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  parsed.gridType = normalizeGridType(parsed.gridType);
  parsed.provided = provided;
  if (!GRID_TYPES.has(parsed.gridType)) throw new Error(`Unsupported grid type: ${parsed.gridType}`);
  parsed.count = clamp(parsed.count, 1, 100);
  parsed.difficulty = clamp(parsed.difficulty, 1, 5);
  parsed.width = clamp(parsed.width, 1, 19);
  parsed.height = clamp(parsed.height, 1, 17);
  if (parsed.gridType === "equilateral-triangle") {
    parsed.height = clamp(parsed.height, 1, 8);
    parsed.width = clamp(parsed.width, parsed.height + 1, 12);
  }
  parsed.minSegmentLength = clamp(parsed.minSegmentLength, 2, 20);
  parsed.qualityCandidates = clamp(parsed.qualityCandidates, 1, 20);
  return parsed;
}

function applyDifficultyDefaults(config) {
  if (config.gridType !== "square" || config.squareDifficultyPack) return;
  const provided = config.provided ?? new Set();
  const [width, height, pairs] = squareDifficultySizes(config.difficulty)[1];
  if (!provided.has("width")) config.width = width;
  if (!provided.has("height")) config.height = height;
  if (!provided.has("pairs")) config.pairs = pairs;
}

function normalizeGridType(gridType) {
  return String(gridType ?? DEFAULTS.gridType);
}

function toInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function labelForGridType(gridType) {
  return {
    square: "Square",
    "right-triangle": "Right Triangle",
    "equilateral-triangle": "Equilateral"
  }[gridType] ?? gridType;
}

async function writeJson(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function printGeneratedSummary(generated, config) {
  const action = config.dryRun ? "Prepared" : "Generated";
  const label = config.squareDifficultyPack ? "square difficulty-pack" : config.gridType;
  console.log(`${action} ${generated.length} ${label} alpha level(s), seed=${config.seed}`);
  for (const item of generated) {
    const size = item.level.gridType === "equilateral-triangle"
      ? `${item.level.width}x${item.level.height}`
      : `${item.level.width}x${item.level.height}`;
    console.log(`- ${item.level.id}: ${item.level.name}, d=${item.level.difficulty}, size=${size}, pairs=${item.level.pairs.length}, answers=${item.answers}`);
  }
}

function printGeneratedJson(generated) {
  console.log(JSON.stringify({
    levels: generated.map((item) => ({
      map: item.level,
      answers: item.answerPayload
    }))
  }, null, 2));
}

function printHelp() {
  console.log(`Usage:
  node server/scripts/generate-alpha-levels.mjs [options]

Options:
  --type square|right-triangle|equilateral-triangle
  --count <n>                 Number of alpha levels to generate
  --difficulty <1-5>          Difficulty bucket/id prefix
  --square-difficulty-pack    Generate 3 square levels for each difficulty 1-5
  --width <n> --height <n>    Map size. Equilateral requires width > height
  --pairs <n>                 Pair count, default sqrt(node count)
  --quality-candidates <n>    For square generation, return the best of n good candidates
  --seed <n>                  Reproducible seed
  --dry-run                   Validate without writing files
  --json                      Print generated map/answers JSON instead of summary
  --no-rebuild                Skip running backend index rebuild request
  --name <text>               Custom name prefix

Examples:
  node server/scripts/generate-alpha-levels.mjs --type square --count 3 --width 6 --height 6
  node server/scripts/generate-alpha-levels.mjs --type right-triangle --count 3 --difficulty 4
  node server/scripts/generate-alpha-levels.mjs --type equilateral-triangle --width 6 --height 3 --pairs 5
`);
}
