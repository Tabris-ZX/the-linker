<template>
  <section class="bridge-game" aria-label="数桥">
    <GameToolbar
      title="数桥"
      @back="$emit('back-home')"
    />

    <section class="bridge-panel">
      <BridgeEditor
        v-if="activeView === 'editor'"
        :level="currentLevel"
        :status-text="editorStatusText"
        @save="saveEditorLevel"
      />
      <BridgeBoardStage
        v-else
        :level="currentLevel"
        :state="bridgeState"
        :selected-island-id="selectedIslandId"
        @select-island="selectIsland"
        @cycle-bridge="cycleBridge"
        @clear-selection="selectedIslandId = ''"
      />
      <LevelGridPicker
        :is-open="isLevelPanelOpen"
        title="数桥关卡"
        :levels="pickerLevels"
        :active-level-id="currentLevel.id"
        :difficulty-filter="levelDifficultyFilter"
        :completion-filter="levelCompletionFilter"
        :completion-options="completionOptions"
        @close="isLevelPanelOpen = false"
        @select-level="selectLevel"
        @update:difficultyFilter="levelDifficultyFilter = $event"
        @update:completionFilter="levelCompletionFilter = $event"
      />

      <div v-if="isWon" class="victory-mark bridge-victory" role="status" aria-live="polite" aria-label="数桥通关">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功</span>
            <strong>用时 {{ timerText }}</strong>
          </div>
        </div>
        <div class="victory-actions">
          <button type="button" class="victory-share-button" @click="nextLevel">下一关</button>
          <button type="button" class="close-button" @click="isWon = false">关闭</button>
        </div>
      </div>
    </section>
  </section>
</template>

<script>
import BridgeBoardStage from "../components/BridgeBoardStage.vue";
import BridgeEditor from "../components/BridgeEditor.vue";
import GameToolbar from "../../../shared/components/GameToolbar.vue";
import LevelGridPicker from "../../../shared/components/LevelGridPicker.vue";
import { bridgeLevels, getBridgeLevelIndex } from "../bridgeLevels.js";
import { createEmptyBridgeState, cycleBridgeBetween, isBridgeSolved } from "../bridgeRules.js";
import { loadBridgeLevelDetail, loadBridgeLevelIndex, saveBridgeLevel } from "../services/levels.js";

