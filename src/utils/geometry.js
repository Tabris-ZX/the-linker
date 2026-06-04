const SQRT3 = Math.sqrt(3);

export function normalizeGridType(gridType = "square") {
  if (gridType === "triangle") return "right-triangle";
  return gridType;
}

export function getGridBounds(level) {
  const gridType = normalizeGridType(level?.gridType);
  if (gridType === "equilateral-triangle") {
    const points = getEquilateralTriangleNodes(level).map((point) => toRenderPoint(point, gridType));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const padding = 0.5;
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs) + padding;
    const maxY = Math.max(...ys) + padding;
    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
      cols: maxX - minX,
      rows: maxY - minY
    };
  }

  return {
    minX: 0,
    minY: 0,
    width: level?.width ?? 1,
    height: level?.height ?? 1,
    cols: level?.width ?? 1,
    rows: level?.height ?? 1
  };
}

export function getGridRadius(level) {
  const radius = Number(level?.radius ?? level?.width ?? 3);
  return Number.isFinite(radius) ? Math.max(1, Math.round(radius)) : 3;
}

export function buildGridLines(widthOrLevel, height, gridType = "square") {
  const level = normalizeGridArgs(widthOrLevel, height, gridType);
  return getAllGridEdges(level).map((edge) => edgeRenderData(edge, level.gridType)).filter(Boolean);
}

export function getAllGridEdges(widthOrLevel, height, gridType = "square") {
  const level = normalizeGridArgs(widthOrLevel, height, gridType);
  const normalizedType = normalizeGridType(level.gridType);
  if (normalizedType === "equilateral-triangle") return getEquilateralTriangleEdges(level);

  const edges = [];
  const width = level.width;
  const gridHeight = level.height;
  for (let y = 0; y <= gridHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      edges.push(edgeKey([x, y], [x + 1, y]));
    }
  }

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      edges.push(edgeKey([x, y], [x, y + 1]));
    }
  }

  if (normalizedType === "right-triangle") {
    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const from = (x + y) % 2 === 0 ? [x, y] : [x + 1, y];
        const to = (x + y) % 2 === 0 ? [x + 1, y + 1] : [x, y + 1];
        edges.push(edgeKey(from, to));
      }
    }
  }
  return edges;
}

export function getGridNodes(level) {
  const normalizedType = normalizeGridType(level?.gridType);
  if (normalizedType === "equilateral-triangle") return getEquilateralTriangleNodes(level);

  const nodes = [];
  for (let y = 0; y <= level.height; y += 1) {
    for (let x = 0; x <= level.width; x += 1) {
      nodes.push([x, y]);
    }
  }
  return nodes;
}

export function edgeRenderData(edge, gridType = "square") {
  const points = pointsFromEdgeKey(edge);
  if (!points) return null;
  return {
    key: edge,
    attrs: lineAttrs(toRenderPoint(points[0], gridType), toRenderPoint(points[1], gridType))
  };
}

export function lineAttrs(from, to) {
  return {
    x1: from[0],
    y1: from[1],
    x2: to[0],
    y2: to[1]
  };
}

export function keyOf(x, y) {
  return `${x},${y}`;
}

export function pointFromKey(key) {
  return key.split(",").map(Number);
}

export function pointsFromEdgeKey(edge) {
  const points = edge.split("|").map(pointFromKey);
  if (points.length !== 2 || points.some((point) => point.some(Number.isNaN))) return null;
  return points;
}

export function edgeKey(from, to) {
  const a = keyOf(from[0], from[1]);
  const b = keyOf(to[0], to[1]);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

export function isAdjacent(a, b, gridType = "square") {
  const normalizedType = normalizeGridType(gridType);
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  if (dx + dy === 1) return true;

  if (normalizedType === "right-triangle") {
    if (dx !== 1 || dy !== 1) return false;
    const minX = Math.min(a[0], b[0]);
    const minY = Math.min(a[1], b[1]);
    const diagonalFrom = (minX + minY) % 2 === 0 ? [minX, minY] : [minX + 1, minY];
    const diagonalTo = (minX + minY) % 2 === 0 ? [minX + 1, minY + 1] : [minX, minY + 1];
    return samePoint(a, diagonalFrom) && samePoint(b, diagonalTo)
      || samePoint(a, diagonalTo) && samePoint(b, diagonalFrom);
  }

  if (normalizedType === "equilateral-triangle") {
    return dx === 1 && dy === 1 && Math.sign(a[0] - b[0]) !== Math.sign(a[1] - b[1]);
  }

  return false;
}

export function positionToArray(position) {
  return [position.x, position.y];
}

export function toRenderPoint(point, gridType = "square") {
  if (normalizeGridType(gridType) !== "equilateral-triangle") return point;
  const [q, r] = point;
  return [q + r / 2, r * SQRT3 / 2];
}

export function fromRenderPoint(point, gridType = "square") {
  if (normalizeGridType(gridType) !== "equilateral-triangle") return point;
  const [x, y] = point;
  const r = y / (SQRT3 / 2);
  return [x - r / 2, r];
}

function normalizeGridArgs(widthOrLevel, height, gridType) {
  if (typeof widthOrLevel === "object") {
    return {
      ...widthOrLevel,
      gridType: normalizeGridType(widthOrLevel.gridType)
    };
  }
  return {
    width: widthOrLevel,
    height,
    gridType: normalizeGridType(gridType)
  };
}

function getEquilateralTriangleNodes(level) {
  const radius = getGridRadius(level);
  const nodes = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius) {
        nodes.push([q, r]);
      }
    }
  }
  return nodes;
}

function getEquilateralTriangleEdges(level) {
  const nodes = new Set(getEquilateralTriangleNodes(level).map(([q, r]) => keyOf(q, r)));
  const directions = [[1, 0], [0, 1], [1, -1]];
  const edges = [];
  nodes.forEach((key) => {
    const [q, r] = pointFromKey(key);
    directions.forEach(([dq, dr]) => {
      const next = [q + dq, r + dr];
      if (nodes.has(keyOf(next[0], next[1]))) edges.push(edgeKey([q, r], next));
    });
  });
  return edges;
}
