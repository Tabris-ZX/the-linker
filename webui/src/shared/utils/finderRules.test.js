import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinderHiddenEndpoints,
  buildFinderPairDistanceMap,
  buildFinderVisibleLevel,
  calculateManhattanDistance,
  buildFinderClueLinesFromBuckets,
  buildFinderSubmissionResult,
  calculateFinderPenaltyMs
} from "./finderRules.js";

const level = {
  pairs: [
    { id: "1", points: [[0, 0], [2, 0]] },
    { id: "2", points: [[0, 1], [2, 1]] },
    { id: "3", points: [[0, 2], [2, 2]] }
  ]
};

test("calculateFinderPenaltyMs follows the current rule formula", () => {
  assert.equal(calculateFinderPenaltyMs(0, 1), 0);
  assert.equal(calculateFinderPenaltyMs(1, 1), 5_000);
  assert.equal(calculateFinderPenaltyMs(2, 1), 9_000);
  assert.equal(calculateFinderPenaltyMs(3, 1), 12_000);
  assert.equal(calculateFinderPenaltyMs(5, 1), 15_000);
  assert.equal(calculateFinderPenaltyMs(2, 3), 29_000);
});

test("calculateManhattanDistance returns grid distance", () => {
  assert.equal(calculateManhattanDistance([0, 0], [2, 3]), 5);
  assert.equal(calculateManhattanDistance([2, 1], [2, 1]), 0);
});

test("finder visible level keeps only the first endpoint and stores hidden endpoints separately", () => {
  const visibleLevel = buildFinderVisibleLevel(level);
  const hiddenEndpoints = buildFinderHiddenEndpoints(level);

  assert.deepEqual(visibleLevel.pairs.map((pair) => pair.points), [
    [[0, 0]],
    [[0, 1]],
    [[0, 2]]
  ]);
  assert.deepEqual(hiddenEndpoints, [
    { pairId: "1", visiblePoint: [0, 0], point: [2, 0], nodeKey: "2,0" },
    { pairId: "2", visiblePoint: [0, 1], point: [2, 1], nodeKey: "2,1" },
    { pairId: "3", visiblePoint: [0, 2], point: [2, 2], nodeKey: "2,2" }
  ]);
});

test("finder pair distance map shows default distance and follows marked endpoint positions", () => {
  const distances = buildFinderPairDistanceMap(buildFinderHiddenEndpoints(level), {
    "2,0": "1",
    "1,1": "2"
  });

  assert.equal(distances["1"].distance, 0);
  assert.equal(distances["1"].correctDistance, 2);
  assert.equal(distances["1"].markedDistance, 2);
  assert.equal(distances["1"].remainingDistance, 0);
  assert.equal(distances["1"].status, "met");
  assert.equal(distances["2"].distance, -1);
  assert.equal(distances["2"].markedDistance, 1);
  assert.equal(distances["2"].remainingDistance, 1);
  assert.equal(distances["2"].status, "miss");
  assert.equal(distances["3"].distance, 2);
  assert.equal(distances["3"].markedDistance, null);
  assert.equal(distances["3"].remainingDistance, null);
  assert.equal(distances["3"].status, "empty");
});

test("finder pair distance displays marked distance difference from correct distance", () => {
  const tallLevel = {
    pairs: [
      { id: "2", points: [[0, 3], [0, 1]] }
    ]
  };

  const distances = buildFinderPairDistanceMap(buildFinderHiddenEndpoints(tallLevel), {
    "1,1": "2"
  });

  assert.equal(distances["2"].correctDistance, 2);
  assert.equal(distances["2"].distance, 1);
  assert.equal(distances["2"].markedDistance, 3);
  assert.equal(distances["2"].remainingDistance, 1);
  assert.equal(distances["2"].status, "miss");
});

test("finder pair distance keeps signed negative differences", () => {
  const signedLevel = {
    pairs: [
      { id: "2", points: [[0, 3], [0, 0]] }
    ]
  };

  const distances = buildFinderPairDistanceMap(buildFinderHiddenEndpoints(signedLevel), {
    "0,1": "2"
  });

  assert.equal(distances["2"].correctDistance, 3);
  assert.equal(distances["2"].markedDistance, 2);
  assert.equal(distances["2"].distance, -1);
  assert.equal(distances["2"].status, "miss");
});

test("partial correct submission checks only marked endpoints and does not win", () => {
  const result = buildFinderSubmissionResult(level, {
    "2,0": "1"
  });

  assert.equal(result.wrongCount, 0);
  assert.equal(result.correctMarkedCount, 1);
  assert.equal(result.missingCount, 2);
  assert.equal(result.penaltyMs, 0);
  assert.equal(result.isVictory, false);
});

test("wrong marked endpoints return feedback and penalty", () => {
  const result = buildFinderSubmissionResult(level, {
    "2,2": "2",
    "2,0": "1",
    "1,1": "2"
  });

  assert.equal(result.wrongCount, 2);
  assert.equal(result.correctMarkedCount, 1);
  assert.equal(result.missingCount, 2);
  assert.equal(result.penaltyMs, 9_000);
  assert.deepEqual(result.feedback.map((item) => item.pairId), ["1", "2", "2"]);
  assert.deepEqual(result.feedback.map((item) => item.isCorrect), [true, false, false]);
});

test("all hidden endpoints correct wins only after submission", () => {
  const result = buildFinderSubmissionResult(buildFinderHiddenEndpoints(level), {
    "2,0": "1",
    "2,1": "2",
    "2,2": "3"
  });

  assert.equal(result.wrongCount, 0);
  assert.equal(result.correctMarkedCount, 3);
  assert.equal(result.missingCount, 0);
  assert.equal(result.isVictory, true);
});

test("finder clue totals include unknown marks and keep negative remaining values", () => {
  const targetBuckets = new Map([
    [0, new Map([["1", 1]])],
    [1, new Map()]
  ]);
  const currentBuckets = new Map([
    [0, new Map([["__unknown__", 1], ["2", 1]])],
    [1, new Map()]
  ]);

  const clues = buildFinderClueLinesFromBuckets(targetBuckets, currentBuckets, 3);

  assert.deepEqual(clues.map((clue) => clue.total.remaining), [-1, 0, 0]);
  assert.deepEqual(clues.map((clue) => clue.total.status), ["over", "met", "met"]);
});