export default {
  name: "BridgeView",
  components: {
    BridgeBoardStage,
    BridgeEditor,
    LevelGridPicker,
    GameToolbar
  },
  props: {
    developerToken: {
      type: String,
      default: ""
    },
    isDeveloperMode: {
      type: Boolean,
      default: false
    },
    startInEditor: {
      type: Boolean,
      default: false
    }
  },
  emits: ["back-home", "status-change"],
  data() {
    const level = bridgeLevels[0];
    return {
      currentLevel: level,
      levelIndex: getBridgeLevelIndex(),
      bridgeState: createEmptyBridgeState(),
      selectedIslandId: "",
      isLevelPanelOpen: false,
      activeView: "play",
      levelDifficultyFilter: "all",
      levelCompletionFilter: "all",
      completedLevels: {},
      editorStatusText: "",
      startedAt: 0,
      elapsedMs: 0,
      timerId: null,
      isWon: false
    };
  },
  async mounted() {
    this.loadCompletedLevels();
    this.levelIndex = await loadBridgeLevelIndex();
    const firstLevelId = this.levelIndex[0]?.id ?? this.currentLevel.id;
    const level = await loadBridgeLevelDetail(firstLevelId);
    if (level) this.currentLevel = level;
    if (this.startInEditor) this.openEditor();
    this.emitStatusChange();
  },
  computed: {
    pickerLevels() {
      return this.levelIndex.map((level) => ({
        ...level,
        isCompleted: Boolean(this.completedLevels[level.id]),
        metaText: this.completedLevels[level.id] ? "已完成" : `难度 ${level.difficulty}`
      }));
    },
    completionOptions() {
      return [
        { value: "all", label: "全部" },
        { value: "new", label: "未完成" },
        { value: "done", label: "已完成" }
      ];
    },
    timerText() {
      const totalSeconds = Math.floor(this.elapsedMs / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    }
  },
  watch: {
    isDeveloperMode(isDeveloperMode) {
      if (!isDeveloperMode && this.activeView === "editor") this.activeView = "play";
      this.emitStatusChange();
    },
    startInEditor(enabled) {
      if (enabled) this.openEditor();
    },
    activeView() {
      this.emitStatusChange();
    },
    timerText() {
      this.emitStatusChange();
    },
    currentLevel: {
      deep: true,
      handler() {
        this.emitStatusChange();
      }
    }
  },
  beforeUnmount() {
    this.stopTimer();
  },
  methods: {
    toggleLevelPanel() {
      this.isLevelPanelOpen = !this.isLevelPanelOpen;
    },
    async selectLevel(levelId) {
      const level = await loadBridgeLevelDetail(levelId);
      if (!level) return;
      this.currentLevel = level;
      this.isLevelPanelOpen = false;
      this.activeView = "play";
      this.resetLevel();
    },
    openEditor() {
      if (!this.isDeveloperMode) return;
      this.activeView = "editor";
      this.editorStatusText = "";
      this.emitStatusChange();
    },
    openPlay() {
      this.activeView = "play";
      this.editorStatusText = "";
      this.emitStatusChange();
    },
    applyDeveloperLogout() {
      this.activeView = "play";
      this.editorStatusText = "";
      this.emitStatusChange();
    },
    emitStatusChange() {
      this.$emit("status-change", {
        title: "数桥",
        timerText: this.timerText,
        levelLabel: this.currentLevel?.name || this.currentLevel?.id || "未选择",
        canReset: true,
        canSelectLevel: true,
        isEditor: this.activeView === "editor"
      });
    },
    async saveEditorLevel(level) {
      if (!this.developerToken) {
        this.editorStatusText = "请先解锁开发者模式";
        return;
      }
      try {
        const saved = await saveBridgeLevel(level, this.developerToken, { mode: level.id ? "update" : "create" });
        if (!saved) throw new Error("保存结果无效");
        this.currentLevel = saved;
        this.levelIndex = await loadBridgeLevelIndex();
        this.editorStatusText = `已保存 ${saved.id}`;
      } catch (error) {
        this.editorStatusText = error.message || "保存失败";
      }
    },
    selectIsland(islandId) {
      this.startTimer();
      if (!this.selectedIslandId) {
        this.selectedIslandId = islandId;
        return;
      }
      if (this.selectedIslandId === islandId) {
        this.selectedIslandId = "";
        return;
      }
      this.cycleBridge(this.selectedIslandId, islandId);
      this.selectedIslandId = "";
    },
    cycleBridge(leftId, rightId) {
      this.startTimer();
      const nextState = cycleBridgeBetween(this.currentLevel, this.bridgeState, leftId, rightId);
      if (nextState === this.bridgeState) return;
      this.bridgeState = nextState;
      this.evaluate();
    },
    resetLevel() {
      this.bridgeState = createEmptyBridgeState();
      this.selectedIslandId = "";
      this.elapsedMs = 0;
      this.startedAt = 0;
      this.isWon = false;
      this.stopTimer();
    },
    nextLevel() {
      const index = this.levelIndex.findIndex((item) => item.id === this.currentLevel.id);
      const next = this.levelIndex[(index + 1) % this.levelIndex.length];
      if (next) this.selectLevel(next.id);
    },
    evaluate() {
      const solved = isBridgeSolved(this.currentLevel, this.bridgeState);
      if (!solved) {
        this.isWon = false;
        return;
      }
      this.isWon = true;
      this.stopTimer();
      this.markCompleted();
    },
    startTimer() {
      if (this.timerId || this.isWon) return;
      this.startedAt = Date.now() - this.elapsedMs;
      this.timerId = window.setInterval(() => {
        this.elapsedMs = Date.now() - this.startedAt;
      }, 500);
    },
    stopTimer() {
      if (!this.timerId) return;
      window.clearInterval(this.timerId);
      this.timerId = null;
      if (this.startedAt) this.elapsedMs = Date.now() - this.startedAt;
    },
    markCompleted() {
      try {
        const raw = window.localStorage.getItem("the-linker-bridge-completed-levels") || "{}";
        const completed = JSON.parse(raw);
        completed[this.currentLevel.id] = { completedAt: new Date().toISOString(), elapsedMs: this.elapsedMs };
        window.localStorage.setItem("the-linker-bridge-completed-levels", JSON.stringify(completed));
        this.completedLevels = completed;
      } catch {
        // Ignore unavailable storage.
      }
    },
    loadCompletedLevels() {
      try {
        this.completedLevels = JSON.parse(window.localStorage.getItem("the-linker-bridge-completed-levels") || "{}");
      } catch {
        this.completedLevels = {};
      }
    }
  }
};
</script>
