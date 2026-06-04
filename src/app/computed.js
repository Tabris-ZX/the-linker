import { buildGridLines, edgeKey, edgeRenderData, getAllGridEdges, keyOf, lineAttrs, pointsFromEdgeKey } from "../utils/geometry.js";

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
      return `0 0 ${this.currentLevel.width} ${this.currentLevel.height}`;
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

      // Keep the board on a fixed pixel scale: max 1200px wide and 600px tall.
      // The final square edge length is the smaller of width-based and height-based splits.
      return {
        ...mapStyleVariables,
        "--cols": this.currentLevel.width,
        "--rows": this.currentLevel.height,
        "--cell-size": `min(calc(var(--board-max-width) / ${this.currentLevel.width}), calc(var(--board-max-height) / ${this.currentLevel.height}))`
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
      return getAllGridEdges(this.currentLevel.width, this.currentLevel.height)
        .filter((edge) => !removedEdges.has(edge))
        .map((edge) => edgeRenderData(edge))
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
            attrs: lineAttrs(point, next),
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
          const preview = {
            x: Math.min(this.currentLevel.width, Math.max(0, this.pointerPreview.x)),
            y: Math.min(this.currentLevel.height, Math.max(0, this.pointerPreview.y))
          };
          if (preview.x !== last[0] || preview.y !== last[1]) {
            lines.push({
              key: "pointer-preview",
              attrs: {
                x1: last[0],
                y1: last[1],
                x2: preview.x,
                y2: preview.y
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

      for (let y = 0; y <= this.currentLevel.height; y += 1) {
        for (let x = 0; x <= this.currentLevel.width; x += 1) {
          const key = keyOf(x, y);
          const pairId = this.endpoints[key];
          const endpoint = pairId ? this.getPair(pairId) : null;
          if (!endpoint && !requiredNodes.has(key)) continue;
          nodes.push({
            key,
            x,
            y,
            endpoint,
            style: {
              "--node-x": x,
              "--node-y": y
            },
            classes: {
              "endpoint-node": Boolean(endpoint),
              "path-node": filledNodes.has(key),
              target: activeTargetKey === key
            }
          });
        }
      }

      return nodes;
    },

    creatorViewBox() {
      return `0 0 ${this.creatorState.width} ${this.creatorState.height}`;
    },

    creatorPreviewStyle() {
      return {
        "--preview-cols": this.creatorState.width,
        "--preview-rows": this.creatorState.height,
        "--map-dot-scale": this.mapStyle.dotScale,
        "--map-node-scale": this.mapStyle.nodeScale,
        "--map-line-scale": this.mapStyle.lineScale,
        "--map-grid-line-scale": this.mapStyle.gridLineScale
      };
    },

    creatorGridLines() {
      return buildGridLines(this.creatorState.width, this.creatorState.height);
    },

    creatorRemovedEdges() {
      return this.creatorState.removedEdges.map((edge) => edgeRenderData(edge)).filter(Boolean);
    },

    creatorAnswerEdges() {
      return Object.entries(this.creatorState.answers).map(([edge, pairId]) => {
        const data = edgeRenderData(edge);
        if (!data) return null;
        return {
          ...data,
          color: this.pointDefinitions[pairId]?.color ?? "var(--accent)"
        };
      }).filter(Boolean);
    },

    creatorHitEdges() {
      return getAllGridEdges(this.creatorState.width, this.creatorState.height)
        .map((edge) => edgeRenderData(edge))
        .filter(Boolean);
    },

    creatorNodes() {
      const nodes = [];
      const connectedNodes = new Set();
      getAllGridEdges(this.creatorState.width, this.creatorState.height).forEach((edge) => {
        if (this.creatorState.removedEdges.includes(edge)) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => connectedNodes.add(keyOf(x, y)));
      });

      for (let y = 0; y <= this.creatorState.height; y += 1) {
        for (let x = 0; x <= this.creatorState.width; x += 1) {
          const pointAtNode = this.getCreatorPointAt(x, y);
          const point = pointAtNode ? this.pointDefinitions[pointAtNode.pairId] : null;
          if (!point && !connectedNodes.has(keyOf(x, y))) continue;
          nodes.push({
            key: keyOf(x, y),
            x,
            y,
            point,
            style: {
              "--node-x": x,
              "--node-y": y
            }
          });
        }
      }
      return nodes;
    }
};
