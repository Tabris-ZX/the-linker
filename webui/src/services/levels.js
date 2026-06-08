import { pointDefinitions } from "../config/index.js";
import { fetchLevelAnswers, fetchLevelDetail, fetchLevelIndex, saveLevelRequest } from "../router/levels.js";
import { cloneLevel } from "../utils/object.js";
import { normalizeGridType } from "../utils/geometry.js";

/**
 * 加载关卡目录，目录不包含完整 pairs/answers。
 *
 * @returns {Promise<Array<object>>} 关卡目录项。
 */
export async function loadLevelIndex() {
  return (await fetchLevelIndex())
    .filter(isValidLevelIndexItem)
    .map((level) => hydrateLevelIndexItem(level));
}

/**
 * 按 id 加载完整关卡内容。
 *
 * @param {string} levelId 关卡 id。
 * @returns {Promise<object>} 完整关卡。
 */
export async function loadLevelDetail(levelId, sourcePath = "") {
  return hydrateLevel(await fetchLevelDetail(levelId, sourcePath));
}

export async function loadLevelAnswers(level) {
  const payload = await fetchLevelAnswers(level.sourcePath);
  return Array.isArray(payload?.answers) ? payload.answers : [];
}

/**
 * 保存关卡文件，并按当前点位定义补全返回数据。
 *
 * @param {object} level 要保存的关卡数据。
 * @param {object} [definitions=pointDefinitions] 点位样式定义。
 * @param {object} [options={}] 保存选项。
 * @returns {Promise<object>} 服务端保存后水合过的关卡数据。
 */
export async function saveLevelFile(level, definitions = pointDefinitions, options = {}) {
  return hydrateLevel(await saveLevelRequest(level, options), definitions);
}

/**
 * 补全关卡默认字段和点位展示信息。
 *
 * @param {object} rawLevel 原始关卡数据。
 * @param {object} [definitions=pointDefinitions] 点位样式定义。
 * @returns {object} 可直接用于游戏和编辑器的关卡数据。
 */
export function hydrateLevel(rawLevel, definitions = pointDefinitions) {
  const palette = Object.values(definitions).map((point) => point.color);
  const pairs = Array.isArray(rawLevel?.pairs) ? rawLevel.pairs : [];
  const hydratedPairs = pairs.map((pair, index) => {
    const pairId = String(pair?.id ?? "");
    return {
      ...pair,
      id: pairId,
      label: definitions[pairId]?.label ?? pairId,
      color: definitions[pairId]?.color ?? palette[index % palette.length],
      points: Array.isArray(pair?.points) ? pair.points : []
    };
  });
  return {
    ...rawLevel,
    gridType: normalizeGridType(rawLevel.gridType ?? "square"),
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    sourcePath: rawLevel.sourcePath ?? "",
    sourceCategory: normalizeLevelSourceCategory(rawLevel.sourceCategory, rawLevel.sourcePath),
    pairs: hydratedPairs,
    removedEdges: rawLevel.removedEdges ?? [],
    answers: normalizeLevelAnswers(rawLevel.answers)
  };
}

export function hydrateLevelIndexItem(rawLevel) {
  return {
    ...rawLevel,
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    sourcePath: rawLevel.sourcePath ?? "",
    sourceCategory: normalizeLevelSourceCategory(rawLevel.sourceCategory, rawLevel.sourcePath),
    isLevelIndexItem: true
  };
}

export { cloneLevel };

/**
 * 将关卡难度限制在 1 到 5 的整数范围内。
 *
 * @param {unknown} value 原始难度值。
 * @returns {number} 标准难度。
 */
function normalizeLevelDifficulty(value) {
  const difficulty = Number(value);
  if (!Number.isFinite(difficulty)) return 1;
  return Math.min(5, Math.max(1, Math.round(difficulty)));
}

function normalizeLevelSourceCategory(category, sourcePath = "") {
  if (["stable", "alpha", "removed"].includes(category)) return category;
  const [directory] = String(sourcePath).split("/");
  if (["stable", "alpha", "removed"].includes(directory)) return directory;
  return "stable";
}

function normalizeLevelAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers
    .filter((answer) => answer && typeof answer === "object" && answer.edge && /^\d+$/.test(String(answer.pairId ?? "")))
    .map((answer) => ({
      ...answer,
      pairId: String(answer.pairId)
    }));
}

function isValidRawLevel(level) {
  return level && typeof level === "object" && Array.isArray(level.pairs);
}

function isValidLevelIndexItem(level) {
  return level && typeof level === "object" && typeof level.id === "string";
}
