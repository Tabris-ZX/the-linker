export function validateBridgerLevel(level) {
  if (!level || typeof level !== "object") return "关卡数据无效";
  if (!Array.isArray(level.islands) || level.islands.length < 2) return "至少需要两个岛屿";
  const seenPositions = new Set();
  for (const island of level.islands) {
    const key = `${island.x},${island.y}`;
    if (seenPositions.has(key)) return "岛屿位置不能重复";
    seenPositions.add(key);
    if (Number(island.value) < 0 || Number(island.value) > 8) return "岛屿数字必须在 0 到 8 之间";
  }
  return "";
}
