<template>
  <section class="view view-editor is-active bridge-editor-view" aria-labelledby="bridge-editor-title">
    <section class="editor-panel app-card bridge-editor-panel">
      <h2 id="bridge-editor-title">数桥编辑器</h2>

      <form class="editor-form bridge-editor-form" @submit.prevent="$emit('save', normalizedLevel)">
        <fieldset class="editor-form-group editor-form-group-main">
          <legend>基础信息</legend>
          <label class="editor-name-field">
            名称
            <input v-model.trim="draft.name" type="text" placeholder="数桥关卡">
          </label>
        </fieldset>

        <fieldset class="editor-form-group editor-form-group-grid">
          <legend>地图参数</legend>
          <label class="editor-size-field">
            宽度
            <input v-model.number="draft.width" type="number" min="2" max="30" @input="clampBoard">
          </label>
          <label class="editor-size-field">
            高度
            <input v-model.number="draft.height" type="number" min="2" max="30" @input="clampBoard">
          </label>
          <label class="editor-difficulty-field">
            难度
            <input v-model.number="draft.difficulty" type="number" min="1" max="5" @input="syncDifficulty">
          </label>
        </fieldset>

        <fieldset class="editor-form-group bridge-island-edit-group">
          <legend>岛屿编辑</legend>
          <div class="bridge-editor-selected">
            <span>{{ selectedIsland ? `岛屿 ${selectedIsland.x}, ${selectedIsland.y}` : "未选择岛屿" }}</span>
            <div class="bridge-editor-stepper">
              <button type="button" :disabled="!selectedIsland" @click="adjustSelectedValue(-1)">-</button>
              <strong>{{ selectedIsland?.value ?? 0 }}</strong>
              <button type="button" :disabled="!selectedIsland" @click="adjustSelectedValue(1)">+</button>
            </div>
            <button type="button" :disabled="!selectedIsland" @click="deleteSelectedIsland">删除岛屿</button>
          </div>
        </fieldset>

        <div class="editor-form-actions" aria-label="数桥关卡操作">
          <button type="submit">保存关卡</button>
          <button type="button" @click="newLevel">新建</button>
          <button type="button" @click="exportJson">生成 JSON</button>
          <button type="button" @click="clearIslands">清空内容</button>
          <label class="editor-import-button">
            导入 JSON
            <input type="file" accept="application/json,.json" @change="importJson">
          </label>
        </div>
      </form>

      <p class="preview-hint">{{ statusText || "点击棋盘放置岛屿，点击岛屿选择后调整数字。" }}</p>

      <div class="editor-workspace bridge-editor-workspace">
        <section class="preview-panel" aria-label="数桥关卡预览">
          <div class="preview-board-wrap">
            <div class="bridge-editor-board board" :style="boardStyle" @click="handleBoardClick">
              <svg class="edge-grid" :viewBox="`0 0 ${draft.width} ${draft.height}`" preserveAspectRatio="none" aria-hidden="true">
                <path :d="gridPathD"></path>
              </svg>
              <button
                v-for="node in editorNodes"
                :key="node.key"
                type="button"
                class="node bridge-node endpoint-node bridge-editor-island"
                :class="{ 'is-selected': node.island.id === selectedIslandId }"
                :style="node.style"
                :aria-label="`岛 ${node.island.id}，数字 ${node.island.value}`"
                @click.stop="selectIsland(node.island.id)"
              >
                <span class="dot bridge-dot">
                  <span class="dot-label">{{ node.island.value }}</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <aside class="bridge-editor-side" aria-label="岛屿列表">
          <strong>岛屿列表</strong>
          <button
            v-for="island in sortedIslands"
            :key="island.id"
            type="button"
            class="bridge-island-row"
            :class="{ 'is-active': island.id === selectedIslandId }"
            @click="selectIsland(island.id)"
          >
            <span>{{ island.x }}, {{ island.y }}</span>
            <strong>{{ island.value }}</strong>
          </button>
          <p v-if="!sortedIslands.length">暂无岛屿</p>
        </aside>
      </div>

      <section v-if="output" class="level-output-panel" aria-label="生成的数桥 JSON">
        <div class="level-output-header">
          <strong>生成的数桥 JSON</strong>
          <button type="button" @click="copyOutput">复制 JSON</button>
        </div>
        <textarea class="level-output-textarea" :value="output" readonly spellcheck="false" aria-label="生成的数桥 JSON 文本"></textarea>
      </section>
    </section>
  </section>
</template>

