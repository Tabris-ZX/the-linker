<template>
  <div class="bridge-board board" :style="boardStyle" aria-label="数桥棋盘" @mouseleave="handleBoardLeave">
    <svg class="edge-grid" :viewBox="`0 0 ${level.width} ${level.height}`" preserveAspectRatio="none" aria-hidden="true">
      <path :d="gridPathD"></path>
    </svg>

    <button
      v-for="cell in switchCells"
      :key="cell.key"
      type="button"
      class="bridge-cell"
      :class="[`is-${cell.orientation}`, 'has-both']"
      :style="cellStyle(cell)"
      :aria-label="`空格 ${cell.x}, ${cell.y}，${cell.orientation === 'vertical' ? '纵向' : '横向'}桥位`"
      @click="handleCellClick(cell)"
    >
      <span class="bridge-cell-preview"></span>
    </button>
    <span
      v-for="cell in previewCells"
      :key="cell.key"
      class="bridge-cell"
      :class="`is-${cell.orientation}`"
      :style="cellStyle(cell)"
      aria-hidden="true"
    >
      <span class="bridge-cell-preview"></span>
    </span>

    <button
      v-for="slot in bridgeSlots"
      :key="slot.key"
      type="button"
      class="bridge-slot"
      :class="[`is-${slot.orientation}`, { 'is-active': slot.count > 0, 'is-hover-reachable': isHoverReachable(slot) }]"
      :style="slotStyle(slot)"
      :aria-label="`桥位 ${slot.left.id}-${slot.right.id}，当前 ${slot.count}`"
      @click="$emit('cycle-bridge', slot.left.id, slot.right.id)"
    ></button>

    <div class="bridge-visual-layer" aria-hidden="true">
      <span
        v-for="line in bridgeVisualLines"
        :key="line.key"
        class="bridge-visual-line"
        :class="[`is-${line.orientation}`, line.className]"
        :style="bridgeVisualStyle(line)"
      ></span>
    </div>

    <button
      v-for="node in islandNodes"
      :key="node.key"
      type="button"
      class="node bridge-node"
      :class="node.classes"
      :style="node.style"
      :aria-label="node.island ? `岛 ${node.island.id}，剩余 ${node.remaining}` : `交点 ${node.x + 1}, ${node.y + 1}`"
      @click="handleNodeClick(node)"
      @mouseenter="handleNodeHover(node)"
      @mouseleave="handleNodeLeave(node)"
    >
      <span
        v-if="node.island"
        class="dot bridge-dot"
        :style="node.dotStyle"
      >
        <span class="dot-label">{{ node.remaining }}</span>
      </span>
    </button>
    <span
      v-for="node in emptyNodes"
      :key="node.key"
      class="node bridge-node"
      :class="node.classes"
      :style="node.style"
      aria-hidden="true"
    ></span>
  </div>
</template>

<script>
import {
  canConnectIslands,
  getBridgeCellCandidates,
  getConnectableBridgePairs,
  getDefaultBridgeCellOrientation,
  getIslandBridgeCounts,
  getIslandStatus,
  getVisibleBridgePairs
} from "../bridgeRules.js";

