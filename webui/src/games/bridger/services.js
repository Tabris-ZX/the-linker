import { fetchBridgerLevelDetail, fetchBridgerLevelIndex, saveBridgerLevelRequest } from "./router.js";

export async function loadBridgerLevelIndex() {
  const levels = await fetchBridgerLevelIndex();
  return Array.isArray(levels) ? levels : [];
}

export async function loadBridgerLevelDetail(levelId) {
  if (!levelId) return null;
  const level = await fetchBridgerLevelDetail(levelId);
  return hydrateBridgerLevel(level);
}

export function hydrateBridgerLevel(level) {
  if (!level || typeof level !== "object" || !Array.isArray(level.islands)) return null;
  return {
    id: String(level.id ?? ""),
    name: String(level.name ?? level.id ?? "数桥"),
    difficulty: normalizeDifficulty(level.difficulty),
    gridType: "bridger",
    width: normalizeSize(level.width),
    height: normalizeSize(level.height),
    sourcePath: String(level.sourcePath ?? ""),
    sourceCategory: String(level.sourceCategory ?? "stable"),
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

export async function saveBridgerLevel(level, token, options = {}) {
  const saved = await saveBridgerLevelRequest(level, token, options);
  return hydrateBridgerLevel(saved);
}

function normalizeDifficulty(value) {
  const difficulty = Math.round(Number(value) || 1);
  return Math.min(5, Math.max(1, difficulty));
}

function normalizeSize(value) {
  const size = Math.round(Number(value) || 1);
  return Math.max(1, size);
}
