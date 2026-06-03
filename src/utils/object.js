export function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export function omitKey(source, keyToOmit) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== keyToOmit));
}

export function cloneLevel(levelData) {
  return JSON.parse(JSON.stringify(levelData));
}
