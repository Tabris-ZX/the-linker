import { buildGridLines, edgeKey, edgeRenderData, getAllGridEdges, getGridBounds, getGridNodes, keyOf, lineAttrs, pointsFromEdgeKey, toRenderPoint } from "../utils/geometry.js";

export const computed = {
    themeOptions() {
      return Object.values(this.themes);
    },

    pointPaletteOptions() {
      return Object.keys(this.pointPalettes).map((id) => ({
        id,
        label: id
      }));
    },

    visibleViewTabs() {
      return this.viewTabs.filter((tab) => tab.id !== "creator" || this.canUseLevelEditor);
    },

    timerText() {
      return this.formatElapsedTime(this.timerElapsedMs);
    },

    victoryTimeText() {
      return this.formatElapsedTime(this.timerElapsedMs);
    },

    currentLevelLabel() {
      if (this.isLevelsLoading) return "加载中";
      return this.currentLevel?.name || this.currentLevel?.id || "未选择";
    },

    levelDifficulties() {
      return [1, 2, 3, 4, 5];
    },

    filteredLevelItems() {
      return this.levels
        .map((level, index) => ({ level, index }))
        .filter(({ level }) => this.levelDifficultyFilter === "all" || this.normalizeLevelDifficulty(level.difficulty) === Number(this.levelDifficultyFilter))
        .filter(({ level }) => {
          if (this.levelCompletionFilter === "all") return true;
          const isCompleted = this.isLevelCompleted(level.id);
          return this.levelCompletionFilter === "done" ? isCompleted : !isCompleted;
        });
    },

    groupedFilteredLevels() {
      const groups = new Map();
      this.filteredLevelItems.forEach((item) => {
        const difficulty = this.normalizeLevelDifficulty(item.level.difficulty);
        if (!groups.has(difficulty)) groups.set(difficulty, []);
        groups.get(difficulty).push(item);
      });
      return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([difficulty, levels]) => ({ difficulty, levels }));
    },

    boardViewBox() {
      if (!this.currentLevel) return "0 0 1 1";
      const bounds = getGridBounds(this.currentLevel);
      return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
    },

    boardStyle() {
      const mapStyleVariables = {
        "--map-dot-scale": this.mapStyle.dotScale,
        "--map-node-scale": this.mapStyle.nodeScale,
        "--map-line-scale": this.mapStyle.lineScale,
        "--map-grid-line-scale": this.mapStyle.gridLineScale
      };

      if (!this.currentLevel) {
        return {
          ...mapStyleVariables,
          "--cols": 1,
          "--rows": 1,
          "--cell-size": "min(var(--board-max-width), var(--board-max-height))"
        };
      }

      const bounds = getGridBounds(this.currentLevel);
      return {
        ...mapStyleVariables,
        "--cols": bounds.cols,
        "--rows": bounds.rows,
        "--cell-size": `min(calc(var(--board-max-width) / ${bounds.cols}), calc(var(--board-max-height) / ${bounds.rows}))`
      };
    },

    mapStyleJson() {
      return JSON.stringify({
        mapStyle: {
          dotScale: this.mapStyle.dotScale,
          nodeScale: this.mapStyle.nodeScale,
          lineScale: this.mapStyle.lineScale,
          gridLineScale: this.mapStyle.gridLineScale,
          snapPointRadius: this.mapStyle.snapPointRadius
        }
      }, null, 2);
    },

    endpoints() {
      const endpoints = {};
      if (!this.currentLevel) return endpoints;
      this.currentLevel.pairs.forEach((pair) => {
        pair.points.forEach(([x, y]) => {
          endpoints[keyOf(x, y)] = pair.id;
        });
      });
      return endpoints;
    },

    gridLines() {
      if (!this.currentLevel) return [];
      const removedEdges = new Set(this.currentLevel.removedEdges ?? []);
      return getAllGridEdges(this.currentLevel)
        .filter((edge) => !removedEdges.has(edge))
        .map((edge) => edgeRenderData(edge, this.currentLevel.gridType))
        .filter(Boolean);
    },

    renderedPathLines() {
      if (!this.currentLevel) return [];
      const lines = [];
      const renderedEdges = new Set();
      Object.entries(this.paths).forEach(([pairId, path]) => {
        const pair = this.getPair(pairId);
        if (!pair) return;

        path.forEach((point, index) => {
          const next = path[index + 1];
          if (!next) return;
          const edge = edgeKey(point, next);
          if (renderedEdges.has(edge)) return;
          renderedEdges.add(edge);
          lines.push({
            key: `${pairId}-${edge}`,
            attrs: lineAttrs(toRenderPoint(point, this.currentLevel.gridType), toRenderPoint(next, this.currentLevel.gridType)),
            color: pair.color,
            className: ""
          });
        });
      });

      if (this.activePair) {
        const path = this.paths[this.activePair] ?? [];
        const last = path[path.length - 1];
        const pair = this.getPair(this.activePair);
        if (last && pair && this.pointerPreview) {
          const preview = this.pointerPreview;
          if (preview.x !== last[0] || preview.y !== last[1]) {
            const [x1, y1] = toRenderPoint(last, this.currentLevel.gridType);
            const [x2, y2] = toRenderPoint([preview.x, preview.y], this.currentLevel.gridType);
            lines.push({
              key: "pointer-preview",
              attrs: {
                x1,
                y1,
                x2,
                y2
              },
              color: pair.color,
              className: "preview-line"
            });
          }
        }
      }

      return lines;
    },

    boardNodes() {
      if (!this.currentLevel) return [];
      const nodes = [];
      const filledNodes = this.getFilledNodes();
      const activeTargetKey = this.getActiveTargetKey();
      const requiredNodes = new Set(this.getRequiredNodes());
      const bounds = getGridBounds(this.currentLevel);

      for (const [x, y] of getGridNodes(this.currentLevel)) {
        const key = keyOf(x, y);
        const pairId = this.endpoints[key];
        const endpoint = pairId ? this.getPair(pairId) : null;
        if (!endpoint && !requiredNodes.has(key)) continue;
        const [renderX, renderY] = toRenderPoint([x, y], this.currentLevel.gridType);
        nodes.push({
          key,
          x,
          y,
          endpoint,
          style: {
            "--node-x": renderX - bounds.minX,
            "--node-y": renderY - bounds.minY
          },
          classes: {
            "endpoint-node": Boolean(endpoint),
            "path-node": filledNodes.has(key),
            target: activeTargetKey === key
          }
        });
      }

      return nodes;
    },

    creatorViewBox() {
      const bounds = getGridBounds(this.creatorState);
      return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
    },

    creatorPreviewStyle() {
      const bounds = getGridBounds(this.creatorState);
      return {
        "--preview-cols": bounds.cols,
        "--preview-rows": bounds.rows,
        "--map-dot-scale": this.mapStyle.dotScale,
        "--map-node-scale": this.mapStyle.nodeScale,
        "--map-line-scale": this.mapStyle.lineScale,
        "--map-grid-line-scale": this.mapStyle.gridLineScale
      };
    },

    creatorGridLines() {
      return buildGridLines(this.creatorState);
    },

    creatorRemovedEdges() {
      return this.creatorState.removedEdges.map((edge) => {
        const points = pointsFromEdgeKey(edge);
        if (!points) return null;
        return {
          key: edge,
          attrs: lineAttrs(toRenderPoint(points[0], this.creatorState.gridType), toRenderPoint(points[1], this.creatorState.gridType))
        };
      }).filter(Boolean);
    },

    creatorAnswerEdges() {
      return Object.entries(this.creatorState.answers).map(([edge, pairId]) => {
        const points = pointsFromEdgeKey(edge);
        if (!points) return null;
        return {
          key: edge,
          attrs: lineAttrs(toRenderPoint(points[0], this.creatorState.gridType), toRenderPoint(points[1], this.creatorState.gridType)),
          color: this.pointDefinitions[pairId]?.color ?? "var(--accent)"
        };
      }).filter(Boolean);
    },

    creatorHitEdges() {
      return getAllGridEdges(this.creatorState)
        .map((edge) => {
          const points = pointsFromEdgeKey(edge);
          if (!points) return null;
          return {
            key: edge,
            attrs: lineAttrs(toRenderPoint(points[0], this.creatorState.gridType), toRenderPoint(points[1], this.creatorState.gridType))
          };
        })
        .filter(Boolean);
    },

    creatorNodes() {
      const nodes = [];
      const connectedNodes = new Set();
      const bounds = getGridBounds(this.creatorState);
      getAllGridEdges(this.creatorState).forEach((edge) => {
        if (this.creatorState.removedEdges.includes(edge)) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => connectedNodes.add(keyOf(x, y)));
      });

      for (const [x, y] of getGridNodes(this.creatorState)) {
        const pointAtNode = this.getCreatorPointAt(x, y);
        const point = pointAtNode ? this.pointDefinitions[pointAtNode.pairId] : null;
        if (!point && !connectedNodes.has(keyOf(x, y))) continue;
        const [renderX, renderY] = toRenderPoint([x, y], this.creatorState.gridType);
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
