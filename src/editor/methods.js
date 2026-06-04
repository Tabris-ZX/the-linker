import { saveLevelFile } from "../services/levels.js";
import { getAllGridEdges, getGridNodes, getGridRadius, isAdjacent, keyOf, normalizeGridType, pointFromKey, pointsFromEdgeKey } from "../utils/geometry.js";
import { clampNumber, omitKey } from "../utils/object.js";

export const creatorMethods = {
    /**
     * 同步编辑器网格边界，并清理越界点、边和答案。
     *
     * @returns {void}
     */
    syncCreatorBounds() {
      this.creatorState.gridType = normalizeGridType(this.creatorState.gridType);
      this.creatorState.width = clampNumber(this.creatorState.width, 2, 12);
      this.creatorState.height = clampNumber(this.creatorState.height, 2, 12);
      this.creatorState.radius = clampNumber(this.creatorState.radius ?? 3, 1, 8);
      const validNodes = new Set(getGridNodes(this.creatorState).map(([x, y]) => keyOf(x, y)));
      this.creatorState.points = Object.fromEntries(
        Object.entries(this.creatorState.points).map(([pairId, points]) => [
          pairId,
          points.filter(([x, y]) => validNodes.has(keyOf(x, y))).slice(0, 2)
        ])
      );
      this.creatorState.removedEdges = this.creatorState.removedEdges.filter((edge) => this.isCreatorEdgeInBounds(edge));
      this.creatorState.answers = Object.fromEntries(
        Object.entries(this.creatorState.answers).filter(([, pairId]) => this.creatorState.pairIds.includes(pairId))
      );
      this.writeLevelTemplate(false);
    },

    /**
     * 同步编辑器点对数量和可用点对 id。
     *
     * @returns {void}
     */
    syncCreatorPairCount() {
      this.creatorPairCount = clampNumber(this.creatorPairCount, 1, 12);
      const pairIds = Object.keys(this.pointDefinitions).slice(0, this.creatorPairCount);
      this.creatorState.pairIds = pairIds;
      if (!pairIds.includes(this.creatorState.activePairId)) {
        this.creatorState.activePairId = pairIds[0];
      }
      this.creatorState.points = Object.fromEntries(
        Object.entries(this.creatorState.points).filter(([pairId]) => pairIds.includes(pairId))
      );
      this.creatorState.answers = Object.fromEntries(
        Object.entries(this.creatorState.answers).filter(([, pairId]) => pairIds.includes(pairId))
      );
      this.setCreatorModeHint();
      this.writeLevelTemplate(false);
    },

    /**
     * 同步并限制编辑器关卡难度。
     *
     * @returns {void}
     */
    syncCreatorDifficulty() {
      this.creatorState.difficulty = clampNumber(this.creatorState.difficulty, 1, 5);
      this.writeLevelTemplate(false);
    },

    /**
     * 同步新建关卡名称，编辑已有关卡时保持原名称。
     *
     * @returns {void}
     */
    syncCreatorName() {
      if (this.creatorEditingLevelId) return;
      this.creatorState.name = String(this.creatorState.name ?? "");
      this.writeLevelTemplate(false);
    },

    /**
     * 处理编辑器中的关卡选择。
     *
     * @param {string} levelId 要编辑的关卡 id。
     * @returns {void}
     */
    handleCreatorLevelSelection(levelId) {
      if (!levelId) {
        this.resetCreatorEditor();
        return;
      }

      const level = this.levels.find((item) => item.id === levelId);
      if (!level) {
        this.previewHint = "未找到要修改的关卡";
        return;
      }

      this.loadCreatorLevel(level);
    },

    /**
     * 重置编辑器为新建关卡状态。
     *
     * @returns {void}
     */
    resetCreatorEditor() {
      const pairIds = Object.keys(this.pointDefinitions).slice(0, clampNumber(this.creatorPairCount, 1, 12));
      this.creatorEditingLevelId = "";
      this.creatorState = {
        name: "",
        gridType: "square",
        difficulty: 1,
        width: 5,
        height: 5,
        radius: 3,
        pairIds,
        activePairId: pairIds[0],
        mode: this.creatorState.mode ?? "mark",
        points: {},
        removedEdges: [],
        answers: {}
      };
      this.creatorPairCount = pairIds.length;
      this.setCreatorModeHint();
      this.writeLevelTemplate(false);
    },

    /**
     * 将已有关卡载入编辑器。
     *
     * @param {object} level 关卡数据。
     * @returns {void}
     */
    loadCreatorLevel(level) {
      const pairIds = level.pairs.map((pair) => pair.id);
      this.creatorEditingLevelId = level.id;
      this.creatorPairCount = pairIds.length;
      this.creatorState = {
        name: level.name ?? "",
        gridType: normalizeGridType(level.gridType ?? "square"),
        difficulty: clampNumber(level.difficulty, 1, 5),
        width: level.width ?? getGridRadius(level) * 2,
        height: level.height ?? getGridRadius(level) * 2,
        radius: getGridRadius(level),
        pairIds,
        activePairId: pairIds[0],
        mode: this.creatorState.mode ?? "mark",
        points: Object.fromEntries(level.pairs.map((pair) => [pair.id, pair.points.map(([x, y]) => [x, y]).slice(0, 2)])),
        removedEdges: [...(level.removedEdges ?? [])],
        answers: Object.fromEntries((level.answers ?? []).map((answer) => {
          if (typeof answer === "string") return [answer, this.inferCreatorAnswerPairId(answer, level) ?? pairIds[0]];
          return [answer.edge, answer.pairId];
        }).filter(([edge, pairId]) => edge && pairIds.includes(pairId)))
      };
      this.setCreatorModeHint();
      this.writeLevelTemplate(false);
      this.previewHint = `正在修改 ${level.id}，名称和 id 将保持不变`;
    },

    /**
     * 根据答案边附近端点推断所属点对。
     *
     * @param {string} edge 答案边 key。
     * @param {object} level 关卡数据。
     * @returns {string} 推断出的点对 id。
     */
    inferCreatorAnswerPairId(edge, level) {
      const points = pointsFromEdgeKey(edge);
      if (!points) return "";
      const endpointKeys = new Map();
      level.pairs.forEach((pair) => {
        pair.points.forEach(([x, y]) => endpointKeys.set(keyOf(x, y), pair.id));
      });

      for (const [x, y] of points) {
        const pairId = endpointKeys.get(keyOf(x, y));
        if (pairId) return pairId;
      }
      return "";
    },

    /**
     * 选择当前编辑的点对。
     *
     * @param {string} pairId 点对 id。
     * @returns {void}
     */
    selectCreatorPair(pairId) {
      this.creatorState.activePairId = pairId;
      this.setCreatorModeHint();
    },

    /**
     * 处理编辑器预览区域点击，切换节点或边状态。
     *
     * @param {MouseEvent} event 鼠标事件。
     * @returns {void}
     */
    handleCreatorPreviewClick(event) {
      const node = event.target.closest("[data-preview-node]");
      if (node) {
        const [x, y] = pointFromKey(node.dataset.previewNode);
        this.toggleCreatorPoint(x, y);
        return;
      }

      const edge = event.target.closest("[data-preview-edge]");
      if (!edge) return;
      this.toggleCreatorEdge(edge.dataset.previewEdge);
    },

    /**
     * 放置或删除编辑器中的端点。
     *
     * @param {number} x 节点横坐标。
     * @param {number} y 节点纵坐标。
     * @returns {void}
     */
    toggleCreatorPoint(x, y) {
      const occupied = this.getCreatorPointAt(x, y);
      if (occupied) {
        const points = this.creatorState.points[occupied.pairId] ?? [];
        this.creatorState.points[occupied.pairId] = points.filter((point) => point[0] !== x || point[1] !== y);
        this.previewHint = `已删除 ${this.getPointLabel(occupied.pairId)} 号点的一个端点`;
        this.writeLevelTemplate(false);
        return;
      }

      const points = [...(this.creatorState.points[this.creatorState.activePairId] ?? [])];
      if (points.length >= 2) points.shift();
      this.creatorState.points[this.creatorState.activePairId] = [...points, [x, y]];
      this.previewHint = `${this.getPointLabel(this.creatorState.activePairId)} 号点已放置 ${Math.min(points.length + 1, 2)}/2`;
      this.writeLevelTemplate(false);
    },

    /**
     * 切换编辑器中的边移除状态或答案标记。
     *
     * @param {string} edge 边 key。
     * @returns {void}
     */
    toggleCreatorEdge(edge) {
      // Edge mode removes travel; mark mode records the puzzle answer.
      if (!this.isCreatorEdgeInBounds(edge)) return;

      if (this.creatorState.mode === "edge") {
        if (this.creatorState.removedEdges.includes(edge)) {
          this.creatorState.removedEdges = this.creatorState.removedEdges.filter((item) => item !== edge);
          this.previewHint = "已恢复这条边";
        } else {
          this.creatorState.removedEdges = [...this.creatorState.removedEdges, edge];
          this.creatorState.answers = omitKey(this.creatorState.answers, edge);
          this.previewHint = "已移除这条边，挑战时无法通行";
        }
        this.writeLevelTemplate(false);
        return;
      }

      if (this.creatorState.removedEdges.includes(edge)) {
        this.previewHint = "被移除的边不能标记为答案线路";
        return;
      }

      if (this.creatorState.answers[edge] === this.creatorState.activePairId) {
        this.creatorState.answers = omitKey(this.creatorState.answers, edge);
        this.previewHint = `已取消 ${this.getPointLabel(this.creatorState.activePairId)} 号线标记`;
      } else {
        this.creatorState.answers = {
          ...this.creatorState.answers,
          [edge]: this.creatorState.activePairId
        };
        this.previewHint = `已标记 ${this.getPointLabel(this.creatorState.activePairId)} 号答案线路`;
      }
      this.writeLevelTemplate(false);
    },

    /**
     * 查找指定节点上已放置的端点。
     *
     * @param {number} x 节点横坐标。
     * @param {number} y 节点纵坐标。
     * @returns {{ pairId: string, index: number }|null} 端点信息。
     */
    getCreatorPointAt(x, y) {
      for (const [pairId, points] of Object.entries(this.creatorState.points)) {
        const index = points.findIndex((point) => point[0] === x && point[1] === y);
        if (index >= 0) return { pairId, index };
      }
      return null;
    },

    /**
     * 判断边是否位于当前编辑器网格范围内。
     *
     * @param {string} edge 边 key。
     * @returns {boolean} 是否是有效边。
     */
    isCreatorEdgeInBounds(edge) {
      const points = pointsFromEdgeKey(edge);
      if (!points) return false;
      const validNodes = new Set(getGridNodes(this.creatorState).map(([x, y]) => keyOf(x, y)));
      return points.every(([x, y]) => validNodes.has(keyOf(x, y)))
        && isAdjacent(points[0], points[1], this.creatorState.gridType);
    },

    /**
     * 根据当前编辑模式刷新操作提示。
     *
     * @returns {void}
     */
    setCreatorModeHint() {
      const label = this.pointDefinitions[this.creatorState.activePairId]?.label ?? "";
      const hints = {
        edge: "移除模式：点击格子边切换禁用，挑战地图中会显示为空白。",
        mark: `标记模式：当前颜色为 ${label} 号，点击格子边标出答案线路。`
      };
      this.previewHint = `点交点可放置或删除色点；${hints[this.creatorState.mode] ?? hints.edge}`;
    },

    /**
     * 将当前编辑器状态写入 JSON 输出。
     *
     * @param {boolean} [showOutput=true] 是否展开输出面板。
     * @returns {void}
     */
    writeLevelTemplate(showOutput = true) {
      this.levelOutput = JSON.stringify(this.buildCreatorLevelTemplate(), null, 2);
      this.isLevelOutputVisible = showOutput;
    },

    /**
     * 构建可保存到 levels 目录的关卡 JSON。
     *
     * @param {string} [id] 关卡 id，默认使用编辑 id 或自动生成 id。
     * @returns {object} 关卡模板。
     */
    buildCreatorLevelTemplate(id = this.creatorEditingLevelId || this.getCreatorDefaultId()) {
      // Build the exact JSON saved into levels/ and used by the challenge screen.
      const editingLevel = this.creatorEditingLevelId ? this.levels.find((level) => level.id === this.creatorEditingLevelId) : null;
      const name = editingLevel?.name ?? (this.creatorState.name.trim() || this.getDefaultCreatorLevelName(id));
      const level = {
        id,
        name,
        difficulty: clampNumber(this.creatorState.difficulty, 1, 5),
        gridType: this.creatorState.gridType,
        pairs: this.creatorState.pairIds.map((pairId) => ({
          id: pairId,
          label: this.pointDefinitions[pairId]?.label ?? pairId,
          color: this.pointDefinitions[pairId]?.color ?? "var(--accent)",
          points: this.getCreatorPairPoints(pairId)
        })),
        removedEdges: [...this.creatorState.removedEdges],
        answers: Object.entries(this.creatorState.answers).map(([edge, pairId]) => ({ edge, pairId }))
      };
      if (this.creatorState.gridType === "equilateral-triangle") {
        level.radius = clampNumber(this.creatorState.radius, 1, 8);
      } else {
        level.width = this.creatorState.width;
        level.height = this.creatorState.height;
      }
      return level;
    },

    /**
     * 根据当前网格类型和尺寸生成默认关卡 id。
     *
     * @returns {string} 默认关卡 id。
     */
    getCreatorDefaultId() {
      return this.creatorState.gridType === "equilateral-triangle"
        ? `custom-r${this.creatorState.radius}-${this.creatorState.pairIds.length}`
        : `custom-${this.creatorState.width}x${this.creatorState.height}-${this.creatorState.pairIds.length}`;
    },

    /**
     * 获取点对端点，必要时从答案线路推导。
     *
     * @param {string} pairId 点对 id。
     * @returns {Array<[number, number]>} 点对端点。
     */
    getCreatorPairPoints(pairId) {
      const placedPoints = this.creatorState.points[pairId] ?? [];
      if (placedPoints.length === 2) return placedPoints;

      const answerPoints = this.getAnswerEndpoints(pairId);
      return answerPoints.length === 2 ? answerPoints : placedPoints;
    },

    /**
     * 根据答案线路中度数为 1 的节点推断端点。
     *
     * @param {string} pairId 点对 id。
     * @returns {Array<[number, number]>} 推断端点。
     */
    getAnswerEndpoints(pairId) {
      const degree = new Map();
      Object.entries(this.creatorState.answers).forEach(([edge, answerPairId]) => {
        if (answerPairId !== pairId) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => {
          const key = keyOf(x, y);
          degree.set(key, (degree.get(key) ?? 0) + 1);
        });
      });

      return [...degree.entries()]
        .filter(([, count]) => count === 1)
        .map(([key]) => pointFromKey(key))
        .slice(0, 2);
    },

    /**
     * 校验并保存当前编辑器关卡。
     *
     * @returns {Promise<void>}
     */
    async saveCreatorLevel() {
      // Persist the generated level through the dev-server file API.
      const validationMessage = this.validateCreatorLevel();
      if (validationMessage) {
        this.previewHint = validationMessage;
        return;
      }

      const template = this.buildCreatorLevelTemplate();
      let savedLevel;
      try {
        savedLevel = await saveLevelFile(template, this.pointDefinitions, {
          mode: this.creatorEditingLevelId ? "update" : "create"
        });
      } catch (error) {
        this.previewHint = error.message;
        return;
      }

      await this.loadLevels();
      const index = this.levels.findIndex((item) => item.id === savedLevel.id);
      this.loadLevel(index >= 0 ? index : this.levels.length - 1);
      this.levelOutput = JSON.stringify(savedLevel, null, 2);
      this.isLevelOutputVisible = true;
      this.previewHint = this.creatorEditingLevelId
        ? `已更新 levels/${savedLevel.id}.json`
        : `已保存到 levels/${savedLevel.id}.json，并加入关卡入口`;
    },

    /**
     * 获取点对的显示标签。
     *
     * @param {string} pairId 点对 id。
     * @returns {string} 显示标签。
     */
    getPointLabel(pairId) {
      return this.pointDefinitions[pairId]?.label ?? pairId;
    },

    /**
     * 根据关卡 id 生成默认关卡名称。
     *
     * @param {string} id 关卡 id。
     * @returns {string} 默认名称。
     */
    getDefaultCreatorLevelName(id) {
      return id.startsWith("level-") ? `Level ${id.slice(6)}` : "Custom Level";
    },

    /**
     * 校验当前编辑器关卡是否满足保存规则。
     *
     * @returns {string} 校验失败提示；通过时为空字符串。
     */
    validateCreatorLevel() {
      const endpointEntries = this.creatorState.pairIds.map((pairId) => [pairId, this.getCreatorPairPoints(pairId)]);
      const incompletePair = endpointEntries.find(([, points]) => points.length !== 2);
      if (incompletePair) {
        return `请先给 ${this.getPointLabel(incompletePair[0])} 号点放满两个端点`;
      }

      const removedEdges = new Set(this.creatorState.removedEdges);
      const pairGraphs = new Map();
      const degree = new Map();
      const usedEdges = Object.keys(this.creatorState.answers);
      const openNodeKeys = new Set();
      const endpointKeys = new Set();

      if (usedEdges.length === 0) {
        return "请先标记答案线路";
      }

      getAllGridEdges(this.creatorState).forEach((edge) => {
        if (removedEdges.has(edge)) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => openNodeKeys.add(keyOf(x, y)));
      });

      for (const edge of usedEdges) {
        if (!this.isCreatorEdgeInBounds(edge)) return `答案线路 ${edge} 不在当前地图范围内`;
        if (removedEdges.has(edge)) return `答案线路 ${edge} 已被移除，不能保存`;

        const points = pointsFromEdgeKey(edge);
        if (!points) return `答案线路 ${edge} 格式无效`;

        const [from, to] = points.map(([x, y]) => keyOf(x, y));
        const pairId = this.creatorState.answers[edge];
        if (!this.creatorState.pairIds.includes(pairId)) return `答案线路 ${edge} 使用了无效点对`;
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

      for (const [x, y] of getGridNodes(this.creatorState)) {
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
        if (!pairGraph.has(start) || !pairGraph.has(end)) return `${this.getPointLabel(pairId)} 号点没有接入答案线路`;
        if (!this.areCreatorNodesConnected(start, end, pairGraph)) {
          return `${this.getPointLabel(pairId)} 号点的两个端点没有连通`;
        }
      }

      return "";
    },

    /**
     * 判断答案图中两个节点是否连通。
     *
     * @param {string} start 起始节点 key。
     * @param {string} end 目标节点 key。
     * @param {Map<string, Set<string>>} graph 邻接表。
     * @returns {boolean} 是否连通。
     */
    areCreatorNodesConnected(start, end, graph) {
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
};
