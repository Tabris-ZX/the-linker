import { edgeKey, getAllGridEdges, getGridNodes, isAdjacent, keyOf, pointsFromEdgeKey } from "../utils/geometry.js";

/**
 * 判断玩家当前路径是否覆盖所有可通行节点。
 *
 * 挑战模式接受任意有效解，不强制匹配关卡里保存的隐藏答案线路。
 *
 * @param {object} level 关卡数据。
 * @param {Record<string, Array<[number, number]>>} paths 玩家绘制路径。
 * @returns {boolean} 是否满足答案覆盖规则。
 */
export function isLevelAnswerFilled(level, paths) {
  const filledNodes = getFilledNodes(paths);
  return getRequiredNodes(level).every((node) => filledNodes.has(node));
}

/**
 * 判断所有路径是否满足基础结构规则。
 *
 * @param {object} level 关卡数据。
 * @param {Record<string, Array<[number, number]>>} paths 玩家绘制路径。
 * @param {Record<string, string>} endpoints 节点到点对 id 的映射。
 * @returns {boolean} 是否结构有效。
 */
export function areAllPathsStructurallyValid(level, paths, endpoints) {
  return areAllNodesExclusive(paths)
    && Object.entries(paths).every(([pairId, path]) => isPathStructurallyValid(level, pairId, path, endpoints));
}

/**
 * 判断所有路径节点是否只被一个点对占用。
 *
 * @param {Record<string, Array<[number, number]>>} paths 玩家绘制路径。
 * @returns {boolean} 是否互斥。
 */
export function areAllNodesExclusive(paths) {
  const nodes = new Map();
  for (const [pairId, path] of Object.entries(paths)) {
    for (const point of path) {
      const nodeKey = keyOf(point[0], point[1]);
      const occupant = nodes.get(nodeKey);
      if (occupant && occupant !== pairId) return false;
      nodes.set(nodeKey, pairId);
    }
  }
  return true;
}

/**
 * 判断单条路径是否满足不自交、邻接、可通行和端点度数规则。
 *
 * @param {object} level 关卡数据。
 * @param {string} pairId 点对 id。
 * @param {Array<[number, number]>} path 路径坐标。
 * @param {Record<string, string>} endpoints 节点到点对 id 的映射。
 * @returns {boolean} 路径结构是否有效。
 */
export function isPathStructurallyValid(level, pairId, path, endpoints) {
  const seen = new Set();
  const availableEdges = new Set(getAllGridEdges(level));
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    const nodeKey = keyOf(point[0], point[1]);
    if (seen.has(nodeKey)) return false;
    seen.add(nodeKey);

    const neighbors = [path[index - 1], path[index + 1]].filter(Boolean);
    if (neighbors.some((neighbor) => !isAdjacent(point, neighbor, level.gridType))) return false;
    if (neighbors.some((neighbor) => !availableEdges.has(edgeKey(point, neighbor)))) return false;

    const isEndpoint = endpoints[nodeKey] === pairId;
    if (isEndpoint && neighbors.length > 1) return false;
    if (!isEndpoint && neighbors.length > 2) return false;
  }
  return true;
}

/**
 * 获取关卡要求覆盖的答案边。
 *
 * @param {object} level 关卡数据。
 * @returns {Set<string>} 答案边集合。
 */
export function getAnswerEdges(level) {
  const edges = new Set();
  (level.answers ?? []).forEach((answer) => {
    if (answer?.edge) edges.add(answer.edge);
  });
  return edges;
}

/**
 * 获取路径已经占用的节点。
 *
 * @param {Record<string, Array<[number, number]>>} paths 玩家绘制路径。
 * @returns {Set<string>} 已占用节点集合。
 */
export function getFilledNodes(paths) {
  const nodes = new Set();
  Object.values(paths).forEach((path) => {
    path.forEach(([x, y]) => nodes.add(keyOf(x, y)));
  });
  return nodes;
}

/**
 * 获取没有被完全移除的必需节点。
 *
 * @param {object} level 关卡数据。
 * @returns {string[]} 必需节点 key 列表。
 */
export function getRequiredNodes(level) {
  const removedEdges = new Set(level.removedEdges ?? []);
  const nodesWithOpenEdge = new Set();
  getAllGridEdges(level).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    points.forEach(([x, y]) => nodesWithOpenEdge.add(keyOf(x, y)));
  });
  return [...nodesWithOpenEdge];
}

