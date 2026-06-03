import { appConfig, defaultPointPaletteId, pointDefinitions, pointPalettes, themes } from "../config/index.js";
import { computed } from "./computed.js";
import { creatorMethods } from "../editor/methods.js";
import { methods } from "./methods.js";
import { routes } from "./router.js";
import AppNav from "../components/AppNav.vue";
import faviconUrl from "../../favicon.ico";


export default {
  components: {
    AppNav
  },

  data() {
    const pairIds = Object.keys(pointDefinitions).slice(0, 5);

    return {
      pointDefinitions,
      pointPalettes,
      faviconUrl,
      activeView: "challenge",
      viewTabs: routes,
      canUseLevelEditor: false,
      themes,
      selectedTheme: appConfig.theme.default,
      selectedPalette: pointPalettes[appConfig.colors.palette] ? appConfig.colors.palette : defaultPointPaletteId,
      isLevelsLoading: true,
      levels: [],
      currentLevelIndex: -1,
      currentLevel: null,
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
      isVictoryDismissed: false,
      shareStatusText: "分享",
      isPersonalizationOpen: false,
      mapStyle: { ...appConfig.mapStyle },
      creatorPairCount: 5,
      creatorState: {
        name: "",
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
    if (this.levels.length > 0) {
      this.loadLevel(0);
    }
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
    },
    selectedPalette(paletteId) {
      this.applyPointPalette(paletteId);
    }
  },

  methods: {
    ...methods,
    ...creatorMethods
  }
};
