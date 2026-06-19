import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeaveSubmissionResult,
  calculateWeavePenaltyMs,
  isWeaveVisibleEndpoint
} from "./weaveRules.js";

const level = {
  pairs: [
    { id: "1", points: [[0, 0], [2, 0]] },
    { id: "2", points: [[0, 1], [2, 1]] },
    { id: "3", points: [[0, 2], [2, 2]] }
  ]
};

test("calculateWeavePenaltyMs follows the current rule formula", () => {
  assert.equal(calculateWeavePenaltyMs(0), 0);
  assert.equal(calculateWeavePenaltyMs(1), 20_000);
  assert.equal(calculateWeavePenaltyMs(2), 41_000);
  assert.equal(calculateWeavePenaltyMs(3), 63_000);
  assert.equal(calculateWeavePenaltyMs(5), 110_000);
});

test("partial correct submission checks only marked endpoints and does not win", () => {
  const result = buildWeaveSubmissionResult(level, {
    "2,0": "1"
  });

  assert.equal(result.wrongCount, 0);
  assert.equal(result.correctMarkedCount, 1);
  assert.equal(result.missingCount, 2);
  assert.equal(result.penaltyMs, 0);
  assert.equal(result.isVictory, false);
});

test("wrong marked endpoints return feedback and penalty", () => {
  const result = buildWeaveSubmissionResult(level, {
    "2,0": "1",
    "1,1": "2",
    "2,2": "2"
  });

  assert.equal(result.wrongCount, 2);
  assert.equal(result.correctMarkedCount, 1);
  assert.equal(result.missingCount, 2);
  assert.equal(result.penaltyMs, 41_000);
  assert.deepEqual(result.feedback.map((item) => item.isCorrect), [false, true, false]);
});

test("all hidden endpoints correct wins only after submission", () => {
  const result = buildWeaveSubmissionResult(level, {
    "2,0": "1",
    "2,1": "2",
    "2,2": "3"
  });

  assert.equal(result.wrongCount, 0);
  assert.equal(result.correctMarkedCount, 3);
  assert.equal(result.missingCount, 0);
  assert.equal(result.isVictory, true);
});

test("visible endpoints are identifiable and can be blocked by the UI", () => {
  assert.equal(isWeaveVisibleEndpoint(level, "0,0"), true);
  assert.equal(isWeaveVisibleEndpoint(level, "0,1"), true);
  assert.equal(isWeaveVisibleEndpoint(level, "2,1"), false);
});
