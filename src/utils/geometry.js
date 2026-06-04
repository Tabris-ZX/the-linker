const SQRT3 = Math.sqrt(3);

/**
 * 归一化网格类型，兼容旧版 triangle 配置。
 *
 * @param {string} [gridType="square"] 原始网格类型。
 * @returns {string} 标准化后的网格类型。
 */
export function normalizeGridType(gridType = "square") {
  if (gridType === "triangle") return "right-triangle";
  return gridType;
}

/**
 * 计算关卡在 SVG 坐标系中的可视范围和网格尺寸。
 *
 * @param {object} level 关卡或编辑器网格配置。
 * @returns {{ minX: number, minY: number, width: number, height: number, cols: number, rows: number }} 渲染边界信息。
 */
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

/**
 * 获取等边三角网格半径，并修正非法值。
 *
 * @param {object} level 关卡或编辑器网格配置。
 * @returns {number} 有效半径。
 */
export function getGridRadius(level) {
  const radius = Number(level?.radius ?? level?.width ?? 3);
  return Number.isFinite(radius) ? Math.max(1, Math.round(radius)) : 3;
}

/**
 * 生成当前网格所有可渲染边线。
 *
 * @param {object|number} widthOrLevel 关卡配置，或矩形网格宽度。
 * @param {number} [height] 矩形网格高度。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {Array<{ key: string, attrs: object }>} SVG 线段渲染数据。
 */
export function buildGridLines(widthOrLevel, height, gridType = "square") {
  const level = normalizeGridArgs(widthOrLevel, height, gridType);
  return getAllGridEdges(level).map((edge) => edgeRenderData(edge, level.gridType)).filter(Boolean);
}

/**
 * 枚举网格中的全部合法边。
 *
 * @param {object|number} widthOrLevel 关卡配置，或矩形网格宽度。
 * @param {number} [height] 矩形网格高度。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {string[]} 以 edgeKey 格式表示的边列表。
 */
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

/**
 * 枚举网格中的全部节点。
 *
 * @param {object} level 关卡或编辑器网格配置。
 * @returns {Array<[number, number]>} 节点坐标列表。
 */
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

/**
 * 将边 key 转换成 SVG 线段渲染数据。
 *
 * @param {string} edge 边 key。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {{ key: string, attrs: object }|null} 可渲染数据；格式无效时返回 null。
 */
export function edgeRenderData(edge, gridType = "square") {
  const points = pointsFromEdgeKey(edge);
  if (!points) return null;
  return {
    key: edge,
    attrs: lineAttrs(toRenderPoint(points[0], gridType), toRenderPoint(points[1], gridType))
  };
}

/**
 * 根据起止点生成 SVG line 属性。
 *
 * @param {[number, number]} from 起点渲染坐标。
 * @param {[number, number]} to 终点渲染坐标。
 * @returns {{ x1: number, y1: number, x2: number, y2: number }} SVG line 属性。
 */
export function lineAttrs(from, to) {
  return {
    x1: from[0],
    y1: from[1],
    x2: to[0],
    y2: to[1]
  };
}

/**
 * 生成节点坐标 key。
 *
 * @param {number} x 横坐标。
 * @param {number} y 纵坐标。
 * @returns {string} 节点 key。
 */
export function keyOf(x, y) {
  return `${x},${y}`;
}

/**
 * 将节点 key 解析为坐标。
 *
 * @param {string} key 节点 key。
 * @returns {[number, number]} 节点坐标。
 */
export function pointFromKey(key) {
  return key.split(",").map(Number);
}

/**
 * 将边 key 解析成两个端点。
 *
 * @param {string} edge 边 key。
 * @returns {Array<[number, number]>|null} 两个端点；格式无效时返回 null。
 */
export function pointsFromEdgeKey(edge) {
  const points = edge.split("|").map(pointFromKey);
  if (points.length !== 2 || points.some((point) => point.some(Number.isNaN))) return null;
  return points;
}

/**
 * 生成方向无关的边 key。
 *
 * @param {[number, number]} from 边的一个端点。
 * @param {[number, number]} to 边的另一个端点。
 * @returns {string} 排序后的边 key。
 */
export function edgeKey(from, to) {
  const a = keyOf(from[0], from[1]);
  const b = keyOf(to[0], to[1]);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * 判断两个坐标是否指向同一节点。
 *
 * @param {[number, number]} a 坐标 A。
 * @param {[number, number]} b 坐标 B。
 * @returns {boolean} 是否相同。
 */
export function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * 判断两个节点在指定网格中是否相邻。
 *
 * @param {[number, number]} a 坐标 A。
 * @param {[number, number]} b 坐标 B。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {boolean} 是否可通过一条合法边连接。
 */
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

/**
 * 将事件位置对象转换为坐标数组。
 *
 * @param {{ x: number, y: number }} position 位置对象。
 * @returns {[number, number]} 坐标数组。
 */
export function positionToArray(position) {
  return [position.x, position.y];
}

/**
 * 将逻辑网格坐标转换为 SVG 渲染坐标。
 *
 * @param {[number, number]} point 逻辑坐标。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {[number, number]} 渲染坐标。
 */
export function toRenderPoint(point, gridType = "square") {
  if (normalizeGridType(gridType) !== "equilateral-triangle") return point;
  const [q, r] = point;
  return [q + r / 2, r * SQRT3 / 2];
}

/**
 * 将 SVG 渲染坐标反推为逻辑网格坐标。
 *
 * @param {[number, number]} point 渲染坐标。
 * @param {string} [gridType="square"] 网格类型。
 * @returns {[number, number]} 逻辑坐标。
 */
export function fromRenderPoint(point, gridType = "square") {
  if (normalizeGridType(gridType) !== "equilateral-triangle") return point;
  const [x, y] = point;
  const r = y / (SQRT3 / 2);
  return [x - r / 2, r];
}

/**
 * 兼容传入关卡对象或宽高参数的网格配置。
 *
 * @param {object|number} widthOrLevel 关卡配置，或矩形网格宽度。
 * @param {number} [height] 矩形网格高度。
 * @param {string} gridType 网格类型。
 * @returns {object} 标准网格配置。
 */
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

/**
 * 枚举等边三角网格中的全部节点。
 *
 * @param {object} level 关卡或编辑器网格配置。
 * @returns {Array<[number, number]>} 轴坐标节点列表。
 */
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

/**
 * 枚举等边三角网格中的全部边。
 *
 * @param {object} level 关卡或编辑器网格配置。
 * @returns {string[]} 边 key 列表。
 */
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
