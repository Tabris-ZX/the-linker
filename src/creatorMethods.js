import { saveLevelFile } from "./services/levels.js";
import { isAdjacent, keyOf, pointFromKey, pointsFromEdgeKey } from "./utils/geometry.js";
import { clampNumber, omitKey } from "./utils/object.js";

export const creatorMethods = {
    syncCreatorBounds() {
      // Keep editor data valid when the user changes board width/height.
      this.creatorState.width = clampNumber(this.creatorState.width, 3, 12);
      this.creatorState.height = clampNumber(this.creatorState.height, 3, 12);
      this.creatorState.points = Object.fromEntries(
        Object.entries(this.creatorState.points).map(([pairId, points]) => [
          pairId,
          points.filter(([x, y]) => x <= this.creatorState.width && y <= this.creatorState.height).slice(0, 2)
        ])
      );
      this.creatorState.removedEdges = this.creatorState.removedEdges.filter((edge) => this.isCreatorEdgeInBounds(edge));
      this.creatorState.answers = Object.fromEntries(
        Object.entries(this.creatorState.answers).filter(([, pairId]) => this.creatorState.pairIds.includes(pairId))
      );
      this.writeLevelTemplate(false);
    },

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

    syncCreatorDifficulty() {
      this.creatorState.difficulty = clampNumber(this.creatorState.difficulty, 1, 5);
      this.writeLevelTemplate(false);
    },

    selectCreatorPair(pairId) {
      this.creatorState.activePairId = pairId;
      this.setCreatorModeHint();
    },

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

    toggleCreatorPoint(x, y) {
      const occupied = this.getCreatorPointAt(x, y);
      if (occupied) {
        const points = this.creatorState.points[occupied.pairId] ?? [];
        this.creatorState.points[occupied.pairId] = points.filter((point) => point[0] !== x || point[1] !== y);
        this.previewHint = `已删除 ${this.pointDefinitions[occupied.pairId].label} 号点的一个端点`;
        this.writeLevelTemplate(false);
        return;
      }

      const points = [...(this.creatorState.points[this.creatorState.activePairId] ?? [])];
      if (points.length >= 2) points.shift();
      this.creatorState.points[this.creatorState.activePairId] = [...points, [x, y]];
      this.previewHint = `${this.pointDefinitions[this.creatorState.activePairId].label} 号点已放置 ${Math.min(points.length + 1, 2)}/2`;
      this.writeLevelTemplate(false);
    },

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
        this.previewHint = `已取消 ${this.pointDefinitions[this.creatorState.activePairId].label} 号线标记`;
      } else {
        this.creatorState.answers = {
          ...this.creatorState.answers,
          [edge]: this.creatorState.activePairId
        };
        this.previewHint = `已标记 ${this.pointDefinitions[this.creatorState.activePairId].label} 号答案线路`;
      }
      this.writeLevelTemplate(false);
    },

    getCreatorPointAt(x, y) {
      for (const [pairId, points] of Object.entries(this.creatorState.points)) {
        const index = points.findIndex((point) => point[0] === x && point[1] === y);
        if (index >= 0) return { pairId, index };
      }
      return null;
    },

    isCreatorEdgeInBounds(edge) {
      const points = pointsFromEdgeKey(edge);
      if (!points) return false;
      return points.every(([x, y]) => x >= 0 && y >= 0 && x <= this.creatorState.width && y <= this.creatorState.height) && isAdjacent(points[0], points[1]);
    },

    setCreatorModeHint() {
      const label = this.pointDefinitions[this.creatorState.activePairId]?.label ?? "";
      const hints = {
        edge: "移除模式：点击格子边切换禁用，挑战地图中会显示为空白。",
        mark: `标记模式：当前颜色为 ${label} 号，点击格子边标出答案线路。`
      };
      this.previewHint = `点交点可放置或删除色点；${hints[this.creatorState.mode] ?? hints.edge}`;
    },

    writeLevelTemplate(showOutput = true) {
      this.levelOutput = JSON.stringify(this.buildCreatorLevelTemplate(), null, 2);
      this.isLevelOutputVisible = showOutput;
    },

    buildCreatorLevelTemplate(id = `custom-${this.creatorState.width}x${this.creatorState.height}-${this.creatorState.pairIds.length}`) {
      // Build the exact JSON saved into levels/ and used by the challenge screen.
      return {
        id,
        name: id.startsWith("level-") ? `Level ${id.slice(6)}` : "Custom Level",
        difficulty: clampNumber(this.creatorState.difficulty, 1, 5),
        gridType: this.creatorState.gridType,
        width: this.creatorState.width,
        height: this.creatorState.height,
        pairs: this.creatorState.pairIds.map((pairId) => ({
          id: pairId,
          label: this.pointDefinitions[pairId].label,
          color: this.pointDefinitions[pairId].color,
          points: this.getCreatorPairPoints(pairId)
        })),
        removedEdges: [...this.creatorState.removedEdges],
        answers: Object.entries(this.creatorState.answers).map(([edge, pairId]) => ({ edge, pairId }))
      };
    },

    getCreatorPairPoints(pairId) {
      const placedPoints = this.creatorState.points[pairId] ?? [];
      if (placedPoints.length === 2) return placedPoints;

      const answerPoints = this.getAnswerEndpoints(pairId);
      return answerPoints.length === 2 ? answerPoints : placedPoints;
    },

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

    async saveCreatorLevel() {
      // Persist the generated level through the dev-server file API.
      const incompletePair = this.creatorState.pairIds.find((pairId) => this.getCreatorPairPoints(pairId).length !== 2);
      if (incompletePair) {
        this.previewHint = `请先给 ${this.pointDefinitions[incompletePair].label} 号点放满两个端点`;
        return;
      }

      const template = this.buildCreatorLevelTemplate();
      const savedLevel = await saveLevelFile(template);

      await this.loadLevels();
      const index = this.levels.findIndex((item) => item.id === savedLevel.id);
      this.loadLevel(index >= 0 ? index : this.levels.length - 1);
      this.levelOutput = JSON.stringify(savedLevel, null, 2);
      this.isLevelOutputVisible = true;
      this.previewHint = `已保存到 levels/${savedLevel.id}.json，并加入关卡入口`;
    }
};

