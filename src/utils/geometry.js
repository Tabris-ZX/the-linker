export function buildGridLines(width, height) {
  const lines = [];
  for (let x = 0; x <= width; x += 1) {
    lines.push({
      key: `v-${x}`,
      attrs: { x1: x, y1: 0, x2: x, y2: height }
    });
  }

  for (let y = 0; y <= height; y += 1) {
    lines.push({
      key: `h-${y}`,
      attrs: { x1: 0, y1: y, x2: width, y2: y }
    });
  }
  return lines;
}

export function getAllGridEdges(width, height) {
  const edges = [];
  for (let y = 0; y <= height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      edges.push(edgeKey([x, y], [x + 1, y]));
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      edges.push(edgeKey([x, y], [x, y + 1]));
    }
  }
  return edges;
}

export function edgeRenderData(edge) {
  const points = pointsFromEdgeKey(edge);
  if (!points) return null;
  return {
    key: edge,
    attrs: lineAttrs(points[0], points[1])
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

export function isAdjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function positionToArray(position) {
  return [position.x, position.y];
}
