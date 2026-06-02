import { buildGridLines, edgeKey, edgeRenderData, getAllGridEdges, keyOf, lineAttrs } from "./utils/geometry.js";

export const computed = {
    themeOptions() {
      return Object.values(this.themes);
    },

    visibleViewTabs() {
      return this.viewTabs.filter((tab) => tab.id !== "creator" || this.canUseLevelEditor);
    },

    timerText() {
      const totalSeconds = Math.floor(this.timerElapsedMs / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    },

    boardViewBox() {
      return `0 0 ${this.currentLevel.width} ${this.currentLevel.height}`;
    },

    boardStyle() {
      // Keep the board on a fixed pixel scale: max 1200px wide and 600px tall.
      // The final square edge length is the smaller of width-based and height-based splits.
      return {
        "--cols": this.currentLevel.width,
        "--rows": this.currentLevel.height,
        "--cell-size": `min(calc(var(--board-max-width) / ${this.currentLevel.width}), calc(var(--board-max-height) / ${this.currentLevel.height}))`
      };
    },

    endpoints() {
      const endpoints = {};
      this.currentLevel.pairs.forEach((pair) => {
        pair.points.forEach(([x, y]) => {
          endpoints[keyOf(x, y)] = pair.id;
        });
      });
      return endpoints;
    },

    gridLines() {
      return buildGridLines(this.currentLevel.width, this.currentLevel.height);
    },

    renderedRemovedEdges() {
      return (this.currentLevel.removedEdges ?? []).map((edge) => edgeRenderData(edge)).filter(Boolean);
    },

    renderedPathLines() {
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
      const nodes = [];
      const filledNodes = this.getFilledNodes();
      const extendableEnds = this.getExtendableEnds();

      for (let y = 0; y <= this.currentLevel.height; y += 1) {
        for (let x = 0; x <= this.currentLevel.width; x += 1) {
          const key = keyOf(x, y);
          const pairId = this.endpoints[key];
          const endpoint = pairId ? this.getPair(pairId) : null;
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
              "path-node": filledNodes.has(key),
              active: this.isActiveNode(x, y),
              extendable: extendableEnds.has(key)
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
        "--preview-rows": this.creatorState.height
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
      for (let y = 0; y <= this.creatorState.height; y += 1) {
        for (let x = 0; x <= this.creatorState.width; x += 1) {
          const pointAtNode = this.getCreatorPointAt(x, y);
          const point = pointAtNode ? this.pointDefinitions[pointAtNode.pairId] : null;
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
