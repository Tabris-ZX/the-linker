import { edgeKey, getAllGridEdges, getGridBounds, getGridNodes, keyOf, lineAttrs, linePathD, pointsFromEdgeKey, toRenderPoint } from "../utils/geometry.js";
import { buildWeaveHiddenEndpoints, buildWeavePairDistanceMap, buildWeaveVisibleLevel } from "./weaveRules.js";

export const computed = {
    /**
     * 获取可选主题列表。
     *
     * @returns {Array<object>} 主题配置列表。
     */
    themeOptions() {
      return Object.values(this.themes);
    },

    /**
     * 获取点位调色板选择项。
     *
     * @returns {Array<{ id: string, label: string }>} 调色板选项。
     */
    pointPaletteOptions() {
      return Object.keys(this.pointPalettes).map((id) => ({
        id,
        label: id
      }));
    },

    /**
     * 根据编辑器权限过滤可见视图标签。
     *
     * @returns {Array<object>} 当前可显示的标签页。
     */
    visibleViewTabs() {
      return this.viewTabs
        .filter((tab) => !tab.developerOnly || this.isDeveloperMode);
    },

    onlineCountText() {
      return Number.isFinite(this.onlineCount) ? "在线 " + this.onlineCount : "在线 --";
    },

    /**
     * 获取开发者 token 弹窗的冷却提示。
     *
     * @returns {string} 冷却提示。
     */
    developerTokenCooldownText() {
      this.dialogTick;
      return this.getDeveloperTokenCooldownText();
    },

    /**
     * 格式化当前计时文本。
     *
     * @returns {string} 计时显示文本。
     */
    timerText() {
      return this.formatElapsedTime(this.timerElapsedMs);
    },

    /**
     * 格式化胜利面板中的用时文本。
     *
     * @returns {string} 通关用时文本。
     */
    victoryTimeText() {
      return this.formatElapsedTime(this.getVictoryElapsedMs());
    },

    weavePenaltyText() {
      return this.formatElapsedTime(this.weavePenaltyMs);
    },

    weaveTotalTimeText() {
      return this.formatElapsedTime(this.getVictoryElapsedMs());
    },

    canUseWeaveMode() {
      return Boolean(this.isDeveloperMode && this.currentLevel?.gridType === "square");
    },

    isWeaveModeEnabled() {
      return this.activeView === "weave-total";
    },

    weaveVisibleLevel() {
      return this.isWeaveModeEnabled ? buildWeaveVisibleLevel(this.currentLevel) : null;
    },

    weaveHiddenEndpoints() {
      return this.isWeaveModeEnabled ? buildWeaveHiddenEndpoints(this.currentLevel) : [];
    },

    weaveVisibleEndpointKeys() {
      return new Set((this.weaveVisibleLevel?.pairs ?? [])
        .flatMap((pair) => pair.points ?? [])
        .map(([x, y]) => keyOf(x, y)));
    },

    weavePairDistances() {
      return buildWeavePairDistanceMap(this.weaveHiddenEndpoints, this.weaveKnownMarkedEndpoints);
    },

    activeBoardLevel() {
      return this.weaveVisibleLevel ?? this.currentLevel;
    },

    weaveModeTitle() {
      return "织链：色点总数";
    },

    weaveModeSubtitle() {
      return "每行/列提示剩余未填隐藏色点数";
    },

    weaveModeUnavailableText() {
      if (!this.isDeveloperMode) return "";
      if (!this.currentLevel) return "请先选择关卡";
      if (this.currentLevel.gridType !== "square") return "织链模式暂只支持方形地图";
      return "";
    },

    weavePrimaryPairOptions() {
      if (!this.currentLevel) return [];
      return this.currentLevel.pairs.map((pair) => ({
        id: pair.id,
        label: pair.label ?? this.pointDefinitions[pair.id]?.label ?? pair.id,
        color: pair.color ?? this.pointDefinitions[pair.id]?.color ?? "var(--accent)",
        distance: this.weavePairDistances[pair.id]?.distance ?? null,
        distanceStatus: this.weavePairDistances[pair.id]?.status ?? "empty"
      }));
    },

    weaveMetaPairOptions() {
      return [
        {
          id: this.weaveUnknownPairId,
          label: "?",
          color: "var(--weave-unknown-color)",
          isUnknown: true
        },
        {
          id: this.weaveExcludedPairId,
          label: "×",
          color: "var(--weave-excluded-color)",
          isExcluded: true
        }
      ];
    },

    weavePairOptions() {
      return [
        ...this.weavePrimaryPairOptions,
        ...this.weaveMetaPairOptions
      ];
    },

    weaveKnownMarkedEndpoints() {
      const metaPairIds = new Set([this.weaveUnknownPairId, this.weaveExcludedPairId]);
      return Object.fromEntries(
        Object.entries(this.weaveMarkedEndpoints ?? {})
          .filter(([, pairId]) => pairId && !metaPairIds.has(pairId))
      );
    },

    weaveClueRows() {
      return this.buildWeaveClueLines("row");
    },

    weaveClueColumns() {
      return this.buildWeaveClueLines("column");
    },

    weaveHiddenEndpointCount() {
      return this.weaveHiddenEndpoints.length;
    },

    weaveMarkedEndpointCount() {
      return Object.keys(this.weaveKnownMarkedEndpoints).length;
    },

    /**
     * 获取当前关卡标题。
     *
     * @returns {string} 当前关卡名称、id 或加载状态。
     */
    currentLevelLabel() {
      if (this.isLevelsLoading) return "加载中";
      return this.currentLevel?.name || this.currentLevel?.id || "未选择";
    },

    /**
     * 获取可筛选的难度级别。
     *
     * @returns {number[]} 难度列表。
     */
    levelDifficulties() {
      return [1, 2, 3, 4, 5];
    },

    /**
     * 获取已经加载的真实关卡，排除分页占位符。
     *
     * @returns {Array<object>} 已加载关卡列表。
     */
    loadedLevels() {
      return this.levels.filter(Boolean);
    },

    /**
     * 获取已加载关卡数量。
     *
     * @returns {number} 已加载数量。
     */
    loadedLevelCount() {
      return this.loadedLevels.length;
    },

    /**
     * 获取当前目录中各分类关卡数量。
     *
     * @returns {{ total: number, stable: number, alpha: number, removed: number }} 分类数量。
     */
    levelCategoryCounts() {
      return this.loadedLevels.reduce((counts, level) => {
        const category = this.getLevelCategory(level);
        counts.total += 1;
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, { total: 0, stable: 0, alpha: 0, removed: 0 });
    },

    /**
     * 获取关卡选择器目录数量文本。
     *
     * @returns {string} 目录数量文本。
     */
    levelDirectoryStatusText() {
      if (this.isLevelsLoading) return "目录加载中";
      if (this.developerStatusText && this.levels.length === 0) return this.developerStatusText;
      const counts = this.levelCategoryCounts;
      if (!this.isDeveloperMode) return `目录 ${counts.stable}`;
      return `目录 ${counts.total} · 正式 ${counts.stable} · 测试 ${counts.alpha} · 待删 ${counts.removed}`;
    },

    /**
     * 根据版本、难度和完成状态过滤关卡。
     *
     * @returns {Array<{ level: object, index: number }>} 过滤后的关卡项。
     */
    filteredLevelItems() {
      return this.levels
        .map((level, index) => ({ level, index }))
        .filter(({ level }) => level && this.isLevelCategoryVisible(level))
        .filter(({ level }) => this.levelCategoryFilter === "all" || this.getLevelCategory(level) === this.levelCategoryFilter)
        .filter(({ level }) => this.levelDifficultyFilter === "all" || this.normalizeLevelDifficulty(level.difficulty) === Number(this.levelDifficultyFilter))
        .filter(({ level }) => {
          if (this.levelCompletionFilter === "all") return true;
          const isCompleted = this.isLevelCompleted(this.getLevelCacheKey(level));
          return this.levelCompletionFilter === "done" ? isCompleted : !isCompleted;
        });
    },

    /**
     * 将过滤后的关卡按难度分组。
     *
     * @returns {Array<{ difficulty: number, levels: Array<object> }>} 分组关卡列表。
     */
    groupedFilteredLevels() {
      const groups = new Map();
      this.filteredLevelItems.forEach((item) => {
        const difficulty = `${this.getLevelCategoryLabel(item.level.sourceCategory)} · 难度 ${this.normalizeLevelDifficulty(item.level.difficulty)}`;
        if (!groups.has(difficulty)) groups.set(difficulty, []);
        groups.get(difficulty).push(item);
      });
      return [...groups.entries()]
        .sort(([, leftLevels], [, rightLevels]) => this.compareLevelItems(leftLevels[0], rightLevels[0]))
        .map(([difficulty, levels]) => ({ difficulty, levels }));
    },

    /**
     * 获取挑战棋盘 SVG viewBox。
     *
     * @returns {string} SVG viewBox 字符串。
     */
    boardViewBox() {
      if (!this.activeBoardLevel) return "0 0 1 1";
      const bounds = this.boardDisplayBounds;
      return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
    },

    /**
     * 判断当前棋盘显示是否需要旋转以匹配设备方向。
     *
     * @returns {boolean} 是否使用旋转后的显示坐标。
     */
    shouldRotateBoardDisplay() {
      if (!this.activeBoardLevel) return false;
      const bounds = getGridBounds(this.activeBoardLevel);
      const isWide = bounds.cols > bounds.rows;
      const isTall = bounds.rows > bounds.cols;
      if (!isWide && !isTall) return false;
      return this.prefersPortraitBoard ? isWide : isTall;
    },

    /**
     * 获取当前棋盘显示边界，移动端竖屏会交换宽高。
     *
     * @returns {{ minX: number, minY: number, width: number, height: number, cols: number, rows: number }}
     */
    boardDisplayBounds() {
      if (!this.activeBoardLevel) return { minX: 0, minY: 0, width: 1, height: 1, cols: 1, rows: 1 };
      const bounds = getGridBounds(this.activeBoardLevel);
      if (!this.shouldRotateBoardDisplay) return bounds;
      return {
        minX: 0,
        minY: 0,
        width: bounds.height,
        height: bounds.width,
        cols: bounds.rows,
        rows: bounds.cols
      };
    },

    /**
     * 生成挑战棋盘尺寸和样式变量。
     *
     * @returns {Record<string, string|number>} CSS 变量映射。
     */
    boardStyle() {
      const mapStyleVariables = {
        "--map-board-scale": this.mapStyle.boardScale,
        "--map-dot-scale": this.mapStyle.dotScale,
        "--map-node-scale": this.mapStyle.nodeScale,
        "--map-line-scale": this.mapStyle.lineScale,
        "--map-grid-line-scale": this.mapStyle.gridLineScale
      };

      if (!this.activeBoardLevel) {
      return {
        ...mapStyleVariables,
        "--cols": 1,
        "--rows": 1,
        "--node-cols": 2,
        "--node-rows": 2,
        "--cell-size": "calc(min(var(--board-max-width), var(--board-max-height)) * var(--map-board-scale))"
      };
      }

      const bounds = this.boardDisplayBounds;
      return {
        ...mapStyleVariables,
        "--cols": bounds.cols,
        "--rows": bounds.rows,
        "--node-cols": Math.round(bounds.cols) + 1,
        "--node-rows": Math.round(bounds.rows) + 1,
        "--cell-size": `calc(min(calc(var(--board-max-width) / ${bounds.cols}), calc(var(--board-max-height) / ${bounds.rows})) * var(--map-board-scale))`
      };
    },

    /**
     * 获取所有端点到点对 id 的映射。
     *
     * @returns {Record<string, string>} 节点 key 到点对 id 的映射。
     */
    endpoints() {
      const endpoints = {};
      if (!this.activeBoardLevel) return endpoints;
      this.activeBoardLevel.pairs.forEach((pair) => {
        pair.points.forEach(([x, y]) => {
          endpoints[keyOf(x, y)] = pair.id;
        });
      });
      return endpoints;
    },

    /**
     * 获取挑战棋盘中可见的网格线。
     *
     * @returns {Array<object>} 网格线渲染数据。
     */
    gridLines() {
      if (!this.activeBoardLevel) return [];
      const removedEdges = new Set(this.activeBoardLevel.removedEdges ?? []);
      return getAllGridEdges(this.activeBoardLevel)
        .filter((edge) => !removedEdges.has(edge))
        .map((edge) => this.edgeDisplayRenderData(edge))
        .filter(Boolean);
    },

    /**
     * 获取当前关卡所有可通行边的缓存集合。
     *
     * @returns {Set<string>} 可通行边 key 集合。
     */
    availableEdgeSet() {
      if (!this.activeBoardLevel) return new Set();
      const removedEdges = new Set(this.activeBoardLevel.removedEdges ?? []);
      return new Set(getAllGridEdges(this.activeBoardLevel).filter((edge) => !removedEdges.has(edge)));
    },

    /**
     * 获取当前关卡可通行邻接表，避免拖拽时反复扫描全图节点。
     *
     * @returns {Map<string, Array<[number, number]>>} 节点 key 到相邻节点列表的映射。
     */
    boardNeighborMap() {
      const map = new Map();
      if (!this.activeBoardLevel) return map;
      this.availableEdgeSet.forEach((edge) => {
        const points = pointsFromEdgeKey(edge);
        if (points.length !== 2) return;
        const [from, to] = points;
        const fromKey = keyOf(from[0], from[1]);
        const toKey = keyOf(to[0], to[1]);
        if (!map.has(fromKey)) map.set(fromKey, []);
        if (!map.has(toKey)) map.set(toKey, []);
        map.get(fromKey).push(to);
        map.get(toKey).push(from);
      });
      return map;
    },

    /**
     * 获取当前关卡节点的渲染坐标缓存，用于指针吸附。
     *
     * @returns {Array<{ x: number, y: number, renderX: number, renderY: number }>} 节点坐标列表。
     */
    boardSnapNodes() {
      if (!this.activeBoardLevel) return [];
      return getGridNodes(this.activeBoardLevel).map(([x, y]) => {
        const [renderX, renderY] = this.toBoardDisplayPoint([x, y]);
        return { x, y, renderX, renderY };
      });
    },

    /**
     * 获取合并后的棋盘网格 path。
     *
     * @returns {string} SVG path d 属性。
     */
    gridPathD() {
      return linePathD(this.gridLines);
    },

    /**
     * 获取已绘制路径和指针预览线。
     *
     * @returns {Array<object>} 路径线渲染数据。
     */
    renderedPathLines() {
      if (!this.activeBoardLevel) return [];
      const lines = [];
      const renderedEdges = new Set();
      this.getPathSegments().forEach((segment) => {
        const pair = this.getPair(segment.pairId);
        if (!pair || renderedEdges.has(segment.edge)) return;
        renderedEdges.add(segment.edge);
        lines.push({
          key: `${segment.pairId}-${segment.edge}`,
          attrs: lineAttrs(this.toBoardDisplayPoint(segment.from), this.toBoardDisplayPoint(segment.to)),
          color: pair.color,
          className: this.hintLockedPairs[segment.pairId] ? "is-hint-correct" : ""
        });
      });

      return lines;
    },

    /**
     * 获取当前指针预览线，单独渲染避免拖动时重算全部路径分组。
     *
     * @returns {{ d: string, color: string }|null} 预览线渲染数据。
     */
    pointerPreviewLine() {
      if (!this.activeBoardLevel || !this.activePair || !this.pointerPreview) return null;
      const path = this.getActiveBranch();
      const last = path[path.length - 1];
      const pair = this.getPair(this.activePair);
      if (!last || !pair) return null;
      const preview = this.pointerPreview;
      if (preview.x === last[0] && preview.y === last[1]) return null;
      const [x1, y1] = this.toBoardDisplayPoint(last);
      const [x2, y2] = this.toBoardDisplayPoint([preview.x, preview.y]);
      return {
        d: linePathD([{ attrs: { x1, y1, x2, y2 } }]),
        color: pair.color
      };
    },

    /**
     * 按颜色合并已绘制路径线，降低 SVG 节点数量。
     *
     * @returns {Array<{ key: string, color: string, className: string, d: string }>} path 渲染数据。
     */
    renderedPathGroups() {
      const groups = new Map();
      this.renderedPathLines.forEach((line) => {
        const key = String(line.color) + "|" + String(line.className ?? "");
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            color: line.color,
            className: line.className ?? "",
            lines: []
          });
        }
        groups.get(key).lines.push(line);
      });
      return [...groups.values()].map((group) => ({
        key: group.key,
        color: group.color,
        className: group.className,
        isHintCorrect: group.className.split(" ").includes("is-hint-correct"),
        d: linePathD(group.lines)
      })).filter((group) => group.d);
    },

    /**
     * 获取挑战棋盘需要渲染的节点。
     *
     * @returns {Array<object>} 节点渲染数据。
     */
    boardNodes() {
      if (!this.activeBoardLevel) return [];
      const nodes = [];
      const filledNodes = this.getFilledNodes();
      const activeTargetKey = this.isLinkedBlinkEnabled && this.isLinkedBlinkActive ? this.getActiveTargetKey() : "";
      const requiredNodes = new Set(this.getRequiredNodes());
      const bounds = this.boardDisplayBounds;

      for (const [x, y] of getGridNodes(this.activeBoardLevel)) {
        const key = keyOf(x, y);
        const pairId = this.endpoints[key];
        const endpoint = pairId ? this.getPair(pairId) : null;
        const weaveMarkPairId = this.weaveMarkedEndpoints[key] ?? "";
        const isUnknownWeaveMark = weaveMarkPairId === this.weaveUnknownPairId;
        const isExcludedWeaveMark = weaveMarkPairId === this.weaveExcludedPairId;
        const weaveMarkPoint = isUnknownWeaveMark || isExcludedWeaveMark
          ? {
              id: weaveMarkPairId,
              label: isExcludedWeaveMark ? "×" : "?",
              color: isExcludedWeaveMark ? "var(--weave-excluded-color)" : "var(--weave-unknown-color)"
            }
          : weaveMarkPairId ? this.getPair(weaveMarkPairId) : null;
        const renderedEndpoint = endpoint;
        const renderedWeaveMark = !renderedEndpoint && weaveMarkPoint ? weaveMarkPoint : null;
        const shouldRenderPathNode = requiredNodes.has(key);
        if (!endpoint && !shouldRenderPathNode && !weaveMarkPairId) continue;
        const [renderX, renderY] = this.toBoardDisplayPoint([x, y]);
        nodes.push({
          key,
          x,
          y,
          endpoint: renderedEndpoint,
          weaveMark: renderedWeaveMark,
          style: {
            "--node-x": renderX - bounds.minX,
            "--node-y": renderY - bounds.minY
          },
          classes: {
            "endpoint-node": Boolean(renderedEndpoint),
            "path-node": filledNodes.has(key),
            target: activeTargetKey === key,
            "weave-hidden-endpoint": false,
            "weave-hidden-target": false,
            "weave-marked-node": Boolean(weaveMarkPairId),
            "weave-mark-unknown": isUnknownWeaveMark,
            "weave-mark-excluded": isExcludedWeaveMark
          }
        });
      }

      return nodes;
    },

    /**
     * 获取关卡编辑器预览的 SVG viewBox。
     *
     * @returns {string} SVG viewBox 字符串。
     */
    editorViewBox() {
      const bounds = this.editorDisplayBounds;
      return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
    },

    editorShouldRotateDisplay() {
      const bounds = getGridBounds(this.editorState);
      return bounds.rows > bounds.cols;
    },

    editorDisplayBounds() {
      const bounds = getGridBounds(this.editorState);
      if (!this.editorShouldRotateDisplay) return bounds;
      return {
        minX: 0,
        minY: 0,
        width: bounds.height,
        height: bounds.width,
        cols: bounds.rows,
        rows: bounds.cols
      };
    },

    /**
     * 生成关卡编辑器预览区域样式变量。
     *
     * @returns {Record<string, string|number>} CSS 变量映射。
     */
    editorPreviewStyle() {
      const bounds = this.editorDisplayBounds;
      return {
        "--cols": bounds.cols,
        "--rows": bounds.rows,
        "--cell-size": `calc(min(calc((100cqw - 48px) / ${bounds.cols}), calc((var(--preview-height-limit) - 48px) / ${bounds.rows})) * var(--map-board-scale))`,
        "--map-board-scale": this.mapStyle.boardScale,
        "--map-dot-scale": this.mapStyle.dotScale,
        "--map-node-scale": this.mapStyle.nodeScale,
        "--map-line-scale": this.mapStyle.lineScale,
        "--map-grid-line-scale": this.mapStyle.gridLineScale
      };
    },

    /**
     * 获取编辑器中的基础网格线。
     *
     * @returns {Array<object>} 网格线渲染数据。
     */
    editorGridLines() {
      return getAllGridEdges(this.editorState)
        .map((edge) => this.editorEdgeDisplayRenderData(edge))
        .filter(Boolean);
    },

    /**
     * 获取编辑器当前可通行边集合。
     *
     * @returns {Set<string>} 可通行边 key 集合。
     */
    editorAvailableEdgeSet() {
      const removedEdges = new Set(this.editorState.removedEdges ?? []);
      return new Set(getAllGridEdges(this.editorState).filter((edge) => !removedEdges.has(edge)));
    },

    /**
     * 获取编辑器可通行邻接表，用于拖拽方向吸附。
     *
     * @returns {Map<string, Array<[number, number]>>} 节点 key 到相邻节点列表的映射。
     */
    editorNeighborMap() {
      const map = new Map();
      this.editorAvailableEdgeSet.forEach((edge) => {
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        const [from, to] = points;
        const fromKey = keyOf(from[0], from[1]);
        const toKey = keyOf(to[0], to[1]);
        if (!map.has(fromKey)) map.set(fromKey, []);
        if (!map.has(toKey)) map.set(toKey, []);
        map.get(fromKey).push(to);
        map.get(toKey).push(from);
      });
      return map;
    },

    /**
     * 获取编辑器节点渲染坐标缓存，用于指针吸附。
     *
     * @returns {Array<{ x: number, y: number, renderX: number, renderY: number }>} 节点坐标列表。
     */
    editorSnapNodes() {
      return getGridNodes(this.editorState).map(([x, y]) => {
        const [renderX, renderY] = this.toEditorDisplayPoint([x, y]);
        return { x, y, renderX, renderY };
      });
    },

    /**
     * 获取编辑器基础网格的合并 path。
     *
     * @returns {string} SVG path d 属性。
     */
    editorGridPathD() {
      return linePathD(this.editorGridLines);
    },

    /**
     * 获取编辑器中已移除边的渲染数据。
     *
     * @returns {Array<object>} 已移除边线数据。
     */
    editorRemovedEdges() {
      return this.editorState.removedEdges.map((edge) => {
        const points = pointsFromEdgeKey(edge);
        if (!points) return null;
        return {
          key: edge,
          attrs: lineAttrs(this.toEditorDisplayPoint(points[0]), this.toEditorDisplayPoint(points[1]))
        };
      }).filter(Boolean);
    },

    /**
     * 获取编辑器移除边的合并 path。
     *
     * @returns {string} SVG path d 属性。
     */
    editorRemovedEdgesPathD() {
      return linePathD(this.editorRemovedEdges);
    },

    /**
     * 获取编辑器中答案线路的渲染数据。
     *
     * @returns {Array<object>} 答案边线数据。
     */
    editorAnswerEdges() {
      return Object.entries(this.editorState.answers).map(([edge, pairId]) => {
        const points = pointsFromEdgeKey(edge);
        if (!points) return null;
        return {
          key: edge,
          attrs: lineAttrs(this.toEditorDisplayPoint(points[0]), this.toEditorDisplayPoint(points[1])),
          color: this.pointDefinitions[pairId]?.color ?? "var(--accent)"
        };
      }).filter(Boolean);
    },

    /**
     * 按颜色合并编辑器答案边。
     *
     * @returns {Array<{ key: string, color: string, d: string }>} path 渲染数据。
     */
    editorAnswerEdgeGroups() {
      const groups = new Map();
      this.editorAnswerEdges.forEach((edge) => {
        if (!groups.has(edge.color)) groups.set(edge.color, []);
        groups.get(edge.color).push(edge);
      });
      return [...groups.entries()].map(([color, edges]) => ({
        key: color,
        color,
        d: linePathD(edges)
      })).filter((group) => group.d);
    },

    /**
     * 获取编辑器拖拽预览线。
     *
     * @returns {{ d: string, color: string }|null} 预览线渲染数据。
     */
    editorPointerPreviewLine() {
      if (!this.editorDragState?.last || !this.editorDragState?.preview) return null;
      const last = this.editorDragState.last;
      const preview = this.editorDragState.preview;
      if (last[0] === preview.x && last[1] === preview.y) return null;
      const [x1, y1] = this.toEditorDisplayPoint(last);
      const [x2, y2] = this.toEditorDisplayPoint([preview.x, preview.y]);
      return {
        d: linePathD([{ attrs: { x1, y1, x2, y2 } }]),
        color: this.pointDefinitions[this.editorDragState.pairId]?.color ?? "var(--accent)"
      };
    },

    /**
     * 获取编辑器中可点击的边。
     *
     * @returns {Array<object>} 命中边渲染数据。
     */
    editorHitEdges() {
      return getAllGridEdges(this.editorState)
        .map((edge) => {
          const points = pointsFromEdgeKey(edge);
          if (!points) return null;
          return {
            key: edge,
            attrs: lineAttrs(this.toEditorDisplayPoint(points[0]), this.toEditorDisplayPoint(points[1]))
          };
        })
        .filter(Boolean);
    },

    /**
     * 获取编辑器中需要显示的节点。
     *
     * @returns {Array<object>} 节点渲染数据。
     */
    editorNodes() {
      const nodes = [];
      const connectedNodes = new Set();
      const bounds = this.editorDisplayBounds;
      getAllGridEdges(this.editorState).forEach((edge) => {
        if (this.editorState.removedEdges.includes(edge)) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => connectedNodes.add(keyOf(x, y)));
      });

      for (const [x, y] of getGridNodes(this.editorState)) {
        const pointAtNode = this.getEditorPointAt(x, y);
        const point = pointAtNode ? this.pointDefinitions[pointAtNode.pairId] : null;
        if (!point && !connectedNodes.has(keyOf(x, y))) continue;
        const [renderX, renderY] = this.toEditorDisplayPoint([x, y]);
        nodes.push({
          key: keyOf(x, y),
          x,
          y,
          point,
          style: {
            "--node-x": renderX - bounds.minX,
            "--node-y": renderY - bounds.minY
          }
        });
      }
      return nodes;
    }
};
