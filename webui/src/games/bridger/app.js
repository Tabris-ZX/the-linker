import BridgerBoardStage from "./components/BridgerBoardStage.vue";
import BridgerEditor from "./components/BridgerEditor.vue";
import { computed } from "./computed.js";
import { methods } from "./methods.js";
import PlayView from "./views/PlayView.vue";
import EditorView from "./views/EditorView.vue";
import { createEmptyBridgerState } from "./utils.js";

export default {
  components: {
    BridgerBoardStage,
    BridgerEditor,
    PlayView,
    EditorView
  },
  provide() {
    return {
      app: this
    };
  },
  data() {
    return {
      currentLevel: this.createEmptyLevel(),
      levelIndex: [],
      bridgerState: createEmptyBridgerState(),
      selectedIslandId: "",
      isLevelPanelOpen: false,
      activeView: "bridger",
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
    await this.loadInitialLevel();
    if (this.startInEditor) this.openEditor();
    this.emitStatusChange();
  },
  computed,
  watch: {
    isDeveloperMode(isDeveloperMode) {
      if (!isDeveloperMode && this.activeView === "editor") this.activeView = "bridger";
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
  methods
};
