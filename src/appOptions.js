import { appConfig, fallbackLevel, pointDefinitions, themes } from "./config.js";
import { computed } from "./computed.js";
import { creatorMethods } from "./creatorMethods.js";
import { methods } from "./methods.js";
import { routes } from "./router.js";
import { cloneLevel, hydrateLevel } from "./services/levels.js";
import AppNav from "./components/AppNav.vue";


export default {
  components: {
    AppNav
  },

  data() {
    const initialLevel = hydrateLevel(fallbackLevel);
    const pairIds = Object.keys(pointDefinitions).slice(0, 5);

    return {
      pointDefinitions,
      assetBase: import.meta.env.BASE_URL,
      activeView: "challenge",
      viewTabs: routes,
      canUseLevelEditor: false,
      themes,
      selectedTheme: appConfig.theme.default,
      levels: [initialLevel],
      currentLevelIndex: 0,
      currentLevel: cloneLevel(initialLevel),
      isLevelPickerOpen: false,
      levelDifficultyFilter: "all",
      levelCompletionFilter: "all",
      completedLevels: {},
      paths: {},
      activePair: null,
      isDrawing: false,
      pointerMoved: false,
      pointerPreview: null,
      timerStartedAt: null,
      timerElapsedMs: 0,
      timerIntervalId: null,
      isWon: false,
      isPersonalBest: false,
      creatorPairCount: 5,
      creatorState: {
        gridType: "square",
        difficulty: 1,
        width: 5,
        height: 5,
        pairIds,
        activePairId: pairIds[0],
        mode: "mark",
        points: {},
        removedEdges: [],
        answers: {}
      },
      previewHint: "点交点可放置或删除色点；标记模式：点击格子边标出答案线路。",
      isLevelOutputVisible: false,
      levelOutput: ""
    };
  },

  computed,
  async mounted() {
    this.applyBackgroundConfig();
    this.applyTheme(this.selectedTheme);
    this.loadCompletedLevels();
    await this.detectLevelEditorAvailability();
    await this.loadLevels();
    this.loadLevel(0);
    if (this.canUseLevelEditor) {
      this.writeLevelTemplate(false);
    }
  },

  beforeUnmount() {
    this.stopGameTimer();
  },

  watch: {
    activeView(view) {
      if (view === "creator" && !this.canUseLevelEditor) {
        this.activeView = "challenge";
      }
    },
    selectedTheme(themeId) {
      this.applyTheme(themeId);
    }
  },

  methods: {
    ...methods,
    ...creatorMethods
  }
};