/**
 * 校验编辑器中标记的答案线路是否能保存为关卡。
 *
 * @param {object} editorState 编辑器状态。
 * @param {(pairId: string) => Array<[number, number]>} getPairPoints 获取点对端点的方法。
 * @param {(pairId: string) => string} getPointLabel 获取点对显示标签的方法。
 * @returns {string} 校验失败提示；通过时为空字符串。
 */
export function validateEditorLevelAnswer(editorState, getPairPoints, getPointLabel) {
  const endpointEntries = editorState.pairIds.map((pairId) => [pairId, getPairPoints(pairId)]);
  const incompletePair = endpointEntries.find(([, points]) => points.length !== 2);
  if (incompletePair) {
    return `请先给 ${getPointLabel(incompletePair[0])} 号点放满两个端点`;
  }

  const removedEdges = new Set(editorState.removedEdges);
  const pairGraphs = new Map();
  const degree = new Map();
  const usedEdges = Object.keys(editorState.answers);
  const openNodeKeys = new Set();
  const endpointKeys = new Set();

  if (usedEdges.length === 0) {
    return "请先标记答案线路";
  }

  getAllGridEdges(editorState).forEach((edge) => {
    if (removedEdges.has(edge)) return;
    const points = pointsFromEdgeKey(edge);
    if (!points) return;
    points.forEach(([x, y]) => openNodeKeys.add(keyOf(x, y)));
  });

  for (const edge of usedEdges) {
    if (!isEditorEdgeInBounds(editorState, edge)) return `答案线路 ${edge} 不在当前地图范围内`;
    if (removedEdges.has(edge)) return `答案线路 ${edge} 已被移除，不能保存`;

    const points = pointsFromEdgeKey(edge);
    if (!points) return `答案线路 ${edge} 格式无效`;

    const [from, to] = points.map(([x, y]) => keyOf(x, y));
    const pairId = editorState.answers[edge];
    if (!editorState.pairIds.includes(pairId)) return `答案线路 ${edge} 使用了无效点对`;
    if (!pairGraphs.has(pairId)) pairGraphs.set(pairId, new Map());
    const pairGraph = pairGraphs.get(pairId);
    if (!pairGraph.has(from)) pairGraph.set(from, new Set());
    if (!pairGraph.has(to)) pairGraph.set(to, new Set());
    pairGraph.get(from).add(to);
    pairGraph.get(to).add(from);

    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
  }

  for (const [, points] of endpointEntries) {
    points.forEach(([x, y]) => endpointKeys.add(keyOf(x, y)));
  }

  for (const [x, y] of getGridNodes(editorState)) {
    const nodeKey = keyOf(x, y);
    const nodeDegree = degree.get(nodeKey) ?? 0;
    if (endpointKeys.has(nodeKey)) continue;
    if (!openNodeKeys.has(nodeKey)) {
      if (nodeDegree !== 0) return `节点 ${x},${y} 周围边已全部移除，不能接入答案线路`;
      continue;
    }
    if (nodeDegree !== 2) return `节点 ${x},${y} 需要连接两条答案线路，或移除周围所有边`;
  }

  for (const [pairId, points] of endpointEntries) {
    const [start, end] = points.map(([x, y]) => keyOf(x, y));
    const pairGraph = pairGraphs.get(pairId) ?? new Map();
    if (!pairGraph.has(start) || !pairGraph.has(end)) return `${getPointLabel(pairId)} 号点没有接入答案线路`;
    if (!areNodesConnected(start, end, pairGraph)) {
      return `${getPointLabel(pairId)} 号点的两个端点没有连通`;
    }
  }

  return "";
}

/**
 * 判断编辑器边是否位于当前网格范围内。
 *
 * @param {object} editorState 编辑器状态。
 * @param {string} edge 边 key。
 * @returns {boolean} 是否是有效边。
 */
export function isEditorEdgeInBounds(editorState, edge) {
  const points = pointsFromEdgeKey(edge);
  if (!points) return false;
  const validNodes = new Set(getGridNodes(editorState).map(([x, y]) => keyOf(x, y)));
  return points.every(([x, y]) => validNodes.has(keyOf(x, y)))
    && isAdjacent(points[0], points[1], editorState.gridType);
}

/**
 * 判断图中两个节点是否连通。
 *
 * @param {string} start 起始节点 key。
 * @param {string} end 目标节点 key。
 * @param {Map<string, Set<string>>} graph 邻接表。
 * @returns {boolean} 是否连通。
 */
export function areNodesConnected(start, end, graph) {
  const queue = [start];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === end) return true;
    for (const next of graph.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}
