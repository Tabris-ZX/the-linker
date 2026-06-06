import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const inputFile = path.join(projectRoot, "data/1.json");
const levelsDir = path.join(projectRoot, "data/levels");
const testsDir = path.join(levelsDir, "tests");

const palette = [
  ["red", "1", "#ef4444"],
  ["blue", "2", "#2563eb"],
  ["green", "3", "#22c55e"],
  ["amber", "4", "#f59e0b"],
  ["pink", "5", "#ec4899"],
  ["cyan", "6", "#14b8a6"],
  ["violet", "7", "#8b5cf6"],
  ["brown", "8", "#a16207"],
  ["teal", "9", "#0f766e"],
  ["orange", "10", "#f97316"],
  ["slate", "11", "#475569"],
  ["lime", "12", "#84cc16"],
  ["indigo", "13", "#4f46e5"],
  ["rose", "14", "#e11d48"],
  ["emerald", "15", "#059669"],
  ["zinc", "16", "#52525b"]
];

const imported = JSON.parse(await fs.readFile(inputFile, "utf8"));
const sourceLevels = flattenImportedLevels(imported);
const firstLevelNumber = await getNextLevelNumber();

await fs.mkdir(testsDir, { recursive: true });

const convertedLevels = sourceLevels.map((source, index) => {
  const levelNumber = firstLevelNumber + index;
  return convertLevel(source, `level-${String(levelNumber).padStart(3, "0")}`);
});

for (const level of convertedLevels) {
  validateLevel(level);
  const outputFile = path.join(testsDir, `${level.id}.json`);
  if (await fileExists(outputFile)) {
    throw new Error(`Refusing to overwrite existing level file: ${path.relative(projectRoot, outputFile)}`);
  }
  await fs.writeFile(outputFile, `${JSON.stringify(level, null, 2)}\n`, "utf8");
}

console.log(`Converted ${convertedLevels.length} levels into ${path.relative(projectRoot, testsDir)}.`);
console.log(`Created ${convertedLevels[0]?.id ?? "none"} through ${convertedLevels.at(-1)?.id ?? "none"}.`);

function flattenImportedLevels(data) {
  const levels = [];
  for (const [category, groups] of Object.entries(data)) {
    for (const [group, entries] of Object.entries(groups ?? {})) {
      for (const entry of entries ?? []) {
        levels.push({ category, group, entry });
      }
    }
  }
  return levels;
}

async function getNextLevelNumber() {
  const files = await listFiles(levelsDir);
  return files.reduce((max, filePath) => {
    const matched = /^level-(\d+)\.json$/.exec(path.basename(filePath));
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0) + 1;
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    if (entry.isFile()) return [entryPath];
    return [];
  }));
  return files.flat();
}

function convertLevel(source, id) {
  const { category, group, entry } = source;
  const size = Number(entry.size);
  const pairs = [...entry.pairs]
    .sort((left, right) => Number(left.id) - Number(right.id))
    .map((pair, index) => {
      const [pairId, label, color] = palette[index] ?? [`pair-${index + 1}`, String(index + 1), "#111827"];
      return {
        id: pairId,
        label,
        color,
        points: [
          toNode(pair.a),
          toNode(pair.b)
        ]
      };
    });

  const pairIdByImportedId = new Map(entry.pairs.map((pair, index) => {
    const [pairId] = palette[index] ?? [`pair-${index + 1}`];
    return [String(pair.id), pairId];
  }));

  const answers = Object.entries(entry.solution ?? {}).flatMap(([importedPairId, pathPoints]) => {
    const pairId = pairIdByImportedId.get(String(importedPairId));
    if (!pairId) throw new Error(`Missing pair ${importedPairId} in ${entry.id}`);
    return pathToEdges(pathPoints).map((edge) => ({ edge, pairId }));
  });

  return {
    id,
    name: `Imported ${id.slice(6)}`,
    difficulty: difficultyFor(entry),
    gridType: "square",
    width: size - 1,
    height: size - 1,
    pairs,
    removedEdges: [],
    answers,
    importedFrom: {
      category,
      group,
      id: entry.id
    }
  };
}

function difficultyFor(entry) {
  const size = Number(entry.size);
  const pairCount = Number(entry.pairs?.length ?? 0);
  if (size >= 15 || pairCount >= 14) return 5;
  if (size >= 11 || pairCount >= 10) return 4;
  if (size >= 9 || pairCount >= 8) return 3;
  return 2;
}

function toNode(point) {
  return [Number(point.c), Number(point.r)];
}

function pathToEdges(pathPoints) {
  const edges = [];
  for (let index = 1; index < pathPoints.length; index += 1) {
    const from = toNode(pathPoints[index - 1]);
    const to = toNode(pathPoints[index]);
    assertAdjacent(from, to);
    edges.push(edgeKey(from, to));
  }
  return edges;
}

function assertAdjacent(from, to) {
  const distance = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
  if (distance !== 1) {
    throw new Error(`Non-adjacent solution step: ${from.join(",")} -> ${to.join(",")}`);
  }
}

function edgeKey(from, to) {
  const a = `${from[0]},${from[1]}`;
  const b = `${to[0]},${to[1]}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function validateLevel(level) {
  const nodeOwners = new Map();
  const edgeOwners = new Map();
  const endpointKeys = new Map();

  for (const pair of level.pairs) {
    for (const point of pair.points) {
      endpointKeys.set(point.join(","), pair.id);
    }
  }

  for (const answer of level.answers) {
    if (edgeOwners.has(answer.edge)) {
      throw new Error(`${level.id} has duplicate answer edge: ${answer.edge}`);
    }
    edgeOwners.set(answer.edge, answer.pairId);
    const [from, to] = answer.edge.split("|");
    for (const nodeKey of [from, to]) {
      const currentOwner = nodeOwners.get(nodeKey);
      if (currentOwner && currentOwner !== answer.pairId) {
        throw new Error(`${level.id} has overlapping paths at ${nodeKey}`);
      }
      nodeOwners.set(nodeKey, answer.pairId);
    }
  }

  for (let y = 0; y <= level.height; y += 1) {
    for (let x = 0; x <= level.width; x += 1) {
      const nodeKey = `${x},${y}`;
      if (!nodeOwners.has(nodeKey)) throw new Error(`${level.id} does not cover node ${nodeKey}`);
    }
  }

  for (const [nodeKey, pairId] of endpointKeys) {
    if (nodeOwners.get(nodeKey) !== pairId) {
      throw new Error(`${level.id} endpoint ${nodeKey} is not connected to ${pairId}`);
    }
  }
}

async function fileExists(filePath) {
  return Boolean(await fs.stat(filePath).catch(() => null));
}