<script>
export default {
  name: "BridgerEditor",
  props: {
    level: {
      type: Object,
      required: true
    },
    statusText: {
      type: String,
      default: ""
    }
  },
  emits: ["save"],
  data() {
    return {
      draft: this.cloneLevel(this.level),
      selectedIslandId: "",
      output: ""
    };
  },
  computed: {
    selectedIsland() {
      return this.draft.islands.find((island) => island.id === this.selectedIslandId) ?? null;
    },
    sortedIslands() {
      return [...this.draft.islands].sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
    },
    normalizedLevel() {
      return this.cloneLevel(this.draft);
    },
    editorNodes() {
      return this.sortedIslands.map((island) => ({
        key: island.id,
        island,
        style: { "--node-x": island.x, "--node-y": island.y }
      }));
    },
    boardStyle() {
      return {
        "--bridge-cols": this.draft.width,
        "--bridge-rows": this.draft.height,
        "--cols": this.draft.width,
        "--rows": this.draft.height,
        "--cell-size": `calc(min(calc(var(--board-max-width) / ${this.draft.width}), calc(var(--board-max-height) / ${this.draft.height})) * var(--map-board-scale))`
      };
    },
    gridPathD() {
      const paths = [];
      for (let x = 0; x <= this.draft.width; x += 1) paths.push(`M ${x} 0 L ${x} ${this.draft.height}`);
      for (let y = 0; y <= this.draft.height; y += 1) paths.push(`M 0 ${y} L ${this.draft.width} ${y}`);
      return paths.join(" ");
    }
  },
  watch: {
    level: {
      deep: true,
      handler(level) {
        this.draft = this.cloneLevel(level);
        this.selectedIslandId = "";
        this.output = "";
      }
    }
  },
  methods: {
    cloneLevel(level) {
      const width = this.clampInt(level?.width, 2, 30, 7);
      const height = this.clampInt(level?.height, 2, 30, 7);
      return {
        id: String(level?.id ?? ""),
        name: String(level?.name ?? ""),
        difficulty: this.clampInt(level?.difficulty, 1, 5, 1),
        width,
        height,
        islands: (level?.islands ?? []).map((island, index) => ({
          id: String(island.id || `i${index + 1}`),
          x: this.clampInt(island.x, 0, width, 0),
          y: this.clampInt(island.y, 0, height, 0),
          value: this.clampInt(island.value, 0, 8, 1)
        }))
      };
    },
    clampBoard() {
      this.draft.width = this.clampInt(this.draft.width, 2, 30, 7);
      this.draft.height = this.clampInt(this.draft.height, 2, 30, 7);
      this.draft.islands = this.draft.islands.map((island) => ({
        ...island,
        x: this.clampInt(island.x, 0, this.draft.width, 0),
        y: this.clampInt(island.y, 0, this.draft.height, 0)
      }));
    },
    syncDifficulty() {
      this.draft.difficulty = this.clampInt(this.draft.difficulty, 1, 5, 1);
    },
    handleBoardClick(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = this.clampInt(((event.clientX - rect.left) / rect.width) * this.draft.width, 0, this.draft.width, 0);
      const y = this.clampInt(((event.clientY - rect.top) / rect.height) * this.draft.height, 0, this.draft.height, 0);
      const existing = this.draft.islands.find((island) => island.x === x && island.y === y);
      if (existing) {
        this.selectIsland(existing.id);
        return;
      }
      const island = {
        id: this.nextIslandId(),
        x,
        y,
        value: 1
      };
      this.draft.islands = [...this.draft.islands, island];
      this.selectedIslandId = island.id;
    },
    selectIsland(islandId) {
      this.selectedIslandId = this.selectedIslandId === islandId ? "" : islandId;
    },
    adjustSelectedValue(delta) {
      if (!this.selectedIsland) return;
      this.draft.islands = this.draft.islands.map((island) => (
        island.id === this.selectedIslandId
          ? { ...island, value: this.clampInt(island.value + delta, 0, 8, island.value) }
          : island
      ));
    },
    deleteSelectedIsland() {
      if (!this.selectedIsland) return;
      this.draft.islands = this.draft.islands.filter((island) => island.id !== this.selectedIslandId);
      this.selectedIslandId = "";
    },
    newLevel() {
      this.draft = {
        id: "",
        name: "",
        difficulty: 1,
        width: 7,
        height: 7,
        islands: []
      };
      this.selectedIslandId = "";
      this.output = "";
    },
    clearIslands() {
      this.draft.islands = [];
      this.selectedIslandId = "";
      this.output = "";
    },
    exportJson() {
      this.output = JSON.stringify(this.normalizedLevel, null, 2);
    },
    async copyOutput() {
      if (!this.output) return;
      await navigator.clipboard?.writeText(this.output);
    },
    async importJson(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.draft = this.cloneLevel(JSON.parse(await file.text()));
        this.selectedIslandId = "";
        this.output = "";
      } finally {
        event.target.value = "";
      }
    },
    nextIslandId() {
      const used = new Set(this.draft.islands.map((island) => island.id));
      for (let index = 1; index < 1000; index += 1) {
        const id = `i${index}`;
        if (!used.has(id)) return id;
      }
      return `i${Date.now()}`;
    },
    clampInt(value, min, max, fallback) {
      const number = Math.round(Number(value));
      if (!Number.isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, number));
    }
  }
};
</script>
