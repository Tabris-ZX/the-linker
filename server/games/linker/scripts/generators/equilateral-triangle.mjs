export function buildEquilateralTriangleGeneratedCandidate({ level, config, index, attempt, rng, targetPairs, context }) {
  const solutionPaths = context.buildSolutionPaths(level, {
    targetPairs,
    minSegmentLength: config.minSegmentLength,
    loopPasses: config.loopPasses,
    variant: index + attempt,
    rng
  });
  const segments = solutionPaths.filter((path) => path.length >= 2);
  return context.candidateFromSegments(level, segments);
}
