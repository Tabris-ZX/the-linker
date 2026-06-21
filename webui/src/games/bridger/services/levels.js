import { getBridgeLevel, getBridgeLevelIndex } from "../bridgeLevels.js";
import { fetchBridgeLevelDetail, fetchBridgeLevelIndex, saveBridgeLevelRequest } from "../router/levels.js";

export async function loadBridgeLevelIndex() {
  try {
    const levels = await fetchBridgeLevelIndex();
    return Array.isArray(levels) && levels.length ? levels : getBridgeLevelIndex();
  } catch {
    return getBridgeLevelIndex();
  }
}

export async function loadBridgeLevelDetail(levelId) {
  try {
    const level = await fetchBridgeLevelDetail(levelId);
    return hydrateBridgeLevel(level) ?? getBridgeLevel(levelId);
  } catch {
    return getBridgeLevel(levelId);
  }
}

export function hydrateBridgeLevel(level) {
  if (!level || typeof level !== "object" || !Array.isArray(level.islands)) return null;
  return {
    id: String(level.id ?? ""),
    name: String(level.name ?? level.id ?? "数桥"),
    difficulty: normalizeDifficulty(level.difficulty),
    width: normalizeSize(level.width),
    height: normalizeSize(level.height),
    islands: level.islands
      .filter((island) => island && typeof island === "object")
      .map((island) => ({
        id: String(island.id ?? ""),
        x: Number(island.x),
        y: Number(island.y),
        value: Math.max(0, Math.round(Number(island.value) || 0))
      }))
      .filter((island) => island.id && Number.isFinite(island.x) && Number.isFinite(island.y))
  };
}

export async function saveBridgeLevel(level, token, options = {}) {
  const saved = await saveBridgeLevelRequest(level, token, options);
  return hydrateBridgeLevel(saved);
}

function normalizeDifficulty(value) {
  const difficulty = Math.round(Number(value) || 1);
  return Math.min(5, Math.max(1, difficulty));
}

function normalizeSize(value) {
  const size = Math.round(Number(value) || 1);
  return Math.max(1, size);
}
