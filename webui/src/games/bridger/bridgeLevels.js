export const bridgeLevels = [
  {
    id: "bridge-001",
    name: "第一座桥",
    difficulty: 1,
    width: 7,
    height: 5,
    islands: [
      { id: "a", x: 1, y: 1, value: 2 },
      { id: "b", x: 4, y: 1, value: 2 },
      { id: "c", x: 1, y: 3, value: 2 },
      { id: "d", x: 4, y: 3, value: 2 }
    ]
  },
  {
    id: "bridge-002",
    name: "双线练习",
    difficulty: 2,
    width: 7,
    height: 7,
    islands: [
      { id: "a", x: 1, y: 1, value: 3 },
      { id: "b", x: 5, y: 1, value: 3 },
      { id: "c", x: 1, y: 5, value: 3 },
      { id: "d", x: 5, y: 5, value: 3 }
    ]
  },
  {
    id: "bridge-003",
    name: "中心交错",
    difficulty: 3,
    width: 9,
    height: 7,
    islands: [
      { id: "a", x: 1, y: 1, value: 2 },
      { id: "b", x: 4, y: 1, value: 3 },
      { id: "c", x: 7, y: 1, value: 2 },
      { id: "d", x: 4, y: 3, value: 4 },
      { id: "e", x: 1, y: 5, value: 2 },
      { id: "f", x: 4, y: 5, value: 3 },
      { id: "g", x: 7, y: 5, value: 2 }
    ]
  }
];

export function getBridgeLevelIndex() {
  return bridgeLevels.map((level) => ({
    id: level.id,
    name: level.name,
    difficulty: level.difficulty
  }));
}

export function getBridgeLevel(levelId) {
  return bridgeLevels.find((level) => level.id === levelId) ?? bridgeLevels[0] ?? null;
}
