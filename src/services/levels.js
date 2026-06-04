import { pointDefinitions } from "../config/index.js";
import { fetchLevelFiles, saveLevelRequest } from "../router/levels.js";
import { cloneLevel } from "../utils/object.js";
import { normalizeGridType } from "../utils/geometry.js";

export async function loadLevelFiles() {
  return (await fetchLevelFiles()).map((level) => hydrateLevel(level));
}

export async function saveLevelFile(level, definitions = pointDefinitions, options = {}) {
  return hydrateLevel(await saveLevelRequest(level, options), definitions);
}

export function hydrateLevel(rawLevel, definitions = pointDefinitions) {
  const palette = Object.values(definitions).map((point) => point.color);
  // Merge level files with JSON color config so level authors can omit repeated labels/colors.
  return {
    ...rawLevel,
    gridType: normalizeGridType(rawLevel.gridType ?? "square"),
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    pairs: rawLevel.pairs.map((pair, index) => ({
      ...pair,
      label: definitions[pair.id]?.label ?? pair.label ?? String(index + 1),
      color: definitions[pair.id]?.color ?? pair.color ?? palette[index % palette.length]
    })),
    removedEdges: rawLevel.removedEdges ?? [],
    answers: rawLevel.answers ?? []
  };
}

export { cloneLevel };

function normalizeLevelDifficulty(value) {
  const difficulty = Number(value);
  if (!Number.isFinite(difficulty)) return 1;
  return Math.min(5, Math.max(1, Math.round(difficulty)));
}
