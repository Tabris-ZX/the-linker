import { appConfig, defaultPointPaletteId, pointDefinitions, pointPalettes, themes } from "../config/index.js";
import { computed } from "./computed.js";
import { editorMethods } from "../editor/methods.js";
import { methods } from "./methods.js";
import AppNav from "../components/AppNav.vue";
import PlayView from "../views/PlayView.vue";
import EditorView from "../views/EditorView.vue";
import PersonalizationView from "../views/PersonalizationView.vue";
import RuleView from "../views/RuleView.vue";
import faviconUrl from "../../favicon.ico";

export const EDITOR_PAIR_LIMIT = 16;

const viewTabs = [
  { id: "play", label: "关卡游玩" },
  { id: "editor", label: "关卡编辑器" }
];

export default {
  components: {
    AppNav,
    PlayView,
    EditorView,
    PersonalizationView,
    RuleView
  },

  /**
   * 向子组件注入根应用实例，便于视图层复用状态和方法。
   *
   * @returns {{ app: object }} provide 数据。
   */
  provide() {
    return {
      app: this
    };
  },

  /**
   * 初始化应用、挑战和编辑器状态。
   *
   * @returns {object} Vue 组件响应式数据。
   */
  data() {
    const pairIds = Object.keys(pointDefinitions).slice(0, 5);

    return {
      pointDefinitions,
      pointPalettes,
      faviconUrl,
      activeView: "play",
      viewTabs,
      canUseLevelEditor: false,
      themes,
      selectedTheme: appConfig.theme.default,
      selectedPalette: pointPalettes[appConfig.colors.palette] ? appConfig.colors.palette : defaultPointPaletteId,
      isInitialLevelLoading: true,
      isLevelsLoading: true,
      isLevelPageLoading: false,
      levels: [],
      levelDetails: {},
      levelTotalCount: 0,
      loadedLevelPages: {},
      currentLevelIndex: -1,
      currentLevel: null,
      isLevelPickerOpen: false,
      appDialog: {
        type: "",
        title: "",
        message: "",
        inputValue: "",
        captchaValue: "",
        status: ""
      },
      levelCategoryFilter: "all",
      levelDifficultyFilter: "all",
      levelCompletionFilter: "all",
      levelPickerScrollTop: 0,
      isDeveloperMode: false,
      developerStatusText: "",
      developerTokenFailedAttempts: 0,
      developerTokenCooldownUntil: 0,
      developerTokenCaptcha: null,
      completedLevels: {},
      paths: {},
      activePair: null,
      isDrawing: false,
      pointerMoved: false,
      pointerPreview: null,
      timerStartedAt: null,
      timerElapsedMs: 0,
      timerIntervalId: null,
      dialogTick: 0,
      dialogIntervalId: null,
      isWon: false,
      isPersonalBest: false,
      isVictoryDismissed: false,
      shareStatusText: "分享",
      nextLevelStatusText: "",
      clearDataStatusText: "",
      isClearDataConfirming: false,
      isRulePanelOpen: false,
      isPersonalizationOpen: false,
      mapStyle: { ...appConfig.mapStyle },
      editorPairLimit: EDITOR_PAIR_LIMIT,
      editorPairCount: 5,
      editorState: {
        name: "",
        gridType: "square",
        difficulty: 1,
        width: 5,
        height: 5,
        radius: 3,
        pairIds,
        activePairId: pairIds[0],
        mode: "mark",
        points: {},
        removedEdges: [],
        answers: {}
      },
      editorEditingLevelId: "",
      previewHint: "点交点可放置或删除色点；标记模式：点击格子边标出答案线路。",
      isLevelOutputVisible: false,
      levelOutput: ""
    };
  },

  computed,
  /**
   * 应用挂载后加载配置、完成记录和关卡数据。
   *
   * @returns {Promise<void>}
   */
  async mounted() {
    this.applyBackgroundConfig();
    this.applyTheme(this.selectedTheme);
    this.loadCompletedLevels();
    this.loadDeveloperTokenCooldown();
    try {
      await this.detectLevelEditorAvailability();
      await this.loadLevels();
      if (this.levels.length > 0) {
        await this.loadLevel(await this.getInitialLevelIndexAsync());
      }
      if (this.canUseLevelEditor) {
        this.writeLevelTemplate(false);
      }
    } finally {
      this.isInitialLevelLoading = false;
    }
    this.dialogIntervalId = window.setInterval(() => {
      this.dialogTick += 1;
      if (this.appDialog.type === "developer-token" && this.developerTokenCooldownUntil > 0) {
        this.appDialog.status = this.getDeveloperTokenCooldownText();
      }
    }, 1000);
  },

  /**
   * 组件卸载前清理计时器。
   *
   * @returns {void}
   */
  beforeUnmount() {
    this.stopGameTimer();
    if (this.dialogIntervalId) {
      window.clearInterval(this.dialogIntervalId);
    }
  },

  watch: {
    /**
     * 视图切换时阻止进入不可用的编辑器。
     *
     * @param {string} view 当前视图 id。
     * @returns {void}
     */
    async activeView(view) {
      if (view === "editor" && !this.canUseLevelEditor) {
        this.activeView = "play";
        return;
      }
    },
    /**
     * 主题选择变化时立即应用主题。
     *
     * @param {string} themeId 主题 id。
     * @returns {void}
     */
    selectedTheme(themeId) {
      this.applyTheme(themeId);
    },
    /**
     * 点位调色板变化时立即应用调色板。
     *
     * @param {string} paletteId 调色板 id。
     * @returns {void}
     */
    selectedPalette(paletteId) {
      this.applyPointPalette(paletteId);
    },
    /**
     * 关卡筛选变化时，继续按页加载直到选择器有可显示内容。
     *
     * @returns {void}
     */
    levelCategoryFilter() {
      this.loadLevelsUntilPickerHasVisibleItems();
    },
    /**
     * 难度筛选变化时，继续按页加载直到选择器有可显示内容。
     *
     * @returns {void}
     */
    levelDifficultyFilter() {
      this.loadLevelsUntilPickerHasVisibleItems();
    },
    /**
     * 完成状态筛选变化时，继续按页加载直到选择器有可显示内容。
     *
     * @returns {void}
     */
    levelCompletionFilter() {
      this.loadLevelsUntilPickerHasVisibleItems();
    }
  },

  methods: {
    ...methods,
    ...editorMethods
  }
};
