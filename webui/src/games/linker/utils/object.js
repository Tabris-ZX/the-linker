/**
 * 将数值限制在指定范围内，非法值回退到最小值。
 *
 * @param {unknown} value 原始值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 限制后的数值。
 */
export function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 返回去掉指定 key 的新对象。
 *
 * @param {object} source 原对象。
 * @param {string} keyToOmit 需要移除的 key。
 * @returns {object} 移除 key 后的新对象。
 */
export function omitKey(source, keyToOmit) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== keyToOmit));
}

/**
 * 深拷贝关卡数据，避免编辑状态影响源数据。
 *
 * @param {object} levelData 关卡数据。
 * @returns {object} 深拷贝后的关卡数据。
 */
export function cloneLevel(levelData) {
  return JSON.parse(JSON.stringify(levelData));
}
