import { pointDefinitions } from "../config/index.js";
import { fetchLevelDetail, fetchLevelFiles, fetchLevelIndex, saveLevelRequest } from "../router/levels.js";
import { cloneLevel } from "../utils/object.js";
import { normalizeGridType } from "../utils/geometry.js";

/**
 * 加载并水合所有关卡文件。
 *
 * @returns {Promise<Array<object>>} 带默认样式和默认字段的关卡列表。
 */
export async function loadLevelFiles() {
  return (await fetchLevelFiles())
    .filter(isValidRawLevel)
    .map((level) => hydrateLevel(level));
}

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

/**
 * 分页加载关卡文件，避免一次传输全部关卡。
 *
 * @param {{ offset?: number, limit?: number, id?: string }} [options] 分页或目标关卡选项。
 * @returns {Promise<{ levels: Array<object>, total: number, offset: number, limit: number }>} 分页关卡数据。
 */
export async function loadLevelPage(options = {}) {
  const page = await fetchLevelFiles({ ...options, page: true });
  const rawLevels = Array.isArray(page) ? page : page.levels;
  const levels = (rawLevels ?? [])
    .filter(isValidRawLevel)
    .map((level) => hydrateLevel(level));
  return {
    levels,
    total: Number.isInteger(page.total) ? page.total : levels.length,
    offset: Number.isInteger(page.offset) ? page.offset : Number(options.offset ?? 0),
    limit: Number.isInteger(page.limit) ? page.limit : Number(options.limit ?? levels.length)
  };
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
  // Merge level files with JSON color config so level authors can omit repeated labels/colors.
  return {
    ...rawLevel,
    gridType: normalizeGridType(rawLevel.gridType ?? "square"),
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    sourcePath: rawLevel.sourcePath ?? "",
    sourceCategory: normalizeLevelSourceCategory(rawLevel.sourceCategory, rawLevel.sourcePath),
    pairs: pairs.map((pair, index) => ({
      ...pair,
      label: definitions[pair.id]?.label ?? pair.label ?? String(index + 1),
      color: definitions[pair.id]?.color ?? pair.color ?? palette[index % palette.length]
    })),
    removedEdges: rawLevel.removedEdges ?? [],
    answers: rawLevel.answers ?? []
  };
}

export function hydrateLevelIndexItem(rawLevel) {
  return {
    ...rawLevel,
    gridType: normalizeGridType(rawLevel.gridType ?? "square"),
    difficulty: normalizeLevelDifficulty(rawLevel.difficulty),
    sourcePath: rawLevel.sourcePath ?? "",
    sourceCategory: normalizeLevelSourceCategory(rawLevel.sourceCategory, rawLevel.sourcePath),
    pairCount: Number.isFinite(Number(rawLevel.pairCount)) ? Number(rawLevel.pairCount) : 0,
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
  if (category === "tests" || category === "deleted" || category === "official") return category;
  const [directory] = String(sourcePath).split("/");
  if (directory === "tests" || directory === "deleted" || directory === "official") return directory;
  return "official";
}

function isValidRawLevel(level) {
  return level && typeof level === "object" && Array.isArray(level.pairs);
}

function isValidLevelIndexItem(level) {
  return level && typeof level === "object" && typeof level.id === "string";
}
