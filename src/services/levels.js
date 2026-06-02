import { appConfig, pointDefinitions } from "../config.js";
import { cloneLevel, getPalette } from "../utils/object.js";

export async function loadLevelFiles() {
  // Prefer the Vite dev-server API so levels are read from the configured local level folder.
  try {
    const response = await fetch("/api/levels", { cache: "no-cache" });
    if (response.ok) {
      return (await response.json()).map(hydrateLevel);
    }
  } catch {
    // Static fallback keeps the app usable without the Vite dev server.
  }

  const loadedLevels = [];
  for (let number = 1; number <= 50; number += 1) {
    const id = `level-${String(number).padStart(3, "0")}`;
    try {
      const response = await fetch(`${appConfig.level.path}/${id}.json`, { cache: "no-cache" });
      if (!response.ok) continue;
      loadedLevels.push(hydrateLevel(await response.json()));
    } catch {
      continue;
    }
  }

  return loadedLevels;
}

export async function saveLevelFile(level) {
  // Browser code cannot write files directly, so saves go through the Vite local API.
  const response = await fetch("/api/levels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(level)
  });

  if (!response.ok) {
    throw new Error("保存失败，请确认正在通过 npm run dev 启动项目");
  }

  return hydrateLevel(await response.json());
}

export function hydrateLevel(rawLevel) {
  // Merge level files with JSON color config so level authors can omit repeated labels/colors.
  return {
    ...rawLevel,
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    pairs: rawLevel.pairs.map((pair, index) => ({
      ...pair,
      label: pair.label ?? pointDefinitions[pair.id]?.label ?? String(index + 1),
      color: pair.color ?? pointDefinitions[pair.id]?.color ?? getPalette()[index % getPalette().length]
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
