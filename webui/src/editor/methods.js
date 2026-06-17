import { isEditorEdgeInBounds, validateEditorLevelAnswer } from "./checker.js";
import { checkLevelGoodRequest, generateLevelRequest } from "../router/levels.js";
import { hydrateLevel, loadLevelAnswers, saveLevelFile } from "../services/levels.js";
import { edgeKey, fromRenderPoint, getEquilateralTriangleSize, getGridBounds, getGridNodes, isAdjacent, keyOf, lineAttrs, normalizeGridType, pointFromKey, pointsFromEdgeKey, toRenderPoint } from "../utils/geometry.js";
import { clampNumber, omitKey } from "../utils/object.js";

export const editorMethods = {
    toEditorDisplayPoint(point) {
      const renderPoint = toRenderPoint(point, this.editorState.gridType);
      if (!this.editorShouldRotateDisplay) return renderPoint;
      const bounds = getGridBounds(this.editorState);
      return [
        renderPoint[1] - bounds.minY,
        bounds.minX + bounds.width - renderPoint[0]
      ];
    },

    /**
     * 将编辑器显示坐标反推为逻辑坐标。
     *
     * @param {[number, number]} point 显示坐标。
     * @param {object} [bounds] 网格边界。
     * @returns {[number, number]} 逻辑坐标。
     */
    fromEditorDisplayPoint(point, bounds = getGridBounds(this.editorState)) {
      const renderPoint = this.editorShouldRotateDisplay
        ? [
            bounds.minX + bounds.width - point[1],
            bounds.minY + point[0]
          ]
        : point;
      return fromRenderPoint(renderPoint, this.editorState.gridType);
    },

    editorEdgeDisplayRenderData(edge) {
      const points = pointsFromEdgeKey(edge);
      if (!points) return null;
      return {
        key: edge,
        attrs: lineAttrs(this.toEditorDisplayPoint(points[0]), this.toEditorDisplayPoint(points[1]))
      };
    },

    /**
     * 用鼠标滚轮调整编辑器数字输入。
     *
     * @param {WheelEvent} event 滚轮事件。
     * @param {"width"|"height"|"pairCount"|"difficulty"} field 字段名。
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
      this.editorState.width = clampNumber(this.editorState.width, 1, 19);
      this.editorState.height = clampNumber(this.editorState.height, 1, 17);
      if (this.editorState.gridType === "equilateral-triangle") {
        this.editorState.height = clampNumber(this.editorState.height, 1, 8);
        this.editorState.width = clampNumber(this.editorState.width, this.editorState.height + 1, 12);
      }
      const validNodes = new Set(getGridNodes(this.editorState).map(([x, y]) => keyOf(x, y)));
      this.editorState.points = Object.fromEntries(
        Object.entries(this.editorState.points).map(([pairId, points]) => [
          pairId,
          points.filter(([x, y]) => validNodes.has(keyOf(x, y))).slice(0, 2)
        ])
      );
      this.editorState.removedEdges = this.editorState.removedEdges.filter((edge) => this.isEditorEdgeInBounds(edge));
      this.editorState.answers = Object.fromEntries(
        Object.entries(this.editorState.answers).filter(([edge, pairId]) => this.editorState.pairIds.includes(pairId) && this.isEditorEdgeInBounds(edge))
      );
      this.stopEditorDrag(false);
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

    async generateEditorPuzzle() {
      if (this.isEditorGenerating) return;
      const difficulty = clampNumber(this.editorGeneratorState.difficulty, 1, 5);
      const gridType = normalizeGridType(this.editorGeneratorState.gridType);

      if (!this.isDeveloperMode) {
        this.previewHint = "完整生成器需要后端开发者权限";
        return;
      }

      this.previewHint = "正在调用完整生成器...";
      this.isEditorGenerating = true;
      try {
        const generated = await generateLevelRequest({
          difficulty,
          gridType
        });
        this.loadEditorLevel(hydrateLevel({
          ...generated.map,
          id: "",
          name: "",
          answers: generated.answers?.answers ?? []
        }, this.pointDefinitions));
        this.editorEditingLevelId = "";
        this.editorGeneratorState.difficulty = difficulty;
        this.editorGeneratorState.gridType = gridType;
        this.previewHint = `已用完整生成器生成 ${this.getGridTypeLabel(gridType)} 难度 ${difficulty}，${this.editorPairCount} 组色点`;
      } catch (error) {
        this.previewHint = error.message || "生成失败";
      } finally {
        this.isEditorGenerating = false;
      }
    },

    async checkEditorGoodSolution() {
      if (this.isEditorCheckingGood) return;
      if (!this.isDeveloperMode) {
        this.previewHint = "好解检查需要后端开发者权限";
        return;
      }
      const validationMessage = this.validateEditorLevel();
      if (validationMessage) {
        this.previewHint = validationMessage;
        return;
      }

      this.isEditorCheckingGood = true;
      this.previewHint = "正在检查好解...";
      try {
        const payload = this.buildEditorLevelExport();
        const result = await checkLevelGoodRequest({
          map: payload.map,
          answers: payload.answers,
          options: {
            solveMs: 5000
          }
        });
        this.previewHint = `${result.message}，耗时 ${result.checkedMs ?? 0}ms`;
      } catch (error) {
        this.previewHint = error.message || "好解检查失败";
      } finally {
        this.isEditorCheckingGood = false;
      }
    },

    getGridTypeLabel(gridType) {
      return {
        square: "方形",
        "right-triangle": "直角三角形",
        "equilateral-triangle": "正三角形"
      }[gridType] ?? gridType;
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

      const answers = await loadLevelAnswers(level);
      this.loadEditorLevel(hydrateLevel({ ...level, answers }, this.pointDefinitions));
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
        width: 6,
        height: 5,
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
      const equilateralSize = getEquilateralTriangleSize(level);
      const isEquilateral = normalizeGridType(level.gridType ?? "square") === "equilateral-triangle";
      this.editorEditingLevelId = this.getLevelCacheKey(level);
      this.editorPairCount = pairIds.length;
      this.editorState = {
        name: level.name ?? "",
        gridType: normalizeGridType(level.gridType ?? "square"),
        difficulty: clampNumber(level.difficulty, 1, 5),
        width: isEquilateral ? clampNumber(equilateralSize.width, 2, 12) : level.width ?? 6,
        height: isEquilateral ? clampNumber(equilateralSize.height, 1, 8) : level.height ?? 5,
        pairIds,
        activePairId: pairIds[0],
        mode: this.editorState.mode ?? "mark",
        points: Object.fromEntries(level.pairs.map((pair) => [pair.id, pair.points.map(([x, y]) => [x, y]).slice(0, 2)])),
        removedEdges: [...(level.removedEdges ?? [])],
        answers: Object.fromEntries((level.answers ?? [])
          .map((answer) => [answer.edge, String(answer.pairId)])
          .filter(([edge, pairId]) => edge && pairIds.includes(pairId)))
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
    loadImportedEditorLevel(payload) {
      const level = payload;
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
      this.stopEditorDrag(false);
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
      this.stopEditorDrag(false);
      this.previewHint = "已清空当前所有点位和连线";
      this.writeLevelTemplate(false);
    },

    /**
     * 处理编辑器预览区按下事件，开始拖动答案线或准备点击操作。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleEditorPreviewPointerDown(event) {
      this.cacheEditorPointerGeometry(event.currentTarget);
      const node = event.target.closest("[data-preview-node]");
      if (node) {
        const [x, y] = pointFromKey(node.dataset.previewNode);
        this.startEditorDrag([x, y]);
        event.currentTarget?.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }

      if (this.editorState.mode !== "edge") return;
      const edge = event.target.closest("[data-preview-edge]");
      if (!edge) return;
      this.editorDragState = {
        mode: "edge-click",
        edge: edge.dataset.previewEdge
      };
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },

    /**
     * 处理编辑器预览区移动事件，拖动标记答案线。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleEditorPreviewPointerMove(event) {
      if (!this.editorDragState || this.editorDragState.mode !== "mark") return;
      const pointerPosition = this.editorPointerPositionFromEvent(event);
      if (pointerPosition) {
        this.editorDragState.preview = pointerPosition;
      }
      this.queueEditorDragPosition(pointerPosition);
      event.preventDefault();
    },

    /**
     * 处理编辑器预览区抬起事件，提交点击或结束拖拽。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleEditorPreviewPointerUp(event) {
      const dragState = this.editorDragState;
      this.cancelEditorDragFrame();
      if (!dragState) {
        this.releaseEditorPointer(event);
        return;
      }

      if (dragState.mode === "mark") {
        const finalPosition = this.editorDragPositionFromPointer(this.editorPointerPositionFromEvent(event));
        if (finalPosition && dragState.last) {
          const finalNodeKey = keyOf(finalPosition.x, finalPosition.y);
          const lastNodeKey = keyOf(dragState.last[0], dragState.last[1]);
          if (finalNodeKey !== lastNodeKey && this.addEditorAnswerStep(finalPosition)) {
            this.editorPointerMoved = true;
            this.editorLastPointerNodeKey = finalNodeKey;
          }
        }
        if (!this.editorPointerMoved && dragState.start) {
          this.toggleEditorPoint(dragState.start[0], dragState.start[1]);
        } else if (this.editorPointerMoved) {
          this.previewHint = `已绘制 ${this.getPointLabel(dragState.pairId)} 号答案线路`;
          this.writeLevelTemplate(false);
        }
      } else if (dragState.mode === "edge-click" && !this.editorPointerMoved && dragState.edge) {
        this.toggleEditorEdge(dragState.edge);
      } else if (dragState.mode === "point-click" && dragState.start) {
        this.toggleEditorPoint(dragState.start[0], dragState.start[1]);
      }

      this.stopEditorDrag(false);
      event.preventDefault();
      this.releaseEditorPointer(event);
    },

    /**
     * 处理编辑器预览区指针取消事件。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleEditorPreviewPointerCancel(event) {
      this.stopEditorDrag(false);
      this.releaseEditorPointer(event);
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

      this.previewHint = "标记模式：请按住节点拖动来绘制答案线路";
    },

    /**
     * 开始编辑器答案线拖拽。
     *
     * @param {[number, number]} point 起点。
     * @returns {void}
     */
    startEditorDrag(point) {
      this.cancelEditorDragFrame();
      this.editorPointerMoved = false;
      this.editorLastPointerNodeKey = keyOf(point[0], point[1]);
      if (this.editorState.mode !== "mark") {
        this.editorDragState = {
          mode: "point-click",
          start: point
        };
        return;
      }

      this.editorDragState = {
        mode: "mark",
        pairId: this.editorState.activePairId,
        start: point,
        last: point,
        preview: null
      };
    },

    /**
     * 给当前答案拖拽追加一步。
     *
     * @param {{ x: number, y: number }} position 目标节点。
     * @returns {boolean} 是否追加成功。
     */
    addEditorAnswerStep(position) {
      const dragState = this.editorDragState;
      if (!dragState || dragState.mode !== "mark" || !dragState.pairId || !dragState.last) return false;
      const next = [position.x, position.y];
      const last = dragState.last;
      if (last[0] === next[0] && last[1] === next[1]) return true;
      if (!isAdjacent(last, next, this.editorState.gridType)) {
        return this.addEditorAnswerStepsToward(next);
      }
      const edge = edgeKey(last, next);
      if (!this.editorAvailableEdgeSet.has(edge)) {
        this.previewHint = "被移除的边不能标记为答案线路";
        return false;
      }

      if (this.editorState.answers[edge] === dragState.pairId) {
        this.editorState.answers = omitKey(this.editorState.answers, edge);
      } else {
        this.editorState.answers = {
          ...this.editorState.answers,
          [edge]: dragState.pairId
        };
      }
      dragState.last = next;
      return true;
    },

    /**
     * 快速拖拽到较远节点时，沿可通行邻边向目标补齐中间步骤。
     *
     * @param {[number, number]} target 目标节点。
     * @returns {boolean} 是否至少移动了一步。
     */
    addEditorAnswerStepsToward(target) {
      const dragState = this.editorDragState;
      if (!dragState?.last) return false;
      const targetRender = this.toEditorDisplayPoint(target);
      const maxSteps = this.editorSnapNodes.length + 1;
      let current = dragState.last;
      let moved = false;

      for (let step = 0; step < maxSteps && (current[0] !== target[0] || current[1] !== target[1]); step += 1) {
        const currentRender = this.toEditorDisplayPoint(current);
        const currentDistance = Math.hypot(targetRender[0] - currentRender[0], targetRender[1] - currentRender[1]);
        let best = null;
        let bestDistance = currentDistance;

        (this.editorNeighborMap.get(keyOf(current[0], current[1])) ?? []).forEach((candidate) => {
          const candidateRender = this.toEditorDisplayPoint(candidate);
          const distance = Math.hypot(targetRender[0] - candidateRender[0], targetRender[1] - candidateRender[1]);
          if (distance < bestDistance - 0.000001) {
            bestDistance = distance;
            best = candidate;
          }
        });

        if (!best) return moved;
        if (!this.addEditorAnswerStep({ x: best[0], y: best[1] })) return moved;
        current = dragState.last;
        moved = true;
      }

      return moved;
    },

    /**
     * 缓存编辑器预览区尺寸和网格边界。
     *
     * @param {HTMLElement|null} editorElement 编辑器预览元素。
     * @returns {void}
     */
    cacheEditorPointerGeometry(editorElement) {
      if (!editorElement) {
        this.editorPointerGeometry = null;
        return;
      }
      const rect = editorElement.getBoundingClientRect();
      this.editorPointerGeometry = {
        left: rect.left,
        top: rect.top,
        width: rect.width || 1,
        height: rect.height || 1,
        bounds: this.editorDisplayBounds,
        sourceBounds: getGridBounds(this.editorState)
      };
    },

    /**
     * 将指针事件转换为编辑器逻辑位置。
     *
     * @param {PointerEvent|MouseEvent} event 指针事件。
     * @returns {{ x: number, y: number, renderX: number, renderY: number }|null} 逻辑位置。
     */
    editorPointerPositionFromEvent(event) {
      if (!this.editorPointerGeometry) {
        this.cacheEditorPointerGeometry(event.currentTarget);
      }
      const geometry = this.editorPointerGeometry;
      if (!geometry) return null;
      const bounds = geometry.bounds;
      const renderX = bounds.minX + ((event.clientX - geometry.left) / geometry.width) * bounds.width;
      const renderY = bounds.minY + ((event.clientY - geometry.top) / geometry.height) * bounds.height;
      const [x, y] = this.fromEditorDisplayPoint([renderX, renderY], geometry.sourceBounds);
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x, y, renderX, renderY };
    },

    /**
     * 拖拽时解析编辑器目标节点。
     *
     * @param {{ x: number, y: number, renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 目标节点。
     */
    editorDragPositionFromPointer(point) {
      if (!point) return null;
      const direct = this.nearestEditorPositionFromPointer(point);
      if (direct) return direct;
      return this.directionalEditorDragPositionFromPointer(point);
    },

    /**
     * 从逻辑指针位置寻找最近的编辑器节点。
     *
     * @param {{ renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 最近节点。
     */
    nearestEditorPositionFromPointer(point) {
      if (!point) return null;
      let nearest = null;
      let nearestDistance = Infinity;
      this.editorSnapNodes.forEach((node) => {
        const distance = Math.hypot(point.renderX - node.renderX, point.renderY - node.renderY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { x: node.x, y: node.y };
        }
      });
      const snapTolerance = Math.max(this.mapStyle.snapPointTolerance, this.mapStyle.dotScale * 0.55, this.mapStyle.lineScale * 0.45);
      if (!nearest || nearestDistance > snapTolerance) return null;
      return nearest;
    },

    /**
     * 指针未命中节点时，根据拖拽方向选择相邻节点。
     *
     * @param {{ renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 目标节点。
     */
    directionalEditorDragPositionFromPointer(point) {
      const dragState = this.editorDragState;
      if (!point || !dragState?.last) return null;
      const current = dragState.last;
      const currentRender = this.toEditorDisplayPoint(current);
      const pointerVector = [point.renderX - currentRender[0], point.renderY - currentRender[1]];
      const pointerDistance = Math.hypot(pointerVector[0], pointerVector[1]);
      if (pointerDistance <= 0) return null;

      const snapTolerance = Math.max(this.mapStyle.snapPointTolerance, this.mapStyle.dotScale * 0.55, this.mapStyle.lineScale * 0.45);
      let best = null;
      let bestScore = Infinity;

      (this.editorNeighborMap.get(keyOf(current[0], current[1])) ?? []).forEach((candidate) => {
        const candidateRender = this.toEditorDisplayPoint(candidate);
        const edgeVector = [candidateRender[0] - currentRender[0], candidateRender[1] - currentRender[1]];
        const edgeLength = Math.hypot(edgeVector[0], edgeVector[1]);
        if (edgeLength <= 0 || pointerDistance < edgeLength * 0.68) return;

        const projection = (pointerVector[0] * edgeVector[0] + pointerVector[1] * edgeVector[1]) / (edgeLength * edgeLength);
        if (projection < 0.63) return;

        const perpendicular = Math.abs(pointerVector[0] * edgeVector[1] - pointerVector[1] * edgeVector[0]) / edgeLength;
        const distanceToCandidate = Math.hypot(point.renderX - candidateRender[0], point.renderY - candidateRender[1]);
        const tolerance = Math.max(snapTolerance, edgeLength * 0.24);
        if (perpendicular > tolerance && distanceToCandidate > edgeLength * 0.65) return;

        const score = distanceToCandidate + Math.max(0, perpendicular - snapTolerance) * 0.65;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });

      return best ? { x: best[0], y: best[1] } : null;
    },

    /**
     * 将编辑器拖拽节点计算合并到下一帧。
     *
     * @param {{ x: number, y: number, renderX: number, renderY: number }|null} point 指针位置。
     * @returns {void}
     */
    queueEditorDragPosition(point) {
      this.pendingEditorDragPosition = point;
      if (this.editorDragFrameId) return;
      this.editorDragFrameId = window.requestAnimationFrame(() => {
        this.editorDragFrameId = 0;
        this.processQueuedEditorDragPosition();
      });
    },

    /**
     * 处理当前帧最后一次编辑器拖拽位置。
     *
     * @returns {void}
     */
    processQueuedEditorDragPosition() {
      const pointerPosition = this.pendingEditorDragPosition;
      this.pendingEditorDragPosition = null;
      if (!this.editorDragState || this.editorDragState.mode !== "mark" || !pointerPosition) return;

      const position = this.editorDragPositionFromPointer(pointerPosition);
      if (!position) return;
      const nodeKey = keyOf(position.x, position.y);
      if (nodeKey === this.editorLastPointerNodeKey) return;
      if (this.addEditorAnswerStep(position)) {
        this.editorPointerMoved = true;
        this.editorLastPointerNodeKey = nodeKey;
      }
    },

    /**
     * 取消挂起的编辑器拖拽计算帧。
     *
     * @returns {void}
     */
    cancelEditorDragFrame() {
      if (this.editorDragFrameId) {
        window.cancelAnimationFrame(this.editorDragFrameId);
        this.editorDragFrameId = 0;
      }
      this.pendingEditorDragPosition = null;
    },

    /**
     * 清理编辑器拖拽状态。
     *
     * @param {boolean} [keepGeometry=false] 是否保留几何缓存。
     * @returns {void}
     */
    stopEditorDrag(keepGeometry = false) {
      this.cancelEditorDragFrame();
      this.editorDragState = null;
      this.editorPointerMoved = false;
      this.editorLastPointerNodeKey = "";
      if (!keepGeometry) this.editorPointerGeometry = null;
    },

    /**
     * 释放编辑器指针捕获。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    releaseEditorPointer(event) {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
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
        mark: `标记模式：当前颜色为 ${label} 号，按住节点拖动标出答案线路。`
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
      this.levelOutput = JSON.stringify(this.buildEditorLevelExport(), null, 2);
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
     * 构建编辑器导出的拆分 JSON。
     *
     * @param {string} [id] 关卡 id，默认使用编辑 id 或自动生成 id。
     * @returns {{ map: object, answers: object }} 导出对象。
     */
    buildEditorLevelExport(id = "") {
      const map = this.buildEditorMapTemplate(id);
      return {
        map,
        answers: this.buildEditorAnswersTemplate(map.id)
      };
    },

    /**
     * 构建后端保存请求载荷。
     *
     * @param {string} [id] 关卡 id，默认使用编辑 id 或自动生成 id。
     * @returns {object} 保存载荷。
     */
    buildEditorLevelTemplate(id = "") {
      const exportPayload = this.buildEditorLevelExport(id);
      return {
        ...exportPayload.map,
        answers: exportPayload.answers.answers
      };
    },

    /**
     * 构建可保存到 data/levels 的地图 JSON。
     *
     * @param {string} [id] 关卡 id，默认使用编辑 id 或自动生成 id。
     * @returns {object} 地图模板。
     */
    buildEditorMapTemplate(id = "") {
      const editingLevel = this.editorEditingLevelId ? this.levels.find((level) => this.getLevelCacheKey(level) === this.editorEditingLevelId) : null;
      const levelId = id || editingLevel?.id || this.getEditorDefaultId();
      const name = editingLevel?.name ?? (this.editorState.name.trim() || this.getDefaultEditorLevelName(levelId));
      const map = {
        id: levelId,
        name,
        difficulty: clampNumber(this.editorState.difficulty, 1, 5),
        gridType: this.editorState.gridType,
        pairs: this.editorState.pairIds.map((pairId) => ({
          id: String(pairId),
          points: this.getEditorPairPoints(pairId)
        })),
        removedEdges: [...this.editorState.removedEdges]
      };
      map.width = clampNumber(this.editorState.width, 1, 19);
      map.height = clampNumber(this.editorState.height, 1, 17);
      if (this.editorState.gridType === "equilateral-triangle") {
        map.height = clampNumber(map.height, 1, 8);
        map.width = clampNumber(map.width, map.height + 1, 12);
      }
      return map;
    },

    /**
     * 构建可保存到 data/answers 的答案 JSON。
     *
     * @param {string} levelId 关卡 id。
     * @returns {{ levelId: string, answers: Array<object> }} 答案模板。
     */
    buildEditorAnswersTemplate(levelId) {
      return {
        levelId,
        answers: Object.entries(this.editorState.answers).map(([edge, pairId]) => ({
          edge,
          pairId: String(pairId)
        }))
      };
    },

    /**
     * 根据当前网格类型和尺寸生成默认关卡 id。
     *
     * @returns {string} 默认关卡 id。
     */
    getEditorDefaultId() {
      return `custom-${this.editorState.width}x${this.editorState.height}-${this.editorState.pairIds.length}`;
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
      if (savedLevel.sourceCategory === "alpha") {
        this.levelCategoryFilter = "alpha";
      }
      this.levelOutput = JSON.stringify(this.buildEditorLevelExport(savedLevel.id), null, 2);
      this.isLevelOutputVisible = true;
      this.previewHint = this.editorEditingLevelId
        ? `已更新 levels/${savedLevel.sourcePath || `${savedLevel.sourceCategory}/${savedLevel.id}.json`}`
        : `已保存到 levels/${savedLevel.sourcePath || `alpha/${savedLevel.id}.json`}，并加入测试版`;
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
      if (/^[1-5]\d{3}$/.test(id)) return `Lv ${id}`;
      if (/^[1-5]\d{3}-tmp$/.test(id)) return `Imp ${id}`;
      return id.startsWith("level-") ? `Lv ${id.slice(6)}` : "Custom Level";
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
