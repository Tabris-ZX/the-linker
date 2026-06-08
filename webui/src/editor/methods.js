import { isEditorEdgeInBounds, validateEditorLevelAnswer } from "./checker.js";
import { saveLevelFile } from "../services/levels.js";
import { getGridNodes, getGridRadius, keyOf, normalizeGridType, pointFromKey, pointsFromEdgeKey } from "../utils/geometry.js";
import { clampNumber, omitKey } from "../utils/object.js";

export const editorMethods = {
    /**
     * 用鼠标滚轮调整编辑器数字输入。
     *
     * @param {WheelEvent} event 滚轮事件。
     * @param {"width"|"height"|"radius"|"pairCount"|"difficulty"} field 字段名。
     * @param {Function} sync 同步方法。
     * @returns {void}
     */
    handleEditorNumberWheel(event, field, sync) {
      const input = event?.currentTarget;
      const step = Number(input?.step || 1) || 1;
      const direction = event.deltaY > 0 ? -1 : 1;
      const min = Number(input?.min ?? -Infinity);
      const max = Number(input?.max ?? Infinity);
      const readValue = () => {
        if (field === "pairCount") return this.editorPairCount;
        return this.editorState[field];
      };
      const writeValue = (value) => {
        if (field === "pairCount") {
          this.editorPairCount = value;
          return;
        }
        this.editorState[field] = value;
      };

      const currentValue = Number(readValue());
      const fallback = Number.isFinite(min) ? min : 0;
      const nextValue = clampNumber((Number.isFinite(currentValue) ? currentValue : fallback) + direction * step, min, max);
      writeValue(nextValue);
      if (typeof sync === "function") sync();
    },

    /**
     * 同步编辑器网格边界，并清理越界点、边和答案。
     *
     * @returns {void}
     */
    syncEditorBounds() {
      this.editorState.gridType = normalizeGridType(this.editorState.gridType);
      this.editorState.width = clampNumber(this.editorState.width, 2, 10);
      this.editorState.height = clampNumber(this.editorState.height, 2, 10);
      this.editorState.radius = clampNumber(this.editorState.radius ?? 3, 1, 6);
      const validNodes = new Set(getGridNodes(this.editorState).map(([x, y]) => keyOf(x, y)));
      this.editorState.points = Object.fromEntries(
        Object.entries(this.editorState.points).map(([pairId, points]) => [
          pairId,
          points.filter(([x, y]) => validNodes.has(keyOf(x, y))).slice(0, 2)
        ])
      );
      this.editorState.removedEdges = this.editorState.removedEdges.filter((edge) => this.isEditorEdgeInBounds(edge));
      this.editorState.answers = Object.fromEntries(
        Object.entries(this.editorState.answers).filter(([, pairId]) => this.editorState.pairIds.includes(pairId))
      );
      this.writeLevelTemplate(false);
    },

    /**
     * 同步编辑器点对数量和可用点对 id。
     *
     * @returns {void}
     */
    syncEditorPairCount() {
      const pairLimit = this.getEditorPairLimit();
      this.editorPairCount = clampNumber(this.editorPairCount, 1, pairLimit);
      const pairIds = this.getEditorPairIds(this.editorPairCount);
      this.editorState.pairIds = pairIds;
      if (!pairIds.includes(this.editorState.activePairId)) {
        this.editorState.activePairId = pairIds[0];
      }
      this.editorState.points = Object.fromEntries(
        Object.entries(this.editorState.points).filter(([pairId]) => pairIds.includes(pairId))
      );
      this.editorState.answers = Object.fromEntries(
        Object.entries(this.editorState.answers).filter(([, pairId]) => pairIds.includes(pairId))
      );
      this.setEditorModeHint();
      this.writeLevelTemplate(false);
    },

    /**
     * 同步并限制编辑器关卡难度。
     *
     * @returns {void}
     */
    syncEditorDifficulty() {
      this.editorState.difficulty = clampNumber(this.editorState.difficulty, 1, 5);
      this.writeLevelTemplate(false);
    },

    /**
     * 同步新建关卡名称，编辑已有关卡时保持原名称。
     *
     * @returns {void}
     */
    syncEditorName() {
      if (this.editorEditingLevelId) return;
      this.editorState.name = String(this.editorState.name ?? "");
      this.writeLevelTemplate(false);
    },

    /**
     * 处理编辑器中的关卡选择。
     *
     * @param {string} levelId 要编辑的关卡 id。
     * @returns {Promise<void>}
     */
    async handleEditorLevelSelection(levelId) {
      if (!this.isDeveloperMode) {
        this.previewHint = "游客只能新建关卡并生成 JSON 投稿";
        return;
      }
      if (!levelId) {
        this.resetEditorEditor();
        return;
      }

      const index = this.levels.findIndex((item) => this.getLevelCacheKey(item) === levelId || item?.id === levelId);
      const level = index >= 0 ? await this.ensureLevelDetail(index) : null;
      if (!level) {
        this.previewHint = "未找到要修改的关卡";
        return;
      }

      this.loadEditorLevel(level);
    },

    /**
     * 获取编辑器当前可用点对上限。
     *
     * @returns {number} 可用点对上限。
     */
    getEditorPairLimit() {
      const configuredLimit = Number(this.editorPairLimit ?? 16);
      const definitionCount = Object.keys(this.pointDefinitions).length;
      return Math.max(1, Math.min(Number.isFinite(configuredLimit) ? configuredLimit : 16, definitionCount || 1));
    },

    /**
     * 按当前颜色配置和已有点对顺序生成编辑器点对 id。
     *
     * @param {number} count 点对数量。
     * @returns {string[]} 点对 id 列表。
     */
    getEditorPairIds(count) {
      const definitionIds = Object.keys(this.pointDefinitions);
      const existingIds = this.editorState.pairIds.filter((pairId) => definitionIds.includes(pairId));
      return [...new Set([...existingIds, ...definitionIds])].slice(0, count);
    },

    /**
     * 重置编辑器为新建关卡状态。
     *
     * @returns {void}
     */
    resetEditorEditor() {
      const pairIds = this.getEditorPairIds(clampNumber(this.editorPairCount, 1, this.getEditorPairLimit()));
      this.editorEditingLevelId = "";
      this.editorState = {
        name: "",
        gridType: "square",
        difficulty: 1,
        width: 5,
        height: 5,
        radius: 3,
        pairIds,
        activePairId: pairIds[0],
        mode: this.editorState.mode ?? "mark",
        points: {},
        removedEdges: [],
        answers: {}
      };
      this.editorPairCount = pairIds.length;
      this.setEditorModeHint();
      this.writeLevelTemplate(false);
    },

    /**
     * 将已有关卡载入编辑器。
     *
     * @param {object} level 关卡数据。
     * @returns {void}
     */
    loadEditorLevel(level) {
      const pairIds = level.pairs.map((pair) => pair.id);
      this.editorEditingLevelId = this.getLevelCacheKey(level);
      this.editorPairCount = pairIds.length;
      this.editorState = {
        name: level.name ?? "",
        gridType: normalizeGridType(level.gridType ?? "square"),
        difficulty: clampNumber(level.difficulty, 1, 5),
        width: level.width ?? getGridRadius(level) * 2,
        height: level.height ?? getGridRadius(level) * 2,
        radius: getGridRadius(level),
        pairIds,
        activePairId: pairIds[0],
        mode: this.editorState.mode ?? "mark",
        points: Object.fromEntries(level.pairs.map((pair) => [pair.id, pair.points.map(([x, y]) => [x, y]).slice(0, 2)])),
        removedEdges: [...(level.removedEdges ?? [])],
        answers: Object.fromEntries((level.answers ?? []).map((answer) => {
          if (typeof answer === "string") return [answer, this.inferEditorAnswerPairId(answer, level) ?? pairIds[0]];
          return [answer.edge, answer.pairId];
        }).filter(([edge, pairId]) => edge && pairIds.includes(pairId)))
      };
      this.setEditorModeHint();
      this.writeLevelTemplate(false);
      this.previewHint = `正在修改 ${level.id}，名称和 id 将保持不变`;
    },

    /**
     * 从本地 JSON 文件导入别人制作的地图设计。
     *
     * @param {Event} event 文件选择事件。
     * @returns {Promise<void>}
     */
    async importEditorLevelJson(event) {
      const input = event?.target;
      const file = input?.files?.[0];
      if (!file) return;

      try {
        this.loadImportedEditorLevel(JSON.parse(await file.text()));
      } catch (error) {
        this.previewHint = error.message || "JSON 导入失败";
      } finally {
        if (input) input.value = "";
      }
    },

    /**
     * 将导入的关卡 JSON 作为新关卡载入编辑器。
     *
     * @param {object} level 导入的关卡对象。
     * @returns {void}
     */
    loadImportedEditorLevel(level) {
      if (!level || typeof level !== "object" || !Array.isArray(level.pairs)) {
        throw new Error("导入失败：JSON 必须包含 pairs 数组");
      }

      const invalidPair = level.pairs.find((pair) => !pair?.id || !Array.isArray(pair.points));
      if (invalidPair) {
        throw new Error("导入失败：每个点对都需要 id 和 points 数组");
      }

      const pairIds = level.pairs.map((pair) => String(pair.id ?? "")).filter(Boolean);
      if (pairIds.length === 0) {
        throw new Error("导入失败：至少需要一个点对");
      }
      if (pairIds.length > this.getEditorPairLimit()) {
        throw new Error(`导入失败：最多支持 ${this.getEditorPairLimit()} 组点对`);
      }

      this.loadEditorLevel({
        ...level,
        id: "",
        name: String(level.name ?? ""),
        pairs: level.pairs.map((pair) => ({
          ...pair,
          id: String(pair.id),
          points: Array.isArray(pair.points) ? pair.points : []
        }))
      });
      this.editorEditingLevelId = "";
      this.editorState.name = String(level.name ?? "");
      this.syncEditorBounds();
      this.writeLevelTemplate(false);
      this.previewHint = `已导入 ${level.name || level.id || "JSON"}，将作为新关卡保存`;
    },

    /**
     * 根据答案边附近端点推断所属点对。
     *
     * @param {string} edge 答案边 key。
     * @param {object} level 关卡数据。
     * @returns {string} 推断出的点对 id。
     */
    inferEditorAnswerPairId(edge, level) {
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
    selectEditorPair(pairId) {
      this.editorState.activePairId = pairId;
      this.setEditorModeHint();
    },

    /**
     * 清空当前编辑器中的所有点位、禁用边和答案线路。
     *
     * @returns {void}
     */
    clearEditorLayout() {
      this.editorState.points = {};
      this.editorState.removedEdges = [];
      this.editorState.answers = {};
      this.previewHint = "已清空当前所有点位和连线";
      this.writeLevelTemplate(false);
    },

    /**
     * 处理编辑器预览区域点击，切换节点或边状态。
     *
     * @param {MouseEvent} event 鼠标事件。
     * @returns {void}
     */
    handleEditorPreviewClick(event) {
      const node = event.target.closest("[data-preview-node]");
      if (node) {
        const [x, y] = pointFromKey(node.dataset.previewNode);
        this.toggleEditorPoint(x, y);
        return;
      }

      const edge = event.target.closest("[data-preview-edge]");
      if (!edge) return;
      this.toggleEditorEdge(edge.dataset.previewEdge);
    },

    /**
     * 放置或删除编辑器中的端点。
     *
     * @param {number} x 节点横坐标。
     * @param {number} y 节点纵坐标。
     * @returns {void}
     */
    toggleEditorPoint(x, y) {
      const occupied = this.getEditorPointAt(x, y);
      if (occupied) {
        const points = this.editorState.points[occupied.pairId] ?? [];
        this.editorState.points[occupied.pairId] = points.filter((point) => point[0] !== x || point[1] !== y);
        this.previewHint = `已删除 ${this.getPointLabel(occupied.pairId)} 号点的一个端点`;
        this.writeLevelTemplate(false);
        return;
      }

      const points = [...(this.editorState.points[this.editorState.activePairId] ?? [])];
      if (points.length >= 2) points.shift();
      this.editorState.points[this.editorState.activePairId] = [...points, [x, y]];
      this.previewHint = `${this.getPointLabel(this.editorState.activePairId)} 号点已放置 ${Math.min(points.length + 1, 2)}/2`;
      this.writeLevelTemplate(false);
    },

    /**
     * 切换编辑器中的边移除状态或答案标记。
     *
     * @param {string} edge 边 key。
     * @returns {void}
     */
    toggleEditorEdge(edge) {
      // Edge mode removes travel; mark mode records the puzzle answer.
      if (!this.isEditorEdgeInBounds(edge)) return;

      if (this.editorState.mode === "edge") {
        if (this.editorState.removedEdges.includes(edge)) {
          this.editorState.removedEdges = this.editorState.removedEdges.filter((item) => item !== edge);
          this.previewHint = "已恢复这条边";
        } else {
          this.editorState.removedEdges = [...this.editorState.removedEdges, edge];
          this.editorState.answers = omitKey(this.editorState.answers, edge);
          this.previewHint = "已移除这条边，挑战时无法通行";
        }
        this.writeLevelTemplate(false);
        return;
      }

      if (this.editorState.removedEdges.includes(edge)) {
        this.previewHint = "被移除的边不能标记为答案线路";
        return;
      }

      if (this.editorState.answers[edge] === this.editorState.activePairId) {
        this.editorState.answers = omitKey(this.editorState.answers, edge);
        this.previewHint = `已取消 ${this.getPointLabel(this.editorState.activePairId)} 号线标记`;
      } else {
        this.editorState.answers = {
          ...this.editorState.answers,
          [edge]: this.editorState.activePairId
        };
        this.previewHint = `已标记 ${this.getPointLabel(this.editorState.activePairId)} 号答案线路`;
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
    getEditorPointAt(x, y) {
      for (const [pairId, points] of Object.entries(this.editorState.points)) {
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
    isEditorEdgeInBounds(edge) {
      return isEditorEdgeInBounds(this.editorState, edge);
    },

    /**
     * 根据当前编辑模式刷新操作提示。
     *
     * @returns {void}
     */
    setEditorModeHint() {
      const label = this.pointDefinitions[this.editorState.activePairId]?.label ?? "";
      const hints = {
        edge: "移除模式：点击格子边切换禁用，挑战地图中会显示为空白。",
        mark: `标记模式：当前颜色为 ${label} 号，点击格子边标出答案线路。`
      };
      this.previewHint = `点交点可放置或删除色点；${hints[this.editorState.mode] ?? hints.edge}`;
    },

    /**
     * 将当前编辑器状态写入 JSON 输出。
     *
     * @param {boolean} [showOutput=true] 是否展开输出面板。
     * @returns {void}
     */
    writeLevelTemplate(showOutput = true) {
      this.levelOutput = JSON.stringify(this.buildEditorLevelTemplate(), null, 2);
      this.isLevelOutputVisible = showOutput;
      if (showOutput && !this.isDeveloperMode) {
        this.openSubmissionNoticeDialog();
      }
    },

    /**
     * 复制当前编辑器生成的关卡 JSON。
     *
     * @returns {Promise<void>}
     */
    async copyEditorLevelOutput() {
      if (!this.levelOutput) {
        this.writeLevelTemplate(true);
      }

      try {
        await this.copyTextToClipboard(this.levelOutput);
        this.previewHint = "已复制生成的 JSON";
        if (!this.isDeveloperMode) {
          this.openSubmissionNoticeDialog();
        }
      } catch {
        this.previewHint = "复制失败，请手动选择文本复制";
      }
    },

    /**
     * 构建可保存到 levels 目录的关卡 JSON。
     *
     * @param {string} [id] 关卡 id，默认使用编辑 id 或自动生成 id。
     * @returns {object} 关卡模板。
     */
    buildEditorLevelTemplate(id = "") {
      // Build the exact JSON saved into levels/ and used by the play screen.
      const editingLevel = this.editorEditingLevelId ? this.levels.find((level) => this.getLevelCacheKey(level) === this.editorEditingLevelId) : null;
      const levelId = id || editingLevel?.id || this.getEditorDefaultId();
      const name = editingLevel?.name ?? (this.editorState.name.trim() || this.getDefaultEditorLevelName(levelId));
      const level = {
        id: levelId,
        name,
        difficulty: clampNumber(this.editorState.difficulty, 1, 5),
        gridType: this.editorState.gridType,
        pairs: this.editorState.pairIds.map((pairId) => ({
          id: pairId,
          label: this.pointDefinitions[pairId]?.label ?? pairId,
          color: this.pointDefinitions[pairId]?.color ?? "var(--accent)",
          points: this.getEditorPairPoints(pairId)
        })),
        removedEdges: [...this.editorState.removedEdges],
        answers: Object.entries(this.editorState.answers).map(([edge, pairId]) => ({ edge, pairId }))
      };
      if (this.editorState.gridType === "equilateral-triangle") {
        level.radius = clampNumber(this.editorState.radius, 1, 6);
      } else {
        level.width = clampNumber(this.editorState.width, 2, 10);
        level.height = clampNumber(this.editorState.height, 2, 10);
      }
      return level;
    },

    /**
     * 根据当前网格类型和尺寸生成默认关卡 id。
     *
     * @returns {string} 默认关卡 id。
     */
    getEditorDefaultId() {
      return this.editorState.gridType === "equilateral-triangle"
        ? `custom-r${this.editorState.radius}-${this.editorState.pairIds.length}`
        : `custom-${this.editorState.width}x${this.editorState.height}-${this.editorState.pairIds.length}`;
    },

    /**
     * 获取点对端点，必要时从答案线路推导。
     *
     * @param {string} pairId 点对 id。
     * @returns {Array<[number, number]>} 点对端点。
     */
    getEditorPairPoints(pairId) {
      const placedPoints = this.editorState.points[pairId] ?? [];
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
      Object.entries(this.editorState.answers).forEach(([edge, answerPairId]) => {
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
    async saveEditorLevel() {
      if (!this.isDeveloperMode) {
        this.writeLevelTemplate(true);
        this.previewHint = "游客不能直接保存关卡，请复制 JSON 后通过 GitHub issue 投稿";
        return;
      }
      // Persist the generated level through the dev-server file API.
      const validationMessage = this.validateEditorLevel();
      if (validationMessage) {
        this.previewHint = validationMessage;
        return;
      }

      const template = this.buildEditorLevelTemplate();
      let savedLevel;
      try {
        savedLevel = await saveLevelFile(template, this.pointDefinitions, {
          mode: this.editorEditingLevelId ? "update" : "create"
        });
      } catch (error) {
        this.previewHint = error.message;
        return;
      }

      await this.loadLevels();
      const savedKey = this.getLevelCacheKey(savedLevel);
      const index = this.levels.findIndex((item) => this.getLevelCacheKey(item) === savedKey);
      await this.loadLevel(index >= 0 ? index : this.getInitialLevelIndex());
      if (savedLevel.sourceCategory === "tests") {
        this.levelCategoryFilter = "tests";
      }
      this.levelOutput = JSON.stringify(savedLevel, null, 2);
      this.isLevelOutputVisible = true;
      this.previewHint = this.editorEditingLevelId
        ? `已更新 levels/${savedLevel.id}.json`
        : `已保存到 levels/tests/${savedLevel.id}.json，并加入测试版`;
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
    getDefaultEditorLevelName(id) {
      return id.startsWith("level-") ? `Level ${id.slice(6)}` : "Custom Level";
    },

    /**
     * 校验当前编辑器关卡是否满足保存规则。
     *
     * @returns {string} 校验失败提示；通过时为空字符串。
     */
    validateEditorLevel() {
      return validateEditorLevelAnswer(
        this.editorState,
        (pairId) => this.getEditorPairPoints(pairId),
        (pairId) => this.getPointLabel(pairId)
      );
    }
};
