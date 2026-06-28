function keyOfPoint(point) {
  return `${point[0]},${point[1]}`;
}

function pointFromKey(key) {
  const [x, y] = String(key ?? "").split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

export function calculateManhattanDistance(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null;
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]);
}

export function buildFinderVisibleLevel(level) {
  if (!level) return null;
  return {
    ...level,
    pairs: (level.pairs ?? []).map((pair) => ({
      ...pair,
      points: Array.isArray(pair?.points?.[0]) ? [[pair.points[0][0], pair.points[0][1]]] : []
    }))
  };
}

export function buildFinderHiddenEndpoints(level) {
  return (level?.pairs ?? [])
    .map((pair) => {
      const hidden = pair?.points?.[1];
      const visible = pair?.points?.[0];
      const pairId = String(pair?.id ?? "");
      if (!pairId || !Array.isArray(hidden)) return null;
      return {
        pairId,
        visiblePoint: Array.isArray(visible) ? [visible[0], visible[1]] : null,
        point: [hidden[0], hidden[1]],
        nodeKey: keyOfPoint(hidden)
      };
    })
    .filter(Boolean);
}

export function buildFinderPairDistanceMap(hiddenEndpoints, markedEndpoints = {}) {
  const markedByPairId = new Map();
  Object.entries(markedEndpoints ?? {}).forEach(([nodeKey, pairId]) => {
    if (pairId) markedByPairId.set(String(pairId), nodeKey);
  });

  return Object.fromEntries((hiddenEndpoints ?? []).map((endpoint) => {
    const markedKey = markedByPairId.get(endpoint.pairId) ?? "";
    const markedPoint = pointFromKey(markedKey);
    const correctDistance = calculateManhattanDistance(endpoint.visiblePoint, endpoint.point);
    const markedDistance = markedPoint ? calculateManhattanDistance(endpoint.visiblePoint, markedPoint) : null;
    const remainingDistance = markedPoint ? calculateManhattanDistance(markedPoint, endpoint.point) : null;
    const distance = markedPoint ? markedDistance - correctDistance : correctDistance;
    return [endpoint.pairId, {
      pairId: endpoint.pairId,
      markedKey,
      correctDistance,
      markedDistance,
      remainingDistance,
      distance,
      status: markedPoint ? distance === 0 ? "met" : "miss" : "empty"
    }];
  }));
}

export function calculateFinderPenaltyMs(wrongCount, difficulty = 1) {
  const count = Math.max(0, Math.trunc(Number(wrongCount) || 0));
  const level = Math.max(1, Math.trunc(Number(difficulty) || 1));
  return (count * (5 * level + (5 * level - count + 1)) / 2) * 1000;
}

export function buildFinderSubmissionResult(level, markedEndpoints = {}, difficulty = 1) {
  const correctMap = new Map(
    (Array.isArray(level) ? level : buildFinderHiddenEndpoints(level))
      .map((endpoint) => [endpoint.nodeKey, endpoint.pairId])
  );
  const feedback = [];
  let wrongCount = 0;
  let correctMarkedCount = 0;

  for (const [nodeKey, pairId] of Object.entries(markedEndpoints ?? {})) {
    const correctPairId = correctMap.get(nodeKey) ?? "";
    const isCorrect = correctPairId === pairId;
    if (!isCorrect) wrongCount += 1;
    if (isCorrect) correctMarkedCount += 1;
    feedback.push({
      nodeKey,
      pairId,
      correctPairId,
      isCorrect
    });
  }

  const hiddenEndpointCount = correctMap.size;
  const missingCount = Math.max(0, hiddenEndpointCount - correctMarkedCount);
  return {
    feedback: feedback.sort(compareFinderFeedback),
    wrongCount,
    correctMarkedCount,
    missingCount,
    penaltyMs: calculateFinderPenaltyMs(wrongCount, difficulty),
    isVictory: hiddenEndpointCount > 0 && wrongCount === 0 && correctMarkedCount === hiddenEndpointCount
  };
}

function compareFinderFeedback(left, right) {
  const leftId = Number(left.pairId);
  const rightId = Number(right.pairId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
  return String(left.pairId).localeCompare(String(right.pairId), undefined, { numeric: true })
    || left.nodeKey.localeCompare(right.nodeKey);
}

export function buildFinderClueLinesFromBuckets(targetBuckets, currentBuckets, limit) {
  const safeLimit = Math.max(0, Math.trunc(Number(limit) || 0));
  return Array.from({ length: safeLimit }, (_, index) => {
    const targetItems = targetBuckets.get(index) ?? new Map();
    const currentItems = currentBuckets.get(index) ?? new Map();
    const targetTotal = [...targetItems.values()].reduce((sum, value) => sum + value, 0);
    const currentTotal = [...currentItems.values()].reduce((sum, value) => sum + value, 0);
    const remaining = targetTotal - currentTotal;
    const status = remaining < 0 ? "over" : remaining === 0 ? "met" : "under";
    return {
      index,
      mode: "total",
      total: {
        label: "色点",
        target: targetTotal,
        current: currentTotal,
        remaining,
        status
      },
      items: []
    };
  });
}
