import { validateBridgerLevel } from "./editor-checker.js";
import { loadBridgerLevelDetail, loadBridgerLevelIndex, saveBridgerLevel } from "./services.js";
import { createEmptyBridgerState, cycleBridgerBetween, isBridgerSolved } from "./utils.js";

export const COMPLETED_LEVELS_STORAGE_KEY = "the-bridger-completed-levels";

export const methods = {
  createEmptyLevel() {
    return {
      id: "",
      name: "未选择关卡",
      difficulty: 1,
      gridType: "bridger",
      width: 7,
      height: 7,
      sourcePath: "",
      sourceCategory: "stable",
      islands: []
    };
  },
  async loadInitialLevel() {
    this.levelIndex = await loadBridgerLevelIndex();
    const firstLevelId = this.levelIndex[0]?.id ?? "";
    if (!firstLevelId) return;
    const level = await loadBridgerLevelDetail(firstLevelId);
    if (level) this.currentLevel = level;
  },
  toggleLevelPanel() {
    this.isLevelPanelOpen = !this.isLevelPanelOpen;
  },
  async selectLevel(levelId) {
    const level = await loadBridgerLevelDetail(levelId);
    if (!level) return;
    this.currentLevel = level;
    this.isLevelPanelOpen = false;
    this.activeView = "bridger";
    this.resetLevel();
  },
  openEditor() {
    if (!this.isDeveloperMode) return;
    this.activeView = "editor";
    this.editorStatusText = "";
    this.emitStatusChange();
  },
  openPlay() {
    this.activeView = "bridger";
    this.editorStatusText = "";
    this.emitStatusChange();
  },
  applyDeveloperLogout() {
    this.activeView = "bridger";
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
    const validationError = validateBridgerLevel(level);
    if (validationError) {
      this.editorStatusText = validationError;
      return;
    }
    try {
      const saved = await saveBridgerLevel(level, this.developerToken, { mode: level.id ? "update" : "create" });
      if (!saved) throw new Error("保存结果无效");
      this.currentLevel = saved;
      this.levelIndex = await loadBridgerLevelIndex();
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
    const nextState = cycleBridgerBetween(this.currentLevel, this.bridgerState, leftId, rightId);
    if (nextState === this.bridgerState) return;
    this.bridgerState = nextState;
    this.evaluate();
  },
  resetLevel() {
    this.bridgerState = createEmptyBridgerState();
    this.selectedIslandId = "";
    this.elapsedMs = 0;
    this.startedAt = 0;
    this.isWon = false;
    this.stopTimer();
  },
  nextLevel() {
    if (!this.levelIndex.length) return;
    const index = this.levelIndex.findIndex((item) => item.id === this.currentLevel.id);
    const next = this.levelIndex[(index + 1) % this.levelIndex.length];
    if (next) this.selectLevel(next.id);
  },
  evaluate() {
    const solved = isBridgerSolved(this.currentLevel, this.bridgerState);
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
      const raw = window.localStorage.getItem(COMPLETED_LEVELS_STORAGE_KEY) || "{}";
      const completed = JSON.parse(raw);
      completed[this.currentLevel.id] = { completedAt: new Date().toISOString(), elapsedMs: this.elapsedMs };
      window.localStorage.setItem(COMPLETED_LEVELS_STORAGE_KEY, JSON.stringify(completed));
      this.completedLevels = completed;
    } catch {
      // Ignore unavailable storage.
    }
  },
  loadCompletedLevels() {
    try {
      this.completedLevels = JSON.parse(window.localStorage.getItem(COMPLETED_LEVELS_STORAGE_KEY) || "{}");
    } catch {
      this.completedLevels = {};
    }
  }
};
