import assert from "node:assert/strict";
import test from "node:test";
import {
  canConnectIslands,
  createEmptyBridgerState,
  cycleBridgerBetween,
  getBridgeCellCandidates,
  getBridgeCount,
  getDefaultBridgeCellOrientation,
  getIslandBridgeCounts,
  isBridgerSolved
} from "./utils.js";

const squareLevel = {
  islands: [
    { id: "a", x: 0, y: 0, value: 2 },
    { id: "b", x: 3, y: 0, value: 2 },
    { id: "c", x: 0, y: 3, value: 2 },
    { id: "d", x: 3, y: 3, value: 2 }
  ]
};

test("cycles bridge count from zero to double then back to zero", () => {
  let state = createEmptyBridgerState();
  state = cycleBridgerBetween(squareLevel, state, "a", "b");
  assert.equal(getBridgeCount(state, "a", "b"), 1);
  state = cycleBridgerBetween(squareLevel, state, "a", "b");
  assert.equal(getBridgeCount(state, "a", "b"), 2);
  state = cycleBridgerBetween(squareLevel, state, "a", "b");
  assert.equal(getBridgeCount(state, "a", "b"), 0);
});

test("rejects diagonal and blocked island connections", () => {
  assert.equal(canConnectIslands(squareLevel, createEmptyBridgerState(), "a", "d"), false);
  const blocked = {
    islands: [
      { id: "a", x: 0, y: 0, value: 1 },
      { id: "b", x: 2, y: 0, value: 2 },
      { id: "c", x: 4, y: 0, value: 1 }
    ]
  };
  assert.equal(canConnectIslands(blocked, createEmptyBridgerState(), "a", "c"), false);
});

test("rejects crossing bridges", () => {
  const level = {
    islands: [
      { id: "a", x: 0, y: 2, value: 1 },
      { id: "b", x: 4, y: 2, value: 1 },
      { id: "c", x: 2, y: 0, value: 1 },
      { id: "d", x: 2, y: 4, value: 1 }
    ]
  };
  const state = cycleBridgerBetween(level, createEmptyBridgerState(), "a", "b");
  assert.equal(canConnectIslands(level, state, "c", "d"), false);
});

test("checks island counts and solved connectivity", () => {
  let state = createEmptyBridgerState();
  state = cycleBridgerBetween(squareLevel, state, "a", "b");
  state = cycleBridgerBetween(squareLevel, state, "b", "d");
  state = cycleBridgerBetween(squareLevel, state, "d", "c");
  state = cycleBridgerBetween(squareLevel, state, "c", "a");
  assert.deepEqual(getIslandBridgeCounts(squareLevel, state), { a: 2, b: 2, c: 2, d: 2 });
  assert.equal(isBridgerSolved(squareLevel, state), true);
});

test("finds bridge cell candidates with vertical default when both orientations exist", () => {
  const level = {
    width: 4,
    height: 4,
    islands: [
      { id: "top", x: 2, y: 0, value: 1 },
      { id: "bottom", x: 2, y: 4, value: 1 },
      { id: "left", x: 0, y: 2, value: 1 },
      { id: "right", x: 4, y: 2, value: 1 }
    ]
  };
  const candidates = getBridgeCellCandidates(level, createEmptyBridgerState(), 2, 2);
  assert.equal(candidates.vertical.key, "bottom|top");
  assert.equal(candidates.horizontal.key, "left|right");
  assert.equal(getDefaultBridgeCellOrientation(candidates), "vertical");
});

test("does not offer blocked bridge cell candidates", () => {
  const level = {
    width: 4,
    height: 4,
    islands: [
      { id: "top", x: 2, y: 0, value: 1 },
      { id: "middle", x: 2, y: 2, value: 1 },
      { id: "bottom", x: 2, y: 4, value: 1 }
    ]
  };
  const candidates = getBridgeCellCandidates(level, createEmptyBridgerState(), 2, 1);
  assert.equal(candidates.vertical.key, "middle|top");
  assert.equal(candidates.horizontal, null);
});
