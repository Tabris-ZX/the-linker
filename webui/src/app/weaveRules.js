function keyOfPoint(point) {
  return `${point[0]},${point[1]}`;
}

export function calculateWeavePenaltyMs(wrongCount) {
  const count = Math.max(0, Math.trunc(Number(wrongCount) || 0));
  return (count * (39 + count) / 2) * 1000;
}

export function getWeaveHiddenEndpointKey(pair) {
  const hidden = pair?.points?.[1];
  return Array.isArray(hidden) ? keyOfPoint(hidden) : "";
}

export function getWeaveVisibleEndpointKeys(level) {
  return new Set((level?.pairs ?? [])
    .map((pair) => pair?.points?.[0])
    .filter(Array.isArray)
    .map(keyOfPoint));
}

export function isWeaveVisibleEndpoint(level, nodeKey) {
  return getWeaveVisibleEndpointKeys(level).has(nodeKey);
}

export function buildWeaveSubmissionResult(level, markedEndpoints = {}) {
  const correctMap = new Map(
    (level?.pairs ?? [])
      .map((pair) => [getWeaveHiddenEndpointKey(pair), String(pair?.id ?? "")])
      .filter(([nodeKey, pairId]) => nodeKey && pairId)
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
    feedback: feedback.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
    wrongCount,
    correctMarkedCount,
    missingCount,
    penaltyMs: calculateWeavePenaltyMs(wrongCount),
    isVictory: hiddenEndpointCount > 0 && wrongCount === 0 && correctMarkedCount === hiddenEndpointCount
  };
}