export default {
  name: "BridgeBoard",
  props: {
    level: {
      type: Object,
      required: true
    },
    state: {
      type: Object,
      required: true
    },
    selectedIslandId: {
      type: String,
      default: ""
    }
  },
  emits: ["select-island", "cycle-bridge", "clear-selection"],
  data() {
    return {
      cellOrientations: {},
      hoveredIslandId: "",
      hoverTargetIslandId: "",
      isFinePointer: false
    };
  },
  computed: {
    boardStyle() {
      return {
        "--bridge-cols": this.level.width,
        "--bridge-rows": this.level.height,
        "--cols": this.level.width,
        "--rows": this.level.height,
        "--cell-size": `calc(min(calc(var(--board-max-width) / ${this.level.width}), calc(var(--board-max-height) / ${this.level.height})) * var(--map-board-scale))`
      };
    },
    bridges() {
      return getVisibleBridgePairs(this.level, this.state);
    },
    bridgeVisualLines() {
      return this.bridges.flatMap((bridge) => (
        this.bridgeLines(bridge).map((line) => ({
          ...bridge,
          key: `${bridge.key}-${line.className}`,
          className: line.className
        }))
      ));
    },
    gridPathD() {
      const paths = [];
      for (let x = 0; x <= this.level.width; x += 1) {
        paths.push(`M ${x} 0 L ${x} ${this.level.height}`);
      }
      for (let y = 0; y <= this.level.height; y += 1) {
        paths.push(`M 0 ${y} L ${this.level.width} ${y}`);
      }
      return paths.join(" ");
    },
    bridgeSlots() {
      const slots = new Map();
      getConnectableBridgePairs(this.level, this.state)
        .filter((slot) => slot.count > 0 || this.isHoverReachable(slot) || this.isHoverTargetReachable(slot))
        .forEach((slot) => slots.set(slot.key, slot));
      this.bridgeCells
        .map((cell) => cell.pair)
        .filter(Boolean)
        .forEach((slot) => slots.set(slot.key, slot));
      return [...slots.values()];
    },
    bridgeCells() {
      const cells = [];
      for (let y = 1; y < this.level.height; y += 1) {
        for (let x = 1; x < this.level.width; x += 1) {
          const candidates = getBridgeCellCandidates(this.level, this.state, x, y);
          const defaultOrientation = getDefaultBridgeCellOrientation(candidates);
          if (!defaultOrientation) continue;
          const key = `${x},${y}`;
          const storedOrientation = this.cellOrientations[key];
          const orientation = candidates[storedOrientation] ? storedOrientation : defaultOrientation;
          cells.push({
            key,
            x,
            y,
            orientation,
            pair: candidates[orientation],
            candidates,
            hasBoth: Boolean(candidates.vertical && candidates.horizontal)
          });
        }
      }
      return cells;
    },
    switchCells() {
      return this.bridgeCells.filter((cell) => cell.hasBoth);
    },
    previewCells() {
      return this.bridgeCells.filter((cell) => !cell.hasBoth);
    },
    islandByPosition() {
      return new Map((this.level.islands ?? []).map((island) => [`${island.x},${island.y}`, island]));
    },
    boardNodes() {
      const counts = getIslandBridgeCounts(this.level, this.state);
      const nodes = [];
      for (let y = 0; y <= this.level.height; y += 1) {
        for (let x = 0; x <= this.level.width; x += 1) {
          const island = this.islandByPosition.get(`${x},${y}`) ?? null;
          const current = island ? counts[island.id] ?? 0 : 0;
          const remaining = island ? island.value - current : 0;
          const status = island ? getIslandStatus(this.level, this.state, island.id) : "";
          nodes.push({
            key: `${x}-${y}`,
            x,
            y,
            island,
            current,
            remaining,
            style: { "--node-x": x, "--node-y": y },
            dotStyle: island ? { "--dot-color": this.getIslandColor(island) } : null,
            classes: {
              "endpoint-node": Boolean(island),
              "path-node": Boolean(current),
              "is-selected": island && this.selectedIslandId === island.id,
              "is-hovered": island && this.hoveredIslandId === island.id,
              "is-reachable": island && this.isIslandReachable(island.id),
              "is-under": status === "under",
              "is-met": status === "met",
              "is-over": status === "over"
            }
          });
        }
      }
      return nodes;
    },
    islandNodes() {
      return this.boardNodes.filter((node) => node.island);
    },
    emptyNodes() {
      return this.boardNodes.filter((node) => !node.island);
    }
  },
  watch: {
    level() {
      this.cellOrientations = {};
      this.hoveredIslandId = "";
      this.hoverTargetIslandId = "";
    },
    state() {
      this.cellOrientations = {};
      this.hoverTargetIslandId = "";
    }
  },
  mounted() {
    this.isFinePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;
  },
  methods: {
    getIslandColor() {
      return "var(--accent)";
    },
    handleNodeClick(node) {
      if (!node.island) return;
      if (
        this.isFinePointer
        && this.hoveredIslandId
        && this.hoveredIslandId !== node.island.id
        && canConnectIslands(this.level, this.state, this.hoveredIslandId, node.island.id)
      ) {
        this.$emit("cycle-bridge", this.hoveredIslandId, node.island.id);
        this.hoveredIslandId = "";
        return;
      }
      this.$emit("select-island", node.island.id);
    },
    handleNodeHover(node) {
      if (!this.isFinePointer || !node.island) return;
      if (
        this.hoveredIslandId
        && this.hoveredIslandId !== node.island.id
        && canConnectIslands(this.level, this.state, this.hoveredIslandId, node.island.id)
      ) {
        this.hoverTargetIslandId = node.island.id;
        return;
      }
      this.hoveredIslandId = node.island.id;
      this.hoverTargetIslandId = "";
    },
    handleNodeLeave(node) {
      if (!this.isFinePointer || !node.island) return;
      if (this.hoverTargetIslandId === node.island.id) {
        this.hoverTargetIslandId = "";
        return;
      }
      if (this.hoveredIslandId === node.island.id) {
        this.hoveredIslandId = "";
        this.hoverTargetIslandId = "";
      }
    },
    handleBoardLeave() {
      this.hoveredIslandId = "";
      this.hoverTargetIslandId = "";
      if (this.selectedIslandId) this.$emit("clear-selection");
    },
    bridgeLines(bridge) {
      if (bridge.count === 1) return [{ className: "bridge-line-main" }];
      return [
        { className: "bridge-line-a" },
        { className: "bridge-line-b" }
      ];
    },
    bridgeVisualStyle(line) {
      if (line.orientation === "horizontal") {
        return {
          left: `calc((100% / var(--bridge-cols)) * ${line.minX})`,
          top: `calc((100% / var(--bridge-rows)) * ${line.left.y})`,
          width: `calc((100% / var(--bridge-cols)) * ${line.maxX - line.minX})`
        };
      }
      return {
        left: `calc((100% / var(--bridge-cols)) * ${line.left.x})`,
        top: `calc((100% / var(--bridge-rows)) * ${line.minY})`,
        height: `calc((100% / var(--bridge-rows)) * ${line.maxY - line.minY})`
      };
    },
    handleCellClick(cell) {
      if (!cell.hasBoth) return;
      const nextOrientation = cell.orientation === "vertical" ? "horizontal" : "vertical";
      this.cellOrientations = { ...this.cellOrientations, [cell.key]: nextOrientation };
    },
    isHoverReachable(slot) {
      return this.isFinePointer
        && this.hoveredIslandId
        && this.hoverTargetIslandId
        && (slot.left.id === this.hoveredIslandId || slot.right.id === this.hoveredIslandId);
    },
    isHoverTargetReachable(slot) {
      return this.isFinePointer
        && this.hoveredIslandId
        && this.hoverTargetIslandId
        && (
          (slot.left.id === this.hoveredIslandId && slot.right.id === this.hoverTargetIslandId)
          || (slot.right.id === this.hoveredIslandId && slot.left.id === this.hoverTargetIslandId)
        );
    },
    isIslandReachable(islandId) {
      return this.isFinePointer
        && this.hoveredIslandId
        && this.hoverTargetIslandId === islandId
        && this.hoveredIslandId !== islandId
        && canConnectIslands(this.level, this.state, this.hoveredIslandId, islandId);
    },
    slotStyle(slot) {
      if (slot.orientation === "horizontal") {
        return {
          left: `calc((100% / var(--bridge-cols)) * ${slot.minX})`,
          top: `calc((100% / var(--bridge-rows)) * ${slot.left.y})`,
          width: `calc((100% / var(--bridge-cols)) * ${slot.maxX - slot.minX})`
        };
      }
      return {
        left: `calc((100% / var(--bridge-cols)) * ${slot.left.x})`,
        top: `calc((100% / var(--bridge-rows)) * ${slot.minY})`,
        height: `calc((100% / var(--bridge-rows)) * ${slot.maxY - slot.minY})`
      };
    },
    cellStyle(cell) {
      return {
        "--cell-x": cell.x,
        "--cell-y": cell.y
      };
    }
  }
};
</script>
