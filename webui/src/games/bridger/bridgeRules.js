export function bridgeKey(leftId, rightId) {
  const left = String(leftId);
  const right = String(rightId);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function createEmptyBridgeState() {
  return { bridges: {} };
}

export function getIsland(level, islandId) {
  return (level?.islands ?? []).find((island) => island.id === islandId) ?? null;
}

export function getBridgeCount(state, leftId, rightId) {
  return Number(state?.bridges?.[bridgeKey(leftId, rightId)] ?? 0) || 0;
}

export function cycleBridgeBetween(level, state, leftId, rightId) {
  if (!canConnectIslands(level, state, leftId, rightId)) return state;
  const key = bridgeKey(leftId, rightId);
  const current = getBridgeCount(state, leftId, rightId);
  const nextCount = (current + 1) % 3;
  const bridges = { ...(state?.bridges ?? {}) };
  if (nextCount === 0) {
    delete bridges[key];
  } else {
    bridges[key] = nextCount;
  }
  return { bridges };
}

export function canConnectIslands(level, state, leftId, rightId) {
  const left = getIsland(level, leftId);
  const right = getIsland(level, rightId);
  if (!left || !right || left.id === right.id) return false;
  if (!isStraightPair(left, right)) return false;
  if (hasIslandBetween(level, left, right)) return false;
  return !wouldCrossExistingBridge(level, state, left, right);
}

export function getConnectableBridgePairs(level, state = createEmptyBridgeState()) {
  const pairs = [];
  const islands = level?.islands ?? [];
  for (let index = 0; index < islands.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < islands.length; nextIndex += 1) {
      const left = islands[index];
      const right = islands[nextIndex];
      if (!isStraightPair(left, right)) continue;
      const count = getBridgeCount(state, left.id, right.id);
      if (!canConnectIslands(level, state, left.id, right.id) && count === 0) continue;
      pairs.push(createBridgePair(left, right, count));
    }
  }
  return pairs;
}

export function getBridgeCellCandidates(level, state, x, y) {
  const cellX = clampCoordinate(x, 0, level?.width ?? 0);
  const cellY = clampCoordinate(y, 0, level?.height ?? 0);
  const pairs = getConnectableBridgePairs(level, state);
  return {
    vertical: findNearestPairThroughCell(pairs, cellX, cellY, "vertical"),
    horizontal: findNearestPairThroughCell(pairs, cellX, cellY, "horizontal")
  };
}

export function getDefaultBridgeCellOrientation(candidates) {
  if (candidates?.vertical) return "vertical";
  if (candidates?.horizontal) return "horizontal";
  return "";
}

export function getVisibleBridgePairs(level, state = createEmptyBridgeState()) {
  return Object.entries(state.bridges ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => {
      const [leftId, rightId] = key.split("|");
      const left = getIsland(level, leftId);
      const right = getIsland(level, rightId);
      if (!left || !right) return null;
      return createBridgePair(left, right, Number(count));
    })
    .filter(Boolean);
}

export function getIslandBridgeCounts(level, state = createEmptyBridgeState()) {
  const counts = Object.fromEntries((level?.islands ?? []).map((island) => [island.id, 0]));
  getVisibleBridgePairs(level, state).forEach((bridge) => {
    counts[bridge.left.id] += bridge.count;
    counts[bridge.right.id] += bridge.count;
  });
  return counts;
}

export function getIslandStatus(level, state, islandId) {
  const island = getIsland(level, islandId);
  if (!island) return "empty";
  const current = getIslandBridgeCounts(level, state)[islandId] ?? 0;
  if (current > island.value) return "over";
  if (current === island.value) return "met";
  return "under";
}

export function isBridgeSolved(level, state) {
  const islands = level?.islands ?? [];
  if (!islands.length) return false;
  const counts = getIslandBridgeCounts(level, state);
  const allNumbersMet = islands.every((island) => counts[island.id] === island.value);
  return allNumbersMet && areAllIslandsConnected(level, state);
}

export function areAllIslandsConnected(level, state) {
  const islands = level?.islands ?? [];
  if (!islands.length) return false;
  const adjacency = new Map(islands.map((island) => [island.id, new Set()]));
  getVisibleBridgePairs(level, state).forEach((bridge) => {
    adjacency.get(bridge.left.id)?.add(bridge.right.id);
    adjacency.get(bridge.right.id)?.add(bridge.left.id);
  });
  const visited = new Set();
  const stack = [islands[0].id];
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    adjacency.get(id)?.forEach((nextId) => {
      if (!visited.has(nextId)) stack.push(nextId);
    });
  }
  return visited.size === islands.length;
}

export function isStraightPair(left, right) {
  return left.x === right.x || left.y === right.y;
}

function createBridgePair(left, right, count = 0) {
  const orientation = left.y === right.y ? "horizontal" : "vertical";
  return {
    key: bridgeKey(left.id, right.id),
    left,
    right,
    count: Number(count) || 0,
    orientation,
    minX: Math.min(left.x, right.x),
    maxX: Math.max(left.x, right.x),
    minY: Math.min(left.y, right.y),
    maxY: Math.max(left.y, right.y)
  };
}

function findNearestPairThroughCell(pairs, x, y, orientation) {
  const matches = pairs
    .filter((pair) => {
      if (pair.orientation !== orientation) return false;
      if (orientation === "vertical") {
        return pair.left.x === x && y > pair.minY && y < pair.maxY;
      }
      return pair.left.y === y && x > pair.minX && x < pair.maxX;
    })
    .sort((left, right) => {
      const leftSpan = orientation === "vertical" ? left.maxY - left.minY : left.maxX - left.minX;
      const rightSpan = orientation === "vertical" ? right.maxY - right.minY : right.maxX - right.minX;
      return leftSpan - rightSpan || left.key.localeCompare(right.key);
    });
  return matches[0] ?? null;
}

function clampCoordinate(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function hasIslandBetween(level, left, right) {
  return (level?.islands ?? []).some((island) => {
    if (island.id === left.id || island.id === right.id) return false;
    if (left.x === right.x && island.x === left.x) {
      return isBetween(island.y, left.y, right.y);
    }
    if (left.y === right.y && island.y === left.y) {
      return isBetween(island.x, left.x, right.x);
    }
    return false;
  });
}

function wouldCrossExistingBridge(level, state, left, right) {
  const candidate = normalizeSegment(left, right);
  return getVisibleBridgePairs(level, state).some((bridge) => {
    if ([bridge.left.id, bridge.right.id].includes(left.id) || [bridge.left.id, bridge.right.id].includes(right.id)) {
      return false;
    }
    return segmentsCross(candidate, normalizeSegment(bridge.left, bridge.right));
  });
}

function normalizeSegment(left, right) {
  return {
    x1: Math.min(left.x, right.x),
    x2: Math.max(left.x, right.x),
    y1: Math.min(left.y, right.y),
    y2: Math.max(left.y, right.y),
    orientation: left.y === right.y ? "horizontal" : "vertical"
  };
}

function segmentsCross(left, right) {
  if (left.orientation === right.orientation) return false;
  const horizontal = left.orientation === "horizontal" ? left : right;
  const vertical = left.orientation === "vertical" ? left : right;
  return isBetween(vertical.x1, horizontal.x1, horizontal.x2)
    && isBetween(horizontal.y1, vertical.y1, vertical.y2);
}

function isBetween(value, start, end) {
  return value > Math.min(start, end) && value < Math.max(start, end);
}
