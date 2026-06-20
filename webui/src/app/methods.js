import { appConfig, defaultPointPaletteId } from "../config/index.js";
import { areAllPathsStructurallyValid, getAnswerEdges, getRequiredNodes, isLevelAnswerFilled, isPathStructurallyValid } from "../editor/checker.js";
import { fetchPresenceStats, reviewLevelRequest, sendPresenceHeartbeat, setDeveloperToken, verifyDeveloperToken } from "../router/levels.js";
import { cloneLevel, hydrateLevel, hydrateLevelIndexItem, loadLevelAnswers, loadLevelDetail, loadLevelIndex } from "../services/levels.js";
import { edgeKey, fromRenderPoint, getGridBounds, isAdjacent, keyOf, lineAttrs, positionToArray, samePoint, toRenderPoint } from "../utils/geometry.js";
import { clampNumber } from "../utils/object.js";
import { buildWeaveClueLinesFromBuckets, buildWeaveSubmissionResult } from "./weaveRules.js";

const COMPLETED_LEVELS_STORAGE_KEY = "the-linker-completed-levels";
const LAST_LEVEL_STORAGE_KEY = "the-linker-last-level-id";
const DEVELOPER_TOKEN_COOLDOWN_STORAGE_KEY = "the-linker-developer-token-cooldown-until";
const DEVELOPER_TOKEN_ATTEMPTS_STORAGE_KEY = "the-linker-developer-token-failed-attempts";
const PERSONALIZATION_STORAGE_KEY = "the-linker-personalization";
const GAME_STORAGE_KEY_PREFIX = "the-linker-";
const DEVELOPER_TOKEN_MAX_FAILED_ATTEMPTS = 3;
const DEVELOPER_TOKEN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const TOUCH_DOUBLE_TAP_MS = 320;
const TOUCH_DOUBLE_TAP_DISTANCE = 18;
const POINTER_DOUBLE_TAP_MS = 460;
const POINTER_DOUBLE_TAP_DISTANCE = 34;

const PRESENCE_CLIENT_STORAGE_KEY = "the-linker-presence-session-id";

function createPresenceClientId() {
  return window.crypto?.randomUUID?.() ?? String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

export const methods = {
    /**
     * 同步页面级视图状态，供移动端布局规则区分普通棋盘和织链工作台。
     *
     * @returns {void}
     */
    updateBodyViewState() {
      document.body.classList.toggle("is-weave-active", this.activeView === "weave-total");
    },

    /**
     * 根据当前设备方向判断是否需要旋转棋盘显示。
     *
     * @returns {void}
     */
    setupBoardOrientationWatcher() {
      if (!window.matchMedia) {
        this.prefersPortraitBoard = window.innerWidth < window.innerHeight;
        return;
      }
      const query = window.matchMedia("(max-width: 640px) and (orientation: portrait)");
      const update = () => {
        this.prefersPortraitBoard = Boolean(query.matches);
        this.boardPointerGeometry = null;
      };
      update();
      query.addEventListener?.("change", update);
      if (!query.addEventListener) query.addListener?.(update);
      this.boardOrientationQuery = query;
      this.boardOrientationQueryListener = update;
    },

    /**
     * 取消设备方向监听。
     *
     * @returns {void}
     */
    stopBoardOrientationWatcher() {
      const query = this.boardOrientationQuery;
      const listener = this.boardOrientationQueryListener;
      if (query && listener) {
        query.removeEventListener?.("change", listener);
        if (!query.removeEventListener) query.removeListener?.(listener);
      }
      this.boardOrientationQuery = null;
      this.boardOrientationQueryListener = null;
    },

    /**
     * 将逻辑坐标转换为棋盘显示坐标。
     *
     * @param {[number, number]} point 逻辑坐标。
     * @returns {[number, number]} 显示坐标。
     */
    toBoardDisplayPoint(point) {
      if (!this.activeBoardLevel) return point;
      const renderPoint = toRenderPoint(point, this.activeBoardLevel.gridType);
      if (!this.shouldRotateBoardDisplay) return renderPoint;
      const bounds = getGridBounds(this.activeBoardLevel);
      return [
        renderPoint[1] - bounds.minY,
        bounds.minX + bounds.width - renderPoint[0]
      ];
    },

    /**
     * 将棋盘显示坐标反推为逻辑坐标。
     *
     * @param {[number, number]} point 显示坐标。
     * @param {object} [bounds] 网格边界。
     * @returns {[number, number]} 逻辑坐标。
     */
    fromBoardDisplayPoint(point, bounds = getGridBounds(this.activeBoardLevel)) {
      if (!this.activeBoardLevel) return point;
      const renderPoint = this.shouldRotateBoardDisplay
        ? [
            bounds.minX + bounds.width - point[1],
            bounds.minY + point[0]
          ]
        : point;
      return fromRenderPoint(renderPoint, this.activeBoardLevel.gridType);
    },

    /**
     * 把边字符串转成棋盘上的可渲染线段数据。
     *
     * @param {string} edge 边 key。
     * @returns {{ key: string, attrs: object }|null} 渲染数据。
     */
    edgeDisplayRenderData(edge) {
      const points = edge.split("|").map((key) => key.split(",").map(Number));
      if (points.length !== 2 || points.some((point) => point.some(Number.isNaN))) return null;
      const from = this.toBoardDisplayPoint(points[0]);
      const to = this.toBoardDisplayPoint(points[1]);
      return {
        key: edge,
        attrs: lineAttrs(from, to)
      };
    },

    /**
     * 获取并缓存当前会话的 presence client id。
     *
     * @returns {string} client id。
     */
    getPresenceClientId() {
      if (this.presenceClientId) return this.presenceClientId;
      try {
        const storedClientId = window.sessionStorage.getItem(PRESENCE_CLIENT_STORAGE_KEY);
        this.presenceClientId = storedClientId || createPresenceClientId();
        window.sessionStorage.setItem(PRESENCE_CLIENT_STORAGE_KEY, this.presenceClientId);
      } catch {
        this.presenceClientId = createPresenceClientId();
      }
      return this.presenceClientId;
    },
    /**
     * 上报在线状态并同步开发者视图中的在线人数。
     *
     * @returns {Promise<void>}
     */
    async refreshPresence() {
      try {
        const heartbeat = await sendPresenceHeartbeat(this.getPresenceClientId());
        if (heartbeat?.clientId) this.presenceClientId = heartbeat.clientId;
        if (this.isDeveloperMode) {
          const stats = await fetchPresenceStats();
          this.onlineCount = Number(stats.onlineCount);
        }
      } catch (error) {
        if (this.isDeveloperMode) this.onlineCount = null;
      }
    },

    /** 启动在线心跳轮询。 */
    startPresencePolling() {
      if (this.presenceIntervalId) {
        this.refreshPresence();
        return;
      }
      this.refreshPresence();
      this.presenceIntervalId = window.setInterval(this.refreshPresence, 15000);
    },

    /** 停止在线心跳轮询。 */
    stopPresencePolling() {
      if (!this.presenceIntervalId) return;
      window.clearInterval(this.presenceIntervalId);
      this.presenceIntervalId = null;
    },
    /**
     * 检测当前会话是否允许使用关卡编辑器。
     *
     * @returns {Promise<void>}
     */
    async detectLevelEditorAvailability() {
      this.canUseLevelEditor = this.isDeveloperMode;

      if (!this.canUseLevelEditor && this.activeView === "editor") {
        this.activeView = "play";
      }
      if (!this.isDeveloperMode && this.activeView === "weave-total") {
        this.activeView = "play";
      }
    },

    /**
     * 初始化关卡目录并打开首个可用关卡。
     *
     * @returns {Promise<void>}
     */
    async initializeLevels() {
      this.isInitialLevelLoading = true;
      try {
        await this.detectLevelEditorAvailability();
        await this.loadLevels();
        if (this.levels.length > 0) {
          await this.loadLevel(await this.getInitialLevelIndexAsync());
        }
        if (this.canUseLevelEditor) {
          this.writeLevelTemplate(false);
        }
      } catch (error) {
        this.developerStatusText = error.message || "关卡目录加载失败";
      } finally {
        this.isInitialLevelLoading = false;
      }
    },

    /**
     * 刷新关卡目录并合并已缓存的完整关卡。
     *
     * @returns {Promise<void>}
     */
    async loadLevels() {
      this.isLevelsLoading = true;
      try {
        const indexLevels = await loadLevelIndex();
        const existingDetails = this.levelDetails ?? {};
        this.levels = indexLevels.map((item) => {
          const detail = existingDetails[this.getLevelCacheKey(item)];
          if (!detail) return item;
          return hydrateLevel({
            ...detail,
            name: item.name ?? detail.name,
            difficulty: item.difficulty ?? detail.difficulty,
            sourcePath: item.sourcePath,
            sourceCategory: item.sourceCategory
          }, this.pointDefinitions);
        });
        this.levelDetails = Object.fromEntries(
          indexLevels
            .map((item) => {
              const cacheKey = this.getLevelCacheKey(item);
              const detail = existingDetails[cacheKey];
              if (!detail) return null;
              return [cacheKey, hydrateLevel({
                ...detail,
                name: item.name ?? detail.name,
                difficulty: item.difficulty ?? detail.difficulty,
                sourcePath: item.sourcePath,
                sourceCategory: item.sourceCategory
              }, this.pointDefinitions)];
            })
            .filter(Boolean)
        );
        this.levelTotalCount = indexLevels.length;
      } catch (error) {
        this.developerStatusText = error.message || "关卡目录加载失败";
        throw error;
      } finally {
        this.isLevelsLoading = false;
      }
    },

    /**
     * 确保指定索引的关卡已加载完整内容。
     *
     * @param {number} index 关卡索引。
     * @returns {Promise<object|null>} 完整关卡。
     */
    /**
     * 按索引确保关卡详情已加载。
     *
     * @param {number} index 关卡索引。
     * @returns {Promise<object|null>} 关卡详情。
     */
    async ensureLevelDetail(index) {
      const item = this.levels[index];
      if (!item?.id) return null;
      if (Array.isArray(item.pairs) && !item.isLevelIndexItem) return hydrateLevel(item, this.pointDefinitions);
      const cacheKey = this.getLevelCacheKey(item);
      if (this.levelDetails[cacheKey]) return this.levelDetails[cacheKey];

      this.isLevelDetailLoading = true;
      try {
        const detail = hydrateLevel(await loadLevelDetail(item.id, item.sourcePath), this.pointDefinitions);
        this.levelDetails = {
          ...this.levelDetails,
          [this.getLevelCacheKey(detail)]: detail
        };
        this.levels = this.levels.map((level, levelIndex) => levelIndex === index ? detail : level);
        return detail;
      } finally {
        this.isLevelDetailLoading = false;
      }
    },

    /**
     * 获取关卡缓存和渲染唯一键。
     *
     * @param {object} level 关卡目录项或完整关卡。
     * @returns {string} 唯一键。
     */
    getLevelCacheKey(level) {
      return level?.sourcePath || level?.id || "";
    },

    /**
     * 按列表索引加载当前关卡并重置路径状态。
     *
     * @param {number} index 关卡索引。
     * @returns {Promise<void>}
     */
    async loadLevel(index) {
      if (!Number.isInteger(index) || index < 0) return;
      const level = await this.ensureLevelDetail(index);
      if (!level) return;

      this.currentLevelIndex = index;
      this.currentLevel = cloneLevel(level);
      this.hintAnswerEdgesByPair = null;
      this.hintAnswersCacheKey = "";
      this.isHintAnswerLoading = false;
      this.isLevelPickerOpen = false;
      this.isPersonalBest = false;
      this.saveLastLevelId(this.getLevelCacheKey(this.currentLevel));
      this.resetPaths();
      this.resetWeaveModeState();
      if (this.isHintModeEnabled) {
        await this.revealCorrectHintLines(false);
      }
    },

    /**
     * 获取上次打开的关卡索引，记录失效时回退到第一关。
     *
     * @returns {number} 初始关卡索引。
     */
    getInitialLevelIndex() {
      const firstVisibleIndex = this.levels.findIndex((level) => level && this.isLevelCategoryVisible(level));
      return firstVisibleIndex >= 0 ? firstVisibleIndex : 0;
    },

    /**
     * 加载上次打开的关卡；不在首批数据中时按 id 请求其所在页。
     *
     * @returns {Promise<number>} 初始关卡索引。
     */
    async getInitialLevelIndexAsync() {
      const lastLevelKey = this.loadLastLevelId();
      if (lastLevelKey) {
        const lastLevelIndex = this.levels.findIndex((level) => (
          this.getLevelCacheKey(level) === lastLevelKey
        ) && this.isLevelCategoryVisible(level));
        if (lastLevelIndex >= 0) return lastLevelIndex;
      }
      return this.getInitialLevelIndex();
    },

    /**
     * 切换关卡选择面板。
     *
     * @returns {void}
     */
    toggleLevelPicker() {
      this.isLevelPickerOpen = !this.isLevelPickerOpen;
    },

    /**
     * 关闭关卡选择面板。
     *
     * @returns {void}
     */
    closeLevelPicker() {
      this.isLevelPickerOpen = false;
    },

    /**
     * 记录关卡选择列表滚动位置，便于下次打开时恢复。
     *
     * @param {Event} event 滚动事件。
     * @returns {void}
     */
    handleLevelPickerScroll(event) {
      const list = event?.currentTarget;
      this.levelPickerScrollTop = list?.scrollTop ?? 0;
    },

    /**
     * 解锁当前会话的开发者模式。
     *
     * @returns {void}
     */
    async unlockDeveloperMode() {
      if (this.isDeveloperMode) {
        await this.loadLevels();
        this.developerStatusText = "开发者模式已开启";
        return true;
      }

      this.openDeveloperTokenDialog();
      return false;
    },

    /**
     * 打开开发者 token 输入弹窗。
     *
     * @returns {void}
     */
    openDeveloperTokenDialog() {
      this.appDialog = {
        type: "developer-token",
        title: "开发者模式",
        message: "请输入开发者 token",
        inputValue: "",
        status: this.getDeveloperTokenCooldownText()
      };
    },

    /**
     * 提交开发者 token 并尝试解锁开发者模式。
     *
     * @returns {Promise<void>}
     */
    async submitDeveloperToken() {
      const cooldownText = this.getDeveloperTokenCooldownText();
      if (cooldownText) {
        this.appDialog.status = cooldownText;
        return;
      }

      const normalizedToken = this.appDialog.inputValue.trim();
      if (!normalizedToken) {
        this.appDialog.status = "请输入 token";
        return;
      }
      try {
        await verifyDeveloperToken(normalizedToken);
      } catch (error) {
        this.developerTokenFailedAttempts += 1;
        this.saveDeveloperTokenAttempts();
        if (this.developerTokenFailedAttempts >= DEVELOPER_TOKEN_MAX_FAILED_ATTEMPTS) {
          this.developerTokenCooldownUntil = Date.now() + DEVELOPER_TOKEN_COOLDOWN_MS;
          this.saveDeveloperTokenCooldown();
          this.appDialog.status = this.getDeveloperTokenCooldownText();
          this.developerStatusText = "开发者 token 错误次数过多";
          return;
        }

        const remainingAttempts = DEVELOPER_TOKEN_MAX_FAILED_ATTEMPTS - this.developerTokenFailedAttempts;
        this.appDialog.status = error.message + "，还可尝试 " + remainingAttempts + " 次";
        this.developerStatusText = error.message;
        return;
      }

      setDeveloperToken(normalizedToken);
      this.isDeveloperMode = true;
      this.developerTokenFailedAttempts = 0;
      this.developerTokenCooldownUntil = 0;
      this.saveDeveloperTokenAttempts();
      this.saveDeveloperTokenCooldown();
      this.closeAppDialog();
      await this.detectLevelEditorAvailability();
      await this.loadLevels();
      if (this.currentLevel?.id) {
        const currentKey = this.getLevelCacheKey(this.currentLevel);
        const currentIndex = this.levels.findIndex((level) => this.getLevelCacheKey(level) === currentKey);
        if (currentIndex >= 0) this.currentLevelIndex = currentIndex;
      }
      if (this.canUseLevelEditor) {
        this.writeLevelTemplate(false);
      }
      this.levelCategoryFilter = "all";
      this.startPresencePolling();
      this.developerStatusText = "开发者模式已开启";
    },

    /**
     * 获取开发者 token 冷却提示。
     *
     * @returns {string} 冷却提示。
     */
    getDeveloperTokenCooldownText() {
      const remainingMs = this.developerTokenCooldownUntil - Date.now();
      if (remainingMs <= 0) {
        if (this.developerTokenCooldownUntil > 0) {
          this.developerTokenCooldownUntil = 0;
          this.developerTokenFailedAttempts = 0;
          this.saveDeveloperTokenAttempts();
          this.saveDeveloperTokenCooldown();
        }
        return "";
      }
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      return "错误次数过多，请 " + hours + ":" + minutes + ":" + seconds + " 后再试";
    },

    /**
     * 打开投稿提示弹窗。
     *
     * @returns {void}
     */
    openSubmissionNoticeDialog() {
      this.appDialog = {
        type: "submission-notice",
        title: "投稿 JSON 已生成",
        message: "请复制 JSON，并点击右上角 GitHub 链接提交 issue 投稿。",
        inputValue: "",
        status: ""
      };
    },

    /**
     * 关闭应用弹窗。
     *
     * @returns {void}
     */
    closeAppDialog() {
      this.appDialog = {
        type: "",
        title: "",
        message: "",
        inputValue: "",
        status: ""
      };
    },

    /**
     * 读取开发者 token 冷却结束时间。
     *
     * @returns {void}
     */
    loadDeveloperTokenCooldown() {
      try {
        this.developerTokenCooldownUntil = Number(window.localStorage.getItem(DEVELOPER_TOKEN_COOLDOWN_STORAGE_KEY) || 0);
        this.developerTokenFailedAttempts = Math.min(
          DEVELOPER_TOKEN_MAX_FAILED_ATTEMPTS,
          Math.max(0, Number(window.localStorage.getItem(DEVELOPER_TOKEN_ATTEMPTS_STORAGE_KEY) || 0))
        );
      } catch {
        this.developerTokenCooldownUntil = 0;
        this.developerTokenFailedAttempts = 0;
        }
    },

    /**
     * 保存开发者 token 冷却结束时间。
     *
     * @returns {void}
     */
    saveDeveloperTokenCooldown() {
      try {
        if (this.developerTokenCooldownUntil > 0) {
          window.localStorage.setItem(DEVELOPER_TOKEN_COOLDOWN_STORAGE_KEY, String(this.developerTokenCooldownUntil));
        } else {
          window.localStorage.removeItem(DEVELOPER_TOKEN_COOLDOWN_STORAGE_KEY);
        }
      } catch {
        // Ignore unavailable storage.
      }
    },

    /**
     * 保存开发者 token 错误次数。
     *
     * @returns {void}
     */
    saveDeveloperTokenAttempts() {
      try {
        if (this.developerTokenFailedAttempts > 0) {
          window.localStorage.setItem(DEVELOPER_TOKEN_ATTEMPTS_STORAGE_KEY, String(this.developerTokenFailedAttempts));
        } else {
          window.localStorage.removeItem(DEVELOPER_TOKEN_ATTEMPTS_STORAGE_KEY);
        }
      } catch {
        // Ignore unavailable storage.
      }
    },

    /**
     * 判断关卡分类是否对当前用户可见。
     *
     * @param {object} level 关卡数据。
     * @returns {boolean} 是否可见。
     */
    isLevelCategoryVisible(level) {
      const category = this.getLevelCategory(level);
      return category === "stable" || (this.isDeveloperMode && category === "alpha");
    },

    /**
     * 获取关卡分类。
     *
     * @param {object} level 关卡数据。
     * @returns {"stable"|"alpha"|"removed"} 关卡分类。
     */
    getLevelCategory(level) {
      return ["stable", "alpha", "removed"].includes(level?.sourceCategory) ? level.sourceCategory : "stable";
    },

    /**
     * 获取关卡分类显示名。
     *
     * @param {string} category 关卡分类。
     * @returns {string} 显示名。
     */
    getLevelCategoryLabel(category) {
      const labels = {
        stable: "正式版",
        alpha: "测试版",
        removed: "待删版"
      };
      return labels[category] ?? labels.stable;
    },

    /**
     * 按分类、难度和 id 排序关卡选择项。
     *
     * @param {{ level: object }} left 左侧关卡项。
     * @param {{ level: object }} right 右侧关卡项。
     * @returns {number} 排序结果。
     */
    compareLevelItems(left, right) {
      const categoryOrder = { stable: 0, alpha: 1, removed: 2 };
      const leftLevel = left?.level ?? {};
      const rightLevel = right?.level ?? {};
      return (categoryOrder[this.getLevelCategory(leftLevel)] ?? 9) - (categoryOrder[this.getLevelCategory(rightLevel)] ?? 9)
        || this.normalizeLevelDifficulty(leftLevel.difficulty) - this.normalizeLevelDifficulty(rightLevel.difficulty)
        || String(leftLevel.id ?? "").localeCompare(String(rightLevel.id ?? ""));
    },

    /**
     * 将测试关卡收录为正式版，或移入待删版。
     *
     * @param {string} levelId 关卡 id。
     * @param {"include"|"reject"} action 处理动作。
     * @returns {Promise<void>}
     */
    async reviewTestLevel(level, action) {
      try {
        const nextLevelKey = this.getNextReviewLevelKey(level);
        await reviewLevelRequest(level, action);
        await this.loadLevels();
        const nextIndex = this.findReviewFallbackLevelIndex(nextLevelKey);
        if (nextIndex >= 0) {
          await this.loadLevel(nextIndex);
        }
        this.developerStatusText = action === "include" ? "已收录为正式版" : "已移入待删版";
      } catch (error) {
        this.developerStatusText = error.message;
      }
    },

    /**
     * 审核当前测试关卡后，预先计算应该跳到的下一关。
     *
     * @param {object} level 当前关卡。
     * @returns {string} 下一关缓存键；没有时为空字符串。
     */
    getNextReviewLevelKey(level) {
      const currentKey = this.getLevelCacheKey(level);
      const alphaItems = this.levels
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item && this.getLevelCategory(item) === "alpha")
        .sort((left, right) => this.compareLevelItems({ level: left.item }, { level: right.item }));
      if (alphaItems.length <= 1) return "";
      const currentAlphaIndex = alphaItems.findIndex(({ item }) => this.getLevelCacheKey(item) === currentKey);
      if (currentAlphaIndex < 0) return "";
      const nextAlpha = alphaItems[(currentAlphaIndex + 1) % alphaItems.length];
      return this.getLevelCacheKey(nextAlpha.item);
    },

    /**
     * 审核后按预先记录的 key 找下一关；失败时回到第一关。
     *
     * @param {string} nextLevelKey 下一关 key。
     * @returns {number} 关卡列表索引。
     */
    findReviewFallbackLevelIndex(nextLevelKey) {
      if (nextLevelKey) {
        const nextIndex = this.levels.findIndex((item) => this.getLevelCacheKey(item) === nextLevelKey && this.isLevelCategoryVisible(item));
        if (nextIndex >= 0) return nextIndex;
      }
      return this.getInitialLevelIndex();
    },

    /**
     * 切换个性化设置面板。
     *
     * @returns {void}
     */
    togglePersonalization() {
      this.isPersonalizationOpen = !this.isPersonalizationOpen;
      if (this.isPersonalizationOpen) {
        this.isRulePanelOpen = false;
      }
    },

    /**
     * 关闭个性化设置面板。
     *
     * @returns {void}
     */
    closePersonalization() {
      this.isPersonalizationOpen = false;
    },

    /**
     * 切换玩法说明面板。
     *
     * @returns {void}
     */
    toggleRulePanel() {
      this.isRulePanelOpen = !this.isRulePanelOpen;
      if (this.isRulePanelOpen) {
        this.isPersonalizationOpen = false;
      }
    },

    /**
     * 关闭玩法说明面板。
     *
     * @returns {void}
     */
    closeRulePanel() {
      this.isRulePanelOpen = false;
    },

    /**
     * 标记胜利提示已被用户关闭。
     *
     * @returns {void}
     */
    closeVictoryMark() {
      this.isVictoryDismissed = true;
    },

    /**
     * 从选择面板加载指定关卡。
     *
     * @param {number} index 关卡索引。
     * @returns {void}
     */
    async selectLevelFromPicker(index) {
      await this.loadLevel(index);
    },

    /**
     * 将地图样式限制到当前设置面板允许的范围。
     *
     * @param {object} style 地图样式状态。
     * @returns {object} 归一化后的地图样式。
     */
    normalizeUserMapStyle(style) {
      const rawStyle = style && typeof style === "object" ? style : {};
      const defaults = appConfig.mapStyle;
      const clamp = (value, min, max, fallback) => {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) return fallback;
        return Math.min(max, Math.max(min, numberValue));
      };

      return {
        boardScale: clamp(rawStyle.boardScale, 0.6, 1.4, defaults.boardScale),
        dotScale: clamp(rawStyle.dotScale, 0.3, 0.8, defaults.dotScale),
        nodeScale: clamp(rawStyle.nodeScale, 0.04, 0.5, defaults.nodeScale),
        lineScale: clamp(rawStyle.lineScale, 0.1, 0.8, defaults.lineScale),
        gridLineScale: clamp(rawStyle.gridLineScale, 0.02, 0.2, defaults.gridLineScale),
        snapPointTolerance: clamp(rawStyle.snapPointTolerance, 0.1, 0.5, defaults.snapPointTolerance)
      };
    },

    /**
     * 将地图样式单个数值限制在输入框声明的范围内。
     *
     * @param {keyof appConfig.mapStyle} field 地图样式字段。
     * @returns {void}
     */
    normalizeMapStyleField(field) {
      if (!Object.prototype.hasOwnProperty.call(this.mapStyle, field)) return;
      this.mapStyle[field] = this.normalizeUserMapStyle(this.mapStyle)[field];
    },

    /**
     * 用鼠标滚轮调整地图样式数字输入。
     *
     * @param {WheelEvent} event 滚轮事件。
     * @param {keyof appConfig.mapStyle} field 地图样式字段。
     * @returns {void}
     */
    handleMapStyleNumberWheel(event, field) {
      if (!Object.prototype.hasOwnProperty.call(this.mapStyle, field)) return;
      const input = event?.currentTarget;
      const step = Number(input?.step || 0.01) || 0.01;
      const direction = event.deltaY > 0 ? -1 : 1;
      const min = Number(input?.min ?? -Infinity);
      const max = Number(input?.max ?? Infinity);
      const currentValue = Number(this.mapStyle[field]);
      const fallback = Number.isFinite(min) ? min : 0;
      const nextValue = clampNumber((Number.isFinite(currentValue) ? currentValue : fallback) + direction * step, min, max);
      this.mapStyle[field] = Number(nextValue.toFixed(2));
    },

    /**
     * 从本地存储读取用户个性化设置。
     *
     * @returns {void}
     */
    loadPersonalizationSettings() {
      let storedSettings = null;
      try {
        storedSettings = JSON.parse(window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY) || "null");
      } catch {
        storedSettings = null;
      }
      if (!storedSettings || typeof storedSettings !== "object") return;

      if (this.themes[storedSettings.theme]) {
        this.selectedTheme = storedSettings.theme;
      }
      if (this.pointPalettes[storedSettings.palette]) {
        this.selectedPalette = storedSettings.palette;
        this.pointDefinitions = this.pointPalettes[storedSettings.palette];
      }
      if (storedSettings.mapStyle && typeof storedSettings.mapStyle === "object") {
        this.mapStyle = this.normalizeUserMapStyle(storedSettings.mapStyle);
      }
      if (["top", "sidebar"].includes(storedSettings.navLayout)) {
        this.navLayout = storedSettings.navLayout;
      }
      this.isHintModeEnabled = Boolean(storedSettings.assistMode);
      this.isLinkedBlinkEnabled = Boolean(storedSettings.linkedBlink);
    },

    /**
     * 保存用户个性化设置。
     *
     * @returns {void}
     */
    savePersonalizationSettings() {
      try {
        window.localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify({
          theme: this.selectedTheme,
          palette: this.selectedPalette,
          navLayout: this.navLayout,
          assistMode: this.isHintModeEnabled,
          linkedBlink: this.isLinkedBlinkEnabled,
          mapStyle: this.serializeMapStyle(this.mapStyle)
        }));
      } catch {
        // Ignore unavailable storage.
      }
    },

    /**
     * 将主题、点位和地图样式恢复到配置默认值。
     *
     * @returns {void}
     */
    restoreDefaultPersonalization() {
      this.selectedTheme = this.themes[appConfig.theme.default] ? appConfig.theme.default : Object.keys(this.themes)[0] ?? "default";
      this.selectedPalette = this.pointPalettes[appConfig.colors.palette] ? appConfig.colors.palette : defaultPointPaletteId;
      this.navLayout = "top";
      this.setAssistMode(false);
      this.setLinkedBlinkMode(false);
      this.mapStyle = { ...appConfig.mapStyle };
      this.applyTheme(this.selectedTheme);
      this.applyPointPalette(this.selectedPalette);
      this.savePersonalizationSettings();
      this.isClearDataConfirming = false;
      this.clearDataStatusText = "设置已恢复默认";
    },

    /**
     * 从本地存储读取已完成关卡记录。
     *
     * @returns {void}
     */
    loadCompletedLevels() {
      try {
        this.completedLevels = JSON.parse(window.localStorage.getItem(COMPLETED_LEVELS_STORAGE_KEY) || "{}");
      } catch {
        this.completedLevels = {};
      }
    },

    /**
     * 将已完成关卡记录写入本地存储。
     *
     * @returns {void}
     */
    saveCompletedLevels() {
      window.localStorage.setItem(COMPLETED_LEVELS_STORAGE_KEY, JSON.stringify(this.completedLevels));
    },

    /**
     * 显示清空游戏数据确认操作。
     *
     * @returns {void}
     */
    requestClearGameData() {
      this.isClearDataConfirming = true;
      this.clearDataStatusText = "";
    },

    /**
     * 取消清空游戏数据。
     *
     * @returns {void}
     */
    cancelClearGameData() {
      this.isClearDataConfirming = false;
    },

    /**
     * 清空浏览器中属于本游戏的本地数据。
     *
     * @returns {void}
     */
    clearGameData() {
      try {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith(GAME_STORAGE_KEY_PREFIX) && key !== PERSONALIZATION_STORAGE_KEY)
          .forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // Ignore storage errors so the in-memory reset can still happen.
      }

      this.completedLevels = {};
      this.isPersonalBest = false;
      this.isClearDataConfirming = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
      this.clearDataStatusText = "已清空";
    },

    /**
     * 从本地存储读取上次打开的关卡 id。
     *
     * @returns {string} 关卡 id。
     */
    loadLastLevelId() {
      try {
        return window.localStorage.getItem(LAST_LEVEL_STORAGE_KEY) || "";
      } catch {
        return "";
      }
    },

    /**
     * 将当前关卡 id 写入本地存储。
     *
     * @param {string} levelId 关卡 id。
     * @returns {void}
     */
    saveLastLevelId(levelId) {
      if (!levelId) return;
      try {
        window.localStorage.setItem(LAST_LEVEL_STORAGE_KEY, levelId);
      } catch {
        // Ignore storage errors so level loading remains usable in restricted browsers.
      }
    },

    /**
     * 判断关卡是否已完成。
     *
     * @param {string} levelId 关卡 id。
     * @returns {boolean} 是否已完成。
     */
    isLevelCompleted(levelId) {
      return Boolean(this.completedLevels[levelId]);
    },

    /**
     * 将关卡难度限制在 1 到 5 的整数范围。
     *
     * @param {unknown} value 原始难度。
     * @returns {number} 标准难度。
     */
    normalizeLevelDifficulty(value) {
      const difficulty = Number(value);
      if (!Number.isFinite(difficulty)) return 1;
      return Math.min(5, Math.max(1, Math.round(difficulty)));
    },

    /**
     * 将毫秒数格式化为 mm:ss。
     *
     * @param {number} milliseconds 毫秒数。
     * @returns {string} 计时文本。
     */
    formatElapsedTime(milliseconds) {
      const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    },

    /**
     * 获取关卡最佳成绩显示文本。
     *
     * @param {string} levelId 关卡 id。
     * @returns {string} 最佳成绩或完成状态文本。
     */
    getLevelBestTimeText(levelId) {
      const record = this.completedLevels[levelId];
      if (!record) return "未完成";
      const bestMs = Number(record.bestMs);
      if (!Number.isFinite(bestMs)) return "已完成";
      return `最佳 ${this.formatElapsedTime(bestMs)}`;
    },

    /**
     * 获取通关结算用时。织链模式会把累计罚时计入最终成绩。
     *
     * @returns {number} 结算毫秒数。
     */
    getVictoryElapsedMs() {
      return this.normalizeTimerElapsedMs(this.timerElapsedMs + this.weavePenaltyMs);
    },

    /**
     * 获取已完成关卡数量。
     *
     * @returns {number} 已完成数量。
     */
    getCompletedLevelCount() {
      return Object.keys(this.completedLevels).length;
    },

    /**
     * 记录当前关卡完成状态，并更新个人最佳成绩。
     *
     * @returns {void}
     */
    markCurrentLevelCompleted() {
      if (!this.currentLevel?.id) return;
      const levelKey = this.getLevelCacheKey(this.currentLevel);
      const previousRecord = this.completedLevels[levelKey] ?? {};
      const elapsedMs = this.getVictoryElapsedMs();
      const previousBestMs = Number(previousRecord.bestMs);
      const hasPreviousBest = Number.isFinite(previousBestMs);
      const isPersonalBest = !hasPreviousBest || elapsedMs < previousBestMs;
      this.isPersonalBest = isPersonalBest;
      this.completedLevels = {
        ...this.completedLevels,
        [levelKey]: {
          ...previousRecord,
          completedAt: previousRecord.completedAt ?? new Date().toISOString(),
          lastCompletedAt: new Date().toISOString(),
          lastMs: elapsedMs,
          bestMs: isPersonalBest ? elapsedMs : previousRecord.bestMs
        }
      };
      this.saveCompletedLevels();
    },

    /**
     * 生成通关分享文本。
     *
     * @returns {string} 分享内容。
     */
    buildVictoryShareText() {
      const levelName = this.currentLevel?.name || this.currentLevel?.id || "未选择";
      const levelId = this.currentLevel?.id ? `（${this.currentLevel.id}）` : "";
      const gameMode = this.isWeaveModeEnabled ? "数寻" : "数链";
      const elapsedText = this.formatElapsedTime(this.getVictoryElapsedMs());
      const completedCount = this.getCompletedLevelCount();
      const gameUrl = window.location.href;

      return [
        `游戏链接：${gameUrl}`,
        `游戏模式：${gameMode}`,
        `通关关卡：${levelName}${levelId}`,
        `用时：${elapsedText}`,
        `总通关数：${completedCount}`
      ].join("\n");
    },

    /**
     * 复制通关分享文本到剪贴板。
     *
     * @returns {Promise<void>}
     */
    async shareVictory() {
      if (!this.isWon) return;
      const text = this.buildVictoryShareText();

      try {
        await this.copyTextToClipboard(text);
        this.shareStatusText = "已复制";
      } catch {
        this.shareStatusText = "复制失败";
      }
    },

    /**
     * 从当前关卡之后寻找下一个未通关关卡。
     *
     * @returns {number} 未通关关卡索引；没有时返回 -1。
     */
    getNextUncompletedLevelIndex() {
      if (!this.levels.length) return -1;
      const currentCategory = this.getLevelCategory(this.currentLevel ?? this.levels[this.currentLevelIndex]);

      for (let offset = 1; offset <= this.levels.length; offset += 1) {
        const index = (this.currentLevelIndex + offset) % this.levels.length;
        const level = this.levels[index];
        if (!level) continue;
        if (this.getLevelCategory(level) === currentCategory && !this.isLevelCompleted(this.getLevelCacheKey(level))) return index;
      }

      return -1;
    },

    /**
     * 通关后跳到下一个未通关关卡；全部通关时显示提示。
     *
     * @returns {void}
     */
    async goToNextUncompletedLevel() {
      const nextIndex = this.getNextUncompletedLevelIndex();
      if (nextIndex < 0) {
        this.nextLevelStatusText = "全部关卡已通关";
        return;
      }

      await this.loadLevel(nextIndex);
    },

    /**
     * 生成可写回 map.json 的地图样式片段。
     *
     * @param {object} style 地图样式状态。
     * @returns {object} 可序列化地图样式。
     */
    serializeMapStyle(style) {
      return {
        boardScale: style.boardScale,
        dotScale: style.dotScale,
        nodeScale: style.nodeScale,
        lineScale: style.lineScale,
        gridLineScale: style.gridLineScale,
        snapPointTolerance: style.snapPointTolerance
      };
    },

    async copyTextToClipboard(text) {
      await navigator.clipboard.writeText(text);
    },

    /**
     * 应用指定主题并写入根元素 CSS 变量。
     *
     * @param {string} themeId 主题 id。
     * @returns {void}
     */
    applyTheme(themeId) {
      const theme = this.themes[themeId] ?? this.themes[appConfig.theme.default];
      const tokenMap = {
        paper: "--paper",
        ink: "--ink",
        muted: "--muted",
        line: "--line",
        gridLine: "--grid-line",
        accent: "--accent",
        accentStrong: "--accent-strong",
        danger: "--danger",
        success: "--success"
      };

      document.documentElement.dataset.theme = theme.id;
      Object.entries(theme.tokens).forEach(([tokenName, tokenValue]) => {
        document.documentElement.style.setProperty(tokenMap[tokenName], tokenValue);
      });
    },

    /**
     * 应用点位调色板并重新水合关卡数据。
     *
     * @param {string} paletteId 调色板 id。
     * @returns {void}
     */
    applyPointPalette(paletteId) {
      const firstPaletteId = Object.keys(this.pointPalettes)[0];
      const nextDefinitions = this.pointPalettes[paletteId] ?? this.pointPalettes["默认"] ?? this.pointPalettes.default ?? this.pointPalettes[firstPaletteId] ?? {};
      this.pointDefinitions = nextDefinitions;
      this.levels = this.levels.map((level) => {
        if (!level) return level;
        return Array.isArray(level.pairs) ? hydrateLevel(level, nextDefinitions) : hydrateLevelIndexItem(level);
      });
      this.levelDetails = Object.fromEntries(
        Object.entries(this.levelDetails).map(([levelId, level]) => [levelId, hydrateLevel(level, nextDefinitions)])
      );
      if (this.currentLevel) {
        this.currentLevel = cloneLevel(hydrateLevel(this.currentLevel, nextDefinitions));
      }
      if (!this.canUseLevelEditor) return;
      this.editorPairCount = Math.min(this.editorPairCount, this.getEditorPairLimit());
      this.syncEditorPairCount();
    },

    /**
     * 判断点位是否还有可用贴图候选。
     *
     * @param {object} point 点位定义。
     * @returns {boolean} 是否使用贴图。
     */
    hasPointTexture(point) {
      return Boolean(point?.texture?.src);
    },

    /**
     * 生成点位圆点样式，贴图缺失时仍保留颜色回退。
     *
     * @param {object} point 点位定义。
     * @returns {Record<string, string>} 样式变量。
     */
    getPointDotStyle(point) {
      return { "--dot-color": point?.color ?? "var(--accent)" };
    },

    /**
     * 单个 webp 贴图加载失败后回退为纯色点。
     *
     * @param {object} point 点位定义。
     * @returns {void}
     */
    handlePointTextureError(point) {
      if (point?.texture) point.texture.src = "";
    },

    /**
     * 应用背景配置，自动选择可加载的背景图片。
     *
     * @returns {Promise<void>}
     */
    async applyBackgroundConfig() {
      const background = appConfig.background;
      document.documentElement.style.setProperty("--background-opacity", String(background.opacity));
      document.documentElement.style.setProperty("--background-blur", background.blur);

      const images = background.images?.length ? background.images : [background.image].filter(Boolean);
      if (!images.length) {
        document.documentElement.style.setProperty("--background-image", "none");
        return;
      }

      const image = await this.findAvailableBackgroundImage(images);
      if (!image) {
        document.documentElement.style.setProperty("--background-image", "none");
        return;
      }

      const imagePath = new URL(image, window.location.href).href;
      document.documentElement.style.setProperty("--background-image", `url("${imagePath}")`);
    },

    /**
     * 从候选背景图片中找到第一个可加载项。
     *
     * @param {string[]} images 候选图片路径。
     * @returns {Promise<string>} 可用图片路径；没有时返回空字符串。
     */
    async findAvailableBackgroundImage(images) {
      for (const image of images) {
        if (await this.canLoadImage(image)) return image;
      }
      return "";
    },

    /**
     * 检查图片路径是否可以加载。
     *
     * @param {string} image 图片路径。
     * @returns {Promise<boolean>} 是否加载成功。
     */
    canLoadImage(image) {
      return new Promise((resolve) => {
        const tester = new Image();
        tester.onload = () => resolve(true);
        tester.onerror = () => resolve(false);
        tester.src = new URL(image, window.location.href).href;
      });
    },

    /**
     * 将所有路径重置为每个点对的起点状态。
     *
     * @returns {void}
     */
    resetPaths() {
      if (!this.activeBoardLevel) return;
      // Reset each pair to its first endpoint, matching the normal puzzle start state.
      const paths = {};
      this.activeBoardLevel.pairs.forEach((pair) => {
        paths[pair.id] = { branches: [[pair.points[0]]], completed: false };
      });
      this.paths = paths;
      this.hintLockedPairs = {};
      this.hintStatusText = "";
      this.activePair = null;
      this.activePathMode = "";
      this.activeBranchIndex = null;
      this.activeRetractBranch = null;
      this.isDrawing = false;
      this.cancelLinkedBlinkTimer();
      this.cancelBoardDragFrame();
      this.pointerMoved = false;
      this.clearPointerPreview();
      this.lastPointerNodeKey = "";
      this.boardPointerGeometry = null;
      this.resetGameTimer();
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
      this.clearWeaveAttemptState();
    },

    /**
     * 清空当前关卡的所有路径。
     *
     * @returns {void}
     */
    clearPaths() {
      if (!this.activeBoardLevel) return;
      const paths = {};
      this.activeBoardLevel.pairs.forEach((pair) => {
        paths[pair.id] = { branches: [], completed: false };
      });
      this.paths = paths;
      this.hintLockedPairs = {};
      this.hintStatusText = "";
      this.activePair = null;
      this.activePathMode = "";
      this.activeBranchIndex = null;
      this.activeRetractBranch = null;
      this.isDrawing = false;
      this.cancelLinkedBlinkTimer();
      this.cancelBoardDragFrame();
      this.pointerMoved = false;
      this.clearPointerPreview();
      this.lastPointerNodeKey = "";
      this.boardPointerGeometry = null;
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
      this.clearWeaveAttemptState();
    },

    /**
     * 清理织链模式当前尝试数据，保留是否开启由调用方决定。
     *
     * @returns {void}
     */
    clearWeaveAttemptState() {
      this.weaveMarkedEndpoints = {};
      this.weaveEndpointFeedback = [];
      this.weaveSubmitSummary = "";
      this.weaveStatusText = "";
      this.weavePenaltyMs = 0;
      this.weaveActivePairId = "";
    },

    /**
     * 判断当前关卡是否可进入织链模式。
     *
     * @returns {boolean} 是否可用。
     */
    canEnterWeaveMode() {
      return Boolean(this.isDeveloperMode && this.currentLevel && this.currentLevel.gridType === "square");
    },

    /**
     * 切换织链模式。
     *
     * @param {boolean} enabled 是否开启。
     * @returns {void}
     */
    async toggleWeaveMode(enabled) {
      if (enabled && !this.canEnterWeaveMode()) {
        this.weaveStatusText = this.weaveModeUnavailableText || "织链模式暂不可用";
        return;
      }
      if (!enabled) {
        this.clearWeaveAttemptState();
        if (this.activeView === "weave-total" || this.activeView === "weave-id") {
          this.activeView = "play";
        }
        return;
      }
      this.weaveStatusText = "已进入织链模式";
    },

    /**
     * 从专门入口选择游玩子模式。
     *
     * @param {"normal"|"play"|"weave"|"weave-total"|"weave-id"} mode 模式 id。
     * @returns {Promise<void>}
     */
    async selectGameMode(mode) {
      if (mode === "weave" || mode === "weave-total" || mode === "weave-id") {
        if (!this.isDeveloperMode) {
          this.weaveStatusText = "织链模式开发中，请先进入 SU";
          this.developerStatusText = "织链模式开发中，请先进入 SU";
          this.activeView = "play";
          return;
        }
        if (mode === "weave-id") this.weaveStatusText = "旧织链入口已切换到色点总数";
        await this.toggleWeaveMode(true);
        if (!this.weaveStatusText || this.weaveStatusText === "已进入织链模式") {
          this.activeView = "weave-total";
          this.isLevelPickerOpen = false;
          this.resetPaths();
        }
        return;
      }
      await this.toggleWeaveMode(false);
      this.resetPaths();
    },

    /**
     * 获取织链模式暂不可用的原因。
     *
     * @returns {string} 原因文本。
     */
    getWeaveModeUnavailableText() {
      if (!this.isDeveloperMode) return "";
      if (!this.currentLevel) return "请先选择关卡";
      if (this.currentLevel.gridType !== "square") return "织链模式暂只支持方形地图";
      return "";
    },

    /**
     * 读取织链模式需要的答案缓存。
     *
     * @returns {Promise<boolean>} 是否加载成功。
     */
    async ensureWeaveAnswerCache() {
      if (!this.currentLevel?.sourcePath) return false;
      const levelKey = this.getLevelCacheKey(this.currentLevel);
      if (this.weaveAnswerCacheKey === levelKey) return Array.isArray(this.currentLevel.answers) && this.currentLevel.answers.length > 0;
      if (this.isWeaveAnswerLoading) return false;

      this.isWeaveAnswerLoading = true;
      try {
        const answers = await loadLevelAnswers(this.currentLevel);
        if (this.getLevelCacheKey(this.currentLevel) !== levelKey) return false;
        this.currentLevel = {
          ...this.currentLevel,
          answers
        };
        this.weaveAnswerCacheKey = levelKey;
        return Array.isArray(answers) && answers.length > 0;
      } finally {
        this.isWeaveAnswerLoading = false;
      }
    },

    /**
     * 获取所有已完成路径的线段。
     *
     * @returns {Array<{ pairId: string, from: [number, number], to: [number, number], edge: string }>} 已完成线段。
     */
    getCompletedPathSegments() {
      const segments = [];
      Object.entries(this.getCompletedPathView()).forEach(([pairId, path]) => {
        for (let index = 1; index < path.length; index += 1) {
          const from = path[index - 1];
          const to = path[index];
          segments.push({ pairId, from, to, edge: edgeKey(from, to) });
        }
      });
      return segments;
    },

    /**
     * 按棋盘显示方向统计隐藏端点所在行/列。
     *
     * @param {"row"|"column"} axis 方向。
     * @returns {Map<number, Map<string, number>>} 行/列到 id 计数。
     */
    buildWeaveHiddenEndpointBuckets(axis) {
      const buckets = new Map();
      if (!this.currentLevel || this.currentLevel.gridType !== "square") return buckets;
      this.weaveHiddenEndpoints.forEach((endpoint) => {
        const displayPoint = this.toBoardDisplayPoint(endpoint.point);
        const slot = Math.round(axis === "row" ? displayPoint[1] : displayPoint[0]);
        if (!buckets.has(slot)) buckets.set(slot, new Map());
        const row = buckets.get(slot);
        row.set(endpoint.pairId, (row.get(endpoint.pairId) ?? 0) + 1);
      });
      return buckets;
    },

    /**
     * 统计玩家当前标记的隐藏端点位置。
     *
     * @param {"row"|"column"} axis 方向。
     * @returns {Map<number, Map<string, number>>} 行/列到 id 计数。
     */
    buildWeaveMarkedEndpointBuckets(axis) {
      const buckets = new Map();
      Object.entries(this.weaveMarkedEndpoints ?? {}).forEach(([nodeKey, pairId]) => {
        const [x, y] = nodeKey.split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !pairId) return;
        if (pairId === this.weaveExcludedPairId) return;
        const displayPoint = this.toBoardDisplayPoint([x, y]);
        const slot = Math.round(axis === "row" ? displayPoint[1] : displayPoint[0]);
        if (!buckets.has(slot)) buckets.set(slot, new Map());
        const row = buckets.get(slot);
        row.set(pairId, (row.get(pairId) ?? 0) + 1);
      });
      return buckets;
    },

    /**
     * 生成织链模式行列线索：每行/列只显示剩余未填隐藏色点数量。
     *
     * @param {"row"|"column"} axis 方向。
     * @returns {Array<{ index: number, mode: string, total: object, items: Array<object> }>} 线索列表。
     */
    buildWeaveClueLines(axis) {
      if (!this.currentLevel || this.currentLevel.gridType !== "square") return [];
      const bounds = this.boardDisplayBounds;
      const limit = axis === "row" ? Math.round(bounds.rows) + 1 : Math.round(bounds.cols) + 1;
      const targetBuckets = this.buildWeaveHiddenEndpointBuckets(axis);
      const currentBuckets = this.buildWeaveMarkedEndpointBuckets(axis);
      return buildWeaveClueLinesFromBuckets(targetBuckets, currentBuckets, limit);
    },

    /**
     * 选择/取消当前要标记的端点 id。
     *
     * @param {string} pairId 点对 id。
     * @returns {void}
     */
    selectWeavePair(pairId) {
      this.weaveActivePairId = this.weaveActivePairId === pairId ? "" : pairId;
    },

    /**
     * 清除指定类型的织链辅助标记。
     *
     * @param {string} pairId 辅助标记 id。
     * @returns {void}
     */
    clearWeaveMarksByPairId(pairId) {
      this.weaveMarkedEndpoints = Object.fromEntries(
        Object.entries(this.weaveMarkedEndpoints ?? {}).filter(([, markPairId]) => markPairId !== pairId)
      );
      if (this.weaveActivePairId === pairId) this.weaveActivePairId = "";
    },

    clearWeaveUnknownMarks() {
      this.clearWeaveMarksByPairId(this.weaveUnknownPairId);
    },

    clearWeaveExcludedMarks() {
      this.clearWeaveMarksByPairId(this.weaveExcludedPairId);
    },

    /**
     * 处理织链模式中的节点点击。
     *
     * @param {{ x: number, y: number }} position 节点位置。
     * @returns {void}
     */
    handleWeaveNodeClick(position) {
      if (!this.isWeaveModeEnabled || !this.canEnterWeaveMode()) return;
      const clickedKey = keyOf(position.x, position.y);

      // 点击已有标记位置 → 直接删除（无需选中对应色点）
      if (this.weaveMarkedEndpoints[clickedKey]) {
        const nextMarks = { ...this.weaveMarkedEndpoints };
        delete nextMarks[clickedKey];
        this.weaveMarkedEndpoints = nextMarks;
        return;
      }

      // 未选中色点 → 无法放置新标记
      if (!this.weaveActivePairId) return;
      const isMetaMark = this.weaveActivePairId === this.weaveUnknownPairId || this.weaveActivePairId === this.weaveExcludedPairId;
      const pair = isMetaMark ? null : this.getPair(this.weaveActivePairId);
      if (!isMetaMark && !pair) return;
      if (this.weaveVisibleEndpointKeys.has(clickedKey)) return;

      // 真实色点一个 id 只能标记一个位置；问号和排除标记只是辅助标记，可以放多个。
      const nextMarks = isMetaMark
        ? { ...this.weaveMarkedEndpoints }
        : Object.fromEntries(
          Object.entries(this.weaveMarkedEndpoints).filter(([, pairId]) => pairId !== this.weaveActivePairId)
        );
      this.weaveMarkedEndpoints = {
        ...nextMarks,
        [clickedKey]: this.weaveActivePairId
      };
    },

    /**
     * 提交当前织链标记并生成反馈。
     *
     * @returns {Promise<void>}
     */
    async submitWeaveEndpoints() {
      if (!this.canEnterWeaveMode()) {
        this.weaveStatusText = this.getWeaveModeUnavailableText() || "织链模式暂不可用";
        return;
      }

      const result = buildWeaveSubmissionResult(
        this.weaveHiddenEndpoints,
        this.weaveKnownMarkedEndpoints,
        this.normalizeLevelDifficulty(this.currentLevel?.difficulty)
      );
      this.weaveEndpointFeedback = result.feedback;
      this.weavePenaltyMs += result.penaltyMs;
      this.weaveSubmitSummary = result.wrongCount === 0 ? "已标记的端点均正确" : `本次提交有 ${result.wrongCount} 个错点`;
      this.weaveStatusText = result.missingCount > 0
        ? `${this.weaveSubmitSummary}，还差 ${result.missingCount} 个端点，累计罚时 ${this.weavePenaltyText}`
        : `${this.weaveSubmitSummary}，累计罚时 ${this.weavePenaltyText}`;

      if (result.isVictory) {
        const wasWon = this.isWon;
        this.isWon = true;
        this.isVictoryDismissed = false;
        if (!wasWon) {
          this.stopGameTimer();
          this.markCurrentLevelCompleted();
          this.preloadNextLevelPage();
        }
      }
    },

    /**
     * 判断目标端点是否会阻挡当前路径。
     *
     * @param {string|undefined} endpointOwner 目标端点所属点对。
     * @param {[number, number]} point 目标节点坐标。
     * @returns {boolean} 是否阻挡。
     */
    isEndpointBlockingPath(endpointOwner, point) {
      if (!endpointOwner || endpointOwner === this.activePair) return false;
      return true;
    },

    /**
     * 判断当前路径是否满足织链行列长度线索。
     *
     * @returns {boolean} 是否满足。
     */
    isWeavePathClueSatisfied() {
      return true;
    },

    /**
     * 完整重置织链模式状态。
     *
     * @returns {void}
     */
    resetWeaveModeState() {
      this.clearWeaveAttemptState();
      this.isWeaveAnswerLoading = false;
      this.weaveAnswerCacheKey = "";
    },

    /**
     * 处理棋盘按下事件，确定是否开始绘制路径。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerDown(event) {
      if (!this.activeBoardLevel) return;
      this.startGameTimer();
      this.cacheBoardPointerGeometry(event.currentTarget);
      const position = this.positionFromEvent(event);
      if (!position) return;

      if (event.detail > 1 || this.isBoardDoubleTap(event, position)) {
        this.lastBoardTap = null;
        this.stopDrawing();
        this.lastBoardDoubleClickAt = event.timeStamp;
        this.handleBoardDoubleClickAtPosition(position);
        event.preventDefault();
        return;
      }
      this.rememberBoardTap(event, position);

      if (this.isWeaveModeEnabled && this.weaveMarkedEndpoints[keyOf(position.x, position.y)]) {
        this.handleWeaveNodeClick(position);
        event.preventDefault();
        return;
      }

      const startInfo = this.getPathStartInfo(position);
      if (!startInfo) {
        this.handleWeaveNodeClick(position);
        return;
      }

      this.startPath(startInfo.pairId, position, startInfo.mode);
      if (!this.isDrawing) return;
      this.scheduleLinkedBlink(startInfo.pairId);
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      this.pointerMoved = false;
      this.lastPointerNodeKey = keyOf(position.x, position.y);
      event.preventDefault();
    },

    /**
     * 处理棋盘移动事件，更新预览点并尝试追加路径。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerMove(event) {
      if (!this.isDrawing || !this.activePair) return;
      const pointerPosition = this.pointerPositionFromEvent(event);
      this.queuePointerPreview(pointerPosition);
      this.queueBoardDragPosition(pointerPosition);
      event.preventDefault();
    },

    /**
     * 处理棋盘抬起事件，结束当前绘制过程。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerUp(event) {
      const pairToPause = this.activePair;
      this.cancelBoardDragFrame();
      const finalPosition = this.dragPositionFromPointer(this.pointerPositionFromEvent(event));

      if (this.isDrawing && this.activePair && finalPosition) {
        this.addStep(finalPosition);
      }

      if (pairToPause) {
        this.pausePath(pairToPause, this.pointerMoved);
      }

      this.pointerMoved = false;
      this.cancelLinkedBlinkTimer();
      this.clearPointerPreview();
      this.lastPointerNodeKey = "";
      this.boardPointerGeometry = null;
      event.preventDefault();
      this.releasePointer(event);
    },

    /**
     * 处理指针取消事件，清理绘制过程中的临时状态。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerCancel(event) {
      this.cancelBoardDragFrame();
      this.stopDrawing();
      this.cancelLinkedBlinkTimer();
      this.lastPointerNodeKey = "";
      this.boardPointerGeometry = null;
      this.releasePointer(event);
    },

    /**
     * 处理棋盘双击事件：端点清空整条同色路径，未完成路径节点回退到该点。
     *
     * @param {MouseEvent} event 鼠标事件。
     * @returns {void}
     */
    handleBoardDoubleClick(event) {
      if (!this.activeBoardLevel) return;
      if (event.timeStamp - this.lastBoardDoubleClickAt >= 0 && event.timeStamp - this.lastBoardDoubleClickAt < 160) return;
      const position = this.positionFromEvent(event);
      if (!position) return;
      this.handleBoardDoubleClickAtPosition(position);
    },

    /**
     * 按指定节点执行双击行为：端点清空整条同色路径，未完成路径节点回退到该点。
     *
     * @param {{ x: number, y: number }} position 节点位置。
     * @returns {void}
     */
    handleBoardDoubleClickAtPosition(position) {
      const point = positionToArray(position);
      const pairId = this.endpoints[keyOf(position.x, position.y)];
      if (pairId) {
        if (this.isPairHintLocked(pairId)) return;
        this.clearPairPath(pairId);
        return;
      }

      if (!this.rollbackIncompletePathAtPoint(point)) {
        this.breakCompletedPathAtPoint(point);
      }
    },

    /**
     * 开始绘制指定点对路径。
     *
     * @param {string} pairId 点对 id。
     * @param {{ x: number, y: number }} position 起始位置。
     * @param {"endpoint"|"path-end"|"completed-endpoint"} [mode="endpoint"] 起点模式。
     * @returns {void}
     */
    startPath(pairId, position, mode = "endpoint") {
      if (this.isPairHintLocked(pairId)) return;
      this.activePair = pairId;
      this.activePathMode = mode;
      this.activeBranchIndex = null;
      this.isDrawing = true;
      this.clearPointerPreview();
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.nextLevelStatusText = "";

      const point = positionToArray(position);
      const currentState = this.normalizePairPathState(pairId, this.paths[pairId]);
      if (mode === "completed-endpoint") {
        const completedBranch = currentState.branches.find((branch) => this.pathTouchesBothEndpoints(pairId, branch));
        const retractableBranch = this.orientBranchToEndAtPoint(completedBranch, point);
        if (!retractableBranch) {
          this.isDrawing = false;
          this.activePair = null;
          this.activePathMode = "";
          this.activeRetractBranch = null;
          return;
        }
        this.activeRetractBranch = retractableBranch;
        this.activeBranchIndex = 0;
        return;
      }

      if (currentState.completed) {
        this.isDrawing = false;
        this.activePair = null;
        this.activePathMode = "";
        this.activeRetractBranch = null;
        return;
      }

      if (mode === "path-end") {
        const branchIndex = currentState.branches.findIndex((branch) => samePoint(branch[branch.length - 1], point));
        if (branchIndex < 0) {
          this.isDrawing = false;
          this.activePair = null;
          this.activePathMode = "";
          this.activeRetractBranch = null;
          return;
        }
        this.paths[pairId] = currentState;
        this.activeBranchIndex = branchIndex;
        return;
      }

      const endpointIndex = this.getPairEndpointIndex(pairId, point);
      if (endpointIndex < 0) {
        this.isDrawing = false;
        this.activePair = null;
        this.activePathMode = "";
        this.activeRetractBranch = null;
        return;
      }

      const existingBranchIndex = currentState.branches.findIndex((branch) => samePoint(branch[0], point));
      if (existingBranchIndex >= 0) {
        currentState.branches[existingBranchIndex] = [point];
        this.activeBranchIndex = existingBranchIndex;
      } else if (currentState.branches.length < 2) {
        currentState.branches.push([point]);
        this.activeBranchIndex = currentState.branches.length - 1;
      } else {
        currentState.branches[endpointIndex] = [point];
        this.activeBranchIndex = endpointIndex;
      }

      this.paths[pairId] = currentState;
    },

    /**
     * 向当前路径追加一个节点，并校验碰撞、连通和终点规则。
     *
     * @param {{ x: number, y: number }} position 目标节点位置。
     * @returns {boolean} 是否成功追加或保持有效。
     */
    addStep(position) {
      if (this.activePathMode === "completed-endpoint") {
        return this.retractCompletedPathStep(position);
      }

      const state = this.normalizePairPathState(this.activePair, this.paths[this.activePair]);
      const branchIndex = this.activeBranchIndex;
      if (!this.activePair || branchIndex === null || branchIndex < 0) return false;
      if (state.completed) return false;

      const branch = state.branches[branchIndex] ?? [];
      const last = branch[branch.length - 1];
      const next = positionToArray(position);
      if (!last) {
        state.branches[branchIndex] = [next];
        this.paths[this.activePair] = this.compactPairPathState(state);
        return true;
      }
      if (samePoint(last, next)) return true;

      const previousIndex = branch.findIndex((point) => samePoint(point, next));
      if (previousIndex >= 0) {
        if (previousIndex === branch.length - 2) {
          state.branches[branchIndex] = branch.slice(0, previousIndex + 1);
          this.paths[this.activePair] = this.compactPairPathState(state);
          return true;
        }
        return false;
      }

      if (!isAdjacent(last, next, this.activeBoardLevel.gridType)) {
        const routed = this.addStepsToward(next);
        if (routed) return true;
        return false;
      }

      if (!this.availableEdgeSet.has(edgeKey(last, next))) return false;

      const edgeOccupant = this.getEdgeOccupant(last, next);
      if (edgeOccupant && edgeOccupant !== this.activePair) return false;
      if (edgeOccupant === this.activePair) return false;

      const endpointOwner = this.endpoints[keyOf(next[0], next[1])];
      if (this.isEndpointBlockingPath(endpointOwner, next)) return false;

      const mergeIndex = state.branches.findIndex((otherBranch, otherIndex) => (
        otherIndex !== branchIndex && otherBranch.some((point) => samePoint(point, next))
      ));

      const nodeOccupant = this.getNodeOccupant(next);
      if (nodeOccupant && nodeOccupant !== this.activePair) return false;
      if (nodeOccupant === this.activePair && mergeIndex < 0) return false;

      if (mergeIndex >= 0) {
        const merged = this.mergeBranchesAtPoint(state.branches[branchIndex], state.branches[mergeIndex], next);
        if (!merged) return false;
        if (!this.isWeaveModeEnabled && !this.pathTouchesBothEndpoints(this.activePair, merged)) return false;
        this.paths[this.activePair] = { branches: [merged], completed: !this.isWeaveModeEnabled };
        this.evaluateBoard();
        this.isDrawing = false;
        this.activePair = null;
        this.activePathMode = "";
        this.activeBranchIndex = null;
        this.activeRetractBranch = null;
        this.cancelLinkedBlinkTimer();
        return true;
      }

      const pair = this.getPair(this.activePair);
      const isOwnEndpoint = pair.points.length > 1 && pair.points.some((point) => samePoint(point, next));
      const isStartingEndpoint = samePoint(branch[0], next);
      if (isOwnEndpoint && !isStartingEndpoint) {
        const completed = [...branch, next];
        if (!this.pathTouchesBothEndpoints(this.activePair, completed)) return false;
        this.paths[this.activePair] = { branches: [completed], completed: true };
        this.evaluateBoard();
        this.isDrawing = false;
        this.activePair = null;
        this.activePathMode = "";
        this.activeBranchIndex = null;
        this.activeRetractBranch = null;
        this.cancelLinkedBlinkTimer();
        return true;
      }

      state.branches[branchIndex] = [...branch, next];
      this.paths[this.activePair] = this.compactPairPathState(state);
      return true;
    },

    /**
     * 沿水平或垂直方向向目标节点批量补步。
     *
     * @param {[number, number]} target 目标节点坐标。
     * @returns {boolean} 是否至少移动了一步。
     */
    addStepsToward(target) {
      const path = this.getActiveBranch();
      let current = path[path.length - 1];
      if (!current) return false;

      const dx = target[0] - current[0];
      const dy = target[1] - current[1];
      if (dx !== 0 && dy !== 0) {
        const firstTarget = Math.abs(dx) >= Math.abs(dy) ? [target[0], current[1]] : [current[0], target[1]];
        return this.addStepsToward(firstTarget);
      }

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let moved = false;

      while (!samePoint(current, target)) {
        const next = [current[0] + stepX, current[1] + stepY];
        if (!this.addStep({ x: next[0], y: next[1] })) return moved;
        moved = true;
        const updatedPath = this.getActiveBranch();
        current = updatedPath[updatedPath.length - 1];
        if (!this.activePair || !current) return moved;
      }

      return moved;
    },

    readPairPathState(pairId, value = this.paths[pairId]) {
      const pair = this.getPair(pairId);
      if (!pair) return { branches: [], completed: false };
      const branches = Array.isArray(value?.branches)
        ? value.branches.filter((branch) => Array.isArray(branch) && branch.length > 0)
        : [];
      const completed = Boolean(value?.completed) || branches.some((branch) => this.pathTouchesBothEndpoints(pairId, branch));
      return { branches, completed };
    },

    normalizePairPathState(pairId, value) {
      const state = this.readPairPathState(pairId, value);
      return {
        branches: state.branches.map((branch) => this.clonePath(branch)),
        completed: state.completed
      };
    },

    /**
     * 返回可存回 this.paths 的紧凑路径状态。
     *
     * @param {{ branches: Array<Array<[number, number]>>, completed: boolean }} state 路径状态。
     * @returns {Array|object} 紧凑路径状态。
     */
    compactPairPathState(state) {
      const branches = state.branches.filter((branch) => Array.isArray(branch) && branch.length > 0);
      if (!state.completed && branches.length === 0) return [];
      return { branches, completed: Boolean(state.completed) };
    },

    /**
     * 克隆路径坐标。
     *
     * @param {Array<[number, number]>} path 路径。
     * @returns {Array<[number, number]>} 克隆路径。
     */
    clonePath(path) {
      return Array.isArray(path) ? path.map((point) => [point[0], point[1]]) : [];
    },

    /**
     * 获取指定点对所有分支。
     *
     * @param {string} pairId 点对 id。
     * @returns {Array<Array<[number, number]>>} 分支列表。
     */
    getPairBranches(pairId) {
      return this.readPairPathState(pairId).branches;
    },

    /**
     * 获取当前活跃分支。
     *
     * @returns {Array<[number, number]>} 活跃分支。
     */
    getActiveBranch() {
      if (this.activePathMode === "completed-endpoint" && this.activeRetractBranch) {
        return this.activeRetractBranch;
      }
      if (!this.activePair || this.activeBranchIndex === null) return [];
      const state = this.readPairPathState(this.activePair);
      return state.branches[this.activeBranchIndex] ?? [];
    },

    /**
     * 从已完成端点向路径内部拖动时，按拖到的上一节点回拉路径。
     *
     * @param {{ x: number, y: number }} position 目标节点位置。
     * @returns {boolean} 是否完成回拉。
     */
    retractCompletedPathStep(position) {
      if (!this.activePair || !this.activeRetractBranch) return false;
      if (this.isPairHintLocked(this.activePair)) return false;
      const branch = this.activeRetractBranch;
      const next = positionToArray(position);
      const last = branch[branch.length - 1];
      if (!last || samePoint(last, next)) return true;

      const previousIndex = branch.findIndex((point) => samePoint(point, next));
      if (previousIndex < 0 || previousIndex >= branch.length - 1) return false;

      const nextBranch = branch.slice(0, previousIndex + 1);
      this.paths[this.activePair] = this.compactPairPathState({ branches: [nextBranch], completed: false });
      this.activeRetractBranch = null;
      this.activePathMode = "path-end";
      this.activeBranchIndex = 0;
      this.isWon = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
      return true;
    },

    /**
     * 获取点对端点索引。
     *
     * @param {string} pairId 点对 id。
     * @param {[number, number]} point 节点。
     * @returns {number} 端点索引。
     */
    getPairEndpointIndex(pairId, point) {
      const pair = this.getPair(pairId);
      return pair?.points.findIndex((endpoint) => samePoint(endpoint, point)) ?? -1;
    },

    /**
     * 判断路径是否触达点对两个端点。
     *
     * @param {string} pairId 点对 id。
     * @param {Array<[number, number]>} path 路径。
     * @returns {boolean} 是否触达两个端点。
     */
    pathTouchesBothEndpoints(pairId, path) {
      const pair = this.getPair(pairId);
      return Boolean(pair && pair.points.length >= 2 && pair.points.every((endpoint) => path.some((point) => samePoint(point, endpoint))));
    },

    /**
     * 将两条同色分支在交点处合并成一条完整路径。
     *
     * @param {Array<[number, number]>} activeBranch 当前分支。
     * @param {Array<[number, number]>} otherBranch 另一条分支。
     * @param {[number, number]} mergePoint 合并点。
     * @returns {Array<[number, number]>|null} 合并路径。
     */
    mergeBranchesAtPoint(activeBranch, otherBranch, mergePoint) {
      const activeIndex = activeBranch.findIndex((point) => samePoint(point, mergePoint));
      const otherIndex = otherBranch.findIndex((point) => samePoint(point, mergePoint));
      const nextActive = activeIndex >= 0 ? activeBranch.slice(0, activeIndex + 1) : [...activeBranch, mergePoint];
      if (otherIndex < 0) return null;
      const nextOther = otherBranch.slice(0, otherIndex + 1);
      const merged = nextActive.concat(nextOther.slice(0, -1).reverse());
      const keys = new Set();
      for (const point of merged) {
        const key = keyOf(point[0], point[1]);
        if (keys.has(key)) return null;
        keys.add(key);
      }
      return merged;
    },

    /**
     * 获取所有已绘制路径线段。
     *
     * @returns {Array<{ pairId: string, from: [number, number], to: [number, number], edge: string }>} 线段列表。
     */
    getPathSegments() {
      const segments = [];
      Object.entries(this.paths).forEach(([pairId]) => {
        this.getPairBranches(pairId).forEach((branch) => {
          for (let index = 1; index < branch.length; index += 1) {
            const from = branch[index - 1];
            const to = branch[index];
            segments.push({ pairId, from, to, edge: edgeKey(from, to) });
          }
        });
      });
      return segments;
    },

    /**
     * 获取给校验器使用的完成路径视图。
     *
     * @returns {Record<string, Array<[number, number]>>} 单路径视图。
     */
    getCompletedPathView() {
      return Object.fromEntries(
        Object.entries(this.paths).map(([pairId]) => {
          const state = this.readPairPathState(pairId);
          const completed = this.isWeaveModeEnabled
            ? state.branches[0]
            : state.branches.find((branch) => this.pathTouchesBothEndpoints(pairId, branch));
          return [pairId, completed ?? []];
        })
      );
    },

    /**
     * 用关卡答案检查当前已完成连线，正确连线会锁定到重置为止。
     *
     * @returns {Promise<void>}
     */
    async revealCorrectHintLines(showEmptyStatus = true) {
      if (!this.currentLevel) return;
      this.isHintModeEnabled = true;
      const hasAnswers = await this.ensureCurrentLevelAnswerCache();
      if (!this.isHintModeEnabled) return;
      if (!hasAnswers) {
        if (showEmptyStatus) this.hintStatusText = "本关暂无答案";
        return;
      }

      this.markCorrectHintLinesFromAnswerCache();
      this.hintStatusText = "";
    },

    /**
     * 使用已缓存答案同步标记当前正确连线。
     *
     * @returns {void}
     */
    markCorrectHintLinesFromAnswerCache() {
      if (!this.currentLevel || !this.hintAnswerEdgesByPair) return;
      const nextLockedPairs = { ...this.hintLockedPairs };

      for (const pair of this.currentLevel.pairs) {
        if (nextLockedPairs[pair.id]) continue;
        const answerEdges = this.hintAnswerEdgesByPair.get(pair.id);
        if (!answerEdges?.size) continue;
        const state = this.readPairPathState(pair.id);
        const completedBranch = state.branches.find((branch) => this.pathTouchesBothEndpoints(pair.id, branch));
        if (!completedBranch || !this.isPathStructurallyValid(pair.id, completedBranch)) continue;
        const pathEdges = this.getPathEdgeSet(completedBranch);
        if (this.areEdgeSetsEqual(pathEdges, answerEdges)) {
          nextLockedPairs[pair.id] = true;
        }
      }

      this.hintLockedPairs = nextLockedPairs;
    },

    /**
     * 切换辅助模式。关闭时移除辅助标记和锁定。
     *
     * @param {boolean} enabled 是否开启。
     * @returns {Promise<void>}
     */
    async setAssistMode(enabled) {
      this.isHintModeEnabled = Boolean(enabled);
      if (!this.isHintModeEnabled) {
        this.hintLockedPairs = {};
        this.hintStatusText = "";
        this.savePersonalizationSettings();
        return;
      }

      this.savePersonalizationSettings();
      await this.revealCorrectHintLines();
    },

    /**
     * 切换关联闪烁。关闭时立即停止当前闪烁。
     *
     * @param {boolean} enabled 是否开启。
     * @returns {void}
     */
    setLinkedBlinkMode(enabled) {
      this.isLinkedBlinkEnabled = Boolean(enabled);
      if (!this.isLinkedBlinkEnabled) {
        this.cancelLinkedBlinkTimer();
      }
      this.savePersonalizationSettings();
    },

    /**
     * 按需读取并缓存当前关卡答案。
     *
     * @returns {Promise<boolean>} 是否存在可用答案。
     */
    async ensureCurrentLevelAnswerCache() {
      if (!this.currentLevel?.sourcePath) return false;
      const levelKey = this.getLevelCacheKey(this.currentLevel);
      if (this.hintAnswersCacheKey === levelKey && this.hintAnswerEdgesByPair) {
        return this.hintAnswerEdgesByPair.size > 0;
      }
      if (this.isHintAnswerLoading) return false;

      this.isHintAnswerLoading = true;
      let answers = [];
      try {
        answers = await loadLevelAnswers(this.currentLevel);
      } finally {
        this.isHintAnswerLoading = false;
      }
      if (this.getLevelCacheKey(this.currentLevel) !== levelKey) return false;
      this.currentLevel = {
        ...this.currentLevel,
        answers
      };
      this.hintAnswerEdgesByPair = this.getAnswerEdgesByPair(answers);
      this.hintAnswersCacheKey = levelKey;
      return this.hintAnswerEdgesByPair.size > 0;
    },

    /**
     * 按点对分组答案边。
     *
     * @returns {Map<string, Set<string>>} 点对到答案边集合。
     */
    getAnswerEdgesByPair(answers = this.currentLevel?.answers ?? []) {
      const edgesByPair = new Map();
      answers.forEach((answer) => {
        const pairId = String(answer?.pairId ?? "");
        if (!answer?.edge || !pairId) return;
        if (!edgesByPair.has(pairId)) edgesByPair.set(pairId, new Set());
        edgesByPair.get(pairId).add(answer.edge);
      });
      return edgesByPair;
    },

    /**
     * 获取路径覆盖的边集合。
     *
     * @param {Array<[number, number]>} path 路径。
     * @returns {Set<string>} 边集合。
     */
    getPathEdgeSet(path) {
      const edges = new Set();
      for (let index = 1; index < path.length; index += 1) {
        edges.add(edgeKey(path[index - 1], path[index]));
      }
      return edges;
    },

    /**
     * 比较两个边集合是否完全一致。
     *
     * @param {Set<string>} left 左集合。
     * @param {Set<string>} right 右集合。
     * @returns {boolean} 是否一致。
     */
    areEdgeSetsEqual(left, right) {
      if (left.size !== right.size) return false;
      for (const edge of left) {
        if (!right.has(edge)) return false;
      }
      return true;
    },

    /**
     * 判断指定点对是否已由提示锁定。
     *
     * @param {string} pairId 点对 id。
     * @returns {boolean} 是否锁定。
     */
    isPairHintLocked(pairId) {
      return Boolean(this.hintLockedPairs[pairId]);
    },

    /**
     * 双击未完成路径节点时回退到该节点。
     *
     * @param {[number, number]} point 节点。
     * @returns {boolean} 是否回退。
     */
    rollbackIncompletePathAtPoint(point) {
      const nodeKey = keyOf(point[0], point[1]);
      for (const [pairId] of Object.entries(this.paths)) {
        if (this.isPairHintLocked(pairId)) continue;
        const state = this.normalizePairPathState(pairId, this.paths[pairId]);
        if (state.completed) continue;
        const branchIndex = state.branches.findIndex((branch) => branch.some((item) => keyOf(item[0], item[1]) === nodeKey));
        if (branchIndex < 0) continue;
        const pointIndex = state.branches[branchIndex].findIndex((item) => keyOf(item[0], item[1]) === nodeKey);
        if (pointIndex <= 0) continue;
        state.branches[branchIndex] = state.branches[branchIndex].slice(0, pointIndex + 1);
        this.paths[pairId] = this.compactPairPathState(state);
        this.activePair = null;
        this.activePathMode = "";
        this.activeBranchIndex = null;
        this.activeRetractBranch = null;
        this.isDrawing = false;
        this.isWon = false;
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
        return true;
      }
      return false;
    },

    /**
     * 双击已完成路径的中间节点时，断开离该节点更近的一端。
     *
     * @param {[number, number]} point 节点。
     * @returns {boolean} 是否断开。
     */
    breakCompletedPathAtPoint(point) {
      const nodeKey = keyOf(point[0], point[1]);
      for (const [pairId] of Object.entries(this.paths)) {
        if (this.isPairHintLocked(pairId)) continue;
        const state = this.normalizePairPathState(pairId, this.paths[pairId]);
        const branchIndex = state.branches.findIndex((branch) => this.pathTouchesBothEndpoints(pairId, branch));
        if (branchIndex < 0) continue;

        const branch = state.branches[branchIndex];
        const pointIndex = branch.findIndex((item) => keyOf(item[0], item[1]) === nodeKey);
        if (pointIndex <= 0 || pointIndex >= branch.length - 1) continue;

        const distanceToStart = pointIndex;
        const distanceToEnd = branch.length - 1 - pointIndex;
        // Unfinished branches must start at an endpoint, so reverse when keeping the end side.
        const nextBranch = distanceToStart <= distanceToEnd
          ? branch.slice(pointIndex).reverse()
          : branch.slice(0, pointIndex + 1);

        this.paths[pairId] = this.compactPairPathState({ branches: [nextBranch], completed: false });
        this.activePair = null;
        this.activePathMode = "";
        this.activeBranchIndex = null;
        this.activeRetractBranch = null;
        this.isDrawing = false;
        this.isWon = false;
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
        return true;
      }
      return false;
    },

    /**
     * 重新评估棋盘是否满足通关条件。
     *
     * @returns {void}
     */
    evaluateBoard() {
      if (this.isHintModeEnabled) {
        this.markCorrectHintLinesFromAnswerCache();
      }

      if (this.isWeaveModeEnabled) return;

      // Win when every pair is connected and every traversable node is covered.
      if (!this.areAllPathsStructurallyValid()) {
        this.isWon = false;
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
        return;
      }

      const allConnected = this.activeBoardLevel.pairs.every((pair) => this.isPairConnected(pair));
      const allFilled = this.isBoardFilled();
      const weaveCluesSatisfied = this.isWeavePathClueSatisfied();
      const wasWon = this.isWon;
      this.isWon = allConnected && allFilled && weaveCluesSatisfied;
      if (!this.isWon) {
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
      }
      if (this.isWon && !wasWon) {
        this.stopGameTimer();
        this.markCurrentLevelCompleted();
        this.preloadNextLevelPage();
      }
    },

    /**
     * 当前页接近尾部时预取下一批关卡，减少下一关等待。
     *
     * @returns {void}
     */
    preloadNextLevelPage() {
      // 关卡目录已预先加载；完整关卡内容在打开时按需读取。
    },

    /**
     * 从事件中获取吸附后的棋盘节点位置。
     *
     * @param {PointerEvent|MouseEvent} event 指针或鼠标事件。
     * @returns {{ x: number, y: number }|null} 节点位置。
     */
    positionFromEvent(event) {
      const point = this.nearestPositionFromEvent(event);
      if (!point) return null;
      return point;
    },

    /**
     * 从事件位置寻找最近的可吸附网格节点。
     *
     * @param {PointerEvent|MouseEvent} event 指针或鼠标事件。
     * @returns {{ x: number, y: number }|null} 最近节点；超出吸附容差时返回 null。
     */
    nearestPositionFromEvent(event) {
      const point = this.pointerPositionFromEvent(event);
      return this.nearestPositionFromPointer(point);
    },

    /**
     * 从逻辑指针位置寻找最近的可吸附网格节点。
     *
     * @param {{ renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 最近节点；超出吸附容差时返回 null。
     */
    nearestPositionFromPointer(point) {
      if (!point) return null;
      let nearest = null;
      let nearestDistance = Infinity;
      this.boardSnapNodes.forEach((node) => {
        const distance = Math.hypot(point.renderX - node.renderX, point.renderY - node.renderY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { x: node.x, y: node.y };
        }
      });
      const snapTolerance = Math.max(this.mapStyle.snapPointTolerance, this.mapStyle.dotScale * 0.55, this.mapStyle.lineScale * 0.45);
      if (!nearest || nearestDistance > snapTolerance) return null;
      return nearest;
    },

    /**
     * 拖拽时解析目标节点：直接命中优先，否则按当前路径末端的合法邻居推断。
     *
     * @param {{ x: number, y: number, renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 目标节点。
     */
    dragPositionFromPointer(point) {
      if (!point) return null;
      const direct = this.nearestPositionFromPointer(point);
      if (direct) return direct;
      return this.directionalDragPositionFromPointer(point);
    },

    /**
     * 当指针没有命中节点时，根据拖拽方向选择当前末端的合法相邻节点。
     *
     * @param {{ renderX: number, renderY: number }|null} point 指针逻辑位置。
     * @returns {{ x: number, y: number }|null} 方向推断出的目标节点。
     */
    directionalDragPositionFromPointer(point) {
      if (!point || this.activePathMode === "completed-endpoint") return null;
      const branch = this.getActiveBranch();
      const current = branch[branch.length - 1];
      if (!current) return null;
      const currentRender = this.toBoardDisplayPoint(current);
      const pointerVector = [point.renderX - currentRender[0], point.renderY - currentRender[1]];
      const pointerDistance = Math.hypot(pointerVector[0], pointerVector[1]);
      if (pointerDistance <= 0) return null;

      const snapTolerance = Math.max(this.mapStyle.snapPointTolerance, this.mapStyle.dotScale * 0.55, this.mapStyle.lineScale * 0.45);
      let best = null;
      let bestScore = Infinity;

      this.getDirectionalDragCandidates(current).forEach((candidate) => {
        if (!this.canPreviewStepTo(candidate)) return;
        const candidateRender = this.toBoardDisplayPoint(candidate);
        const edgeVector = [candidateRender[0] - currentRender[0], candidateRender[1] - currentRender[1]];
        const edgeLength = Math.hypot(edgeVector[0], edgeVector[1]);
        if (edgeLength <= 0 || pointerDistance < edgeLength * 0.68) return;

        const projection = (pointerVector[0] * edgeVector[0] + pointerVector[1] * edgeVector[1]) / (edgeLength * edgeLength);
        if (projection < 0.63) return;

        const perpendicular = Math.abs(pointerVector[0] * edgeVector[1] - pointerVector[1] * edgeVector[0]) / edgeLength;
        const distanceToCandidate = Math.hypot(point.renderX - candidateRender[0], point.renderY - candidateRender[1]);
        const tolerance = Math.max(snapTolerance, edgeLength * 0.24);
        if (perpendicular > tolerance && distanceToCandidate > edgeLength * 0.65) return;

        const score = distanceToCandidate + Math.max(0, perpendicular - snapTolerance) * 0.65;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });

      return best ? { x: best[0], y: best[1] } : null;
    },

    /**
     * 获取当前节点可尝试拖向的相邻节点。
     *
     * @param {[number, number]} current 当前路径末端。
     * @returns {Array<[number, number]>} 候选节点。
     */
    getDirectionalDragCandidates(current) {
      return this.boardNeighborMap.get(keyOf(current[0], current[1])) ?? [];
    },

    /**
     * 轻量预判目标节点是否可能被当前路径追加，避免方向吸附选中非法点。
     *
     * @param {[number, number]} next 目标节点。
     * @returns {boolean} 是否可作为拖拽候选。
     */
    canPreviewStepTo(next) {
      if (!this.activePair || this.activeBranchIndex === null) return false;
      const state = this.readPairPathState(this.activePair);
      if (state.completed) return false;
      const branch = state.branches[this.activeBranchIndex] ?? [];
      const last = branch[branch.length - 1];
      if (!last || samePoint(last, next)) return false;

      const previousIndex = branch.findIndex((point) => samePoint(point, next));
      if (previousIndex >= 0) return previousIndex === branch.length - 2;
      if (!isAdjacent(last, next, this.activeBoardLevel.gridType)) return false;
      if (!this.availableEdgeSet.has(edgeKey(last, next))) return false;

      const edgeOccupant = this.getEdgeOccupant(last, next);
      if (edgeOccupant) return false;

      const endpointOwner = this.endpoints[keyOf(next[0], next[1])];
      if (this.isEndpointBlockingPath(endpointOwner, next)) return false;

      const mergeIndex = state.branches.findIndex((otherBranch, otherIndex) => (
        otherIndex !== this.activeBranchIndex && otherBranch.some((point) => samePoint(point, next))
      ));
      const nodeOccupant = this.getNodeOccupant(next);
      if (nodeOccupant && nodeOccupant !== this.activePair) return false;
      if (nodeOccupant === this.activePair && mergeIndex < 0) return false;
      return true;
    },

    /**
     * 将屏幕指针坐标转换为逻辑网格坐标。
     *
     * @param {PointerEvent|MouseEvent} event 指针或鼠标事件。
     * @returns {{ x: number, y: number }|null} 逻辑坐标。
     */
    pointerPositionFromEvent(event) {
      const boardElement = event.currentTarget ?? this.$refs.boardRef;
      if (!boardElement && !this.boardPointerGeometry) return null;
      if (!this.boardPointerGeometry) {
        this.cacheBoardPointerGeometry(boardElement);
      }
      const geometry = this.boardPointerGeometry;
      if (!geometry) return null;
      const bounds = geometry.bounds;
      const renderX = bounds.minX + ((event.clientX - geometry.left) / geometry.width) * bounds.width;
      const renderY = bounds.minY + ((event.clientY - geometry.top) / geometry.height) * bounds.height;
      const [x, y] = this.fromBoardDisplayPoint([renderX, renderY], geometry.sourceBounds);
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x, y, renderX, renderY };
    },

    /**
     * 判断某个节点是否可以作为路径起点。
     *
     * @param {{ x: number, y: number }} position 节点位置。
     * @returns {{ pairId: string, mode: string }|null} 起点信息。
     */
    getPathStartInfo(position) {
      const endpointPairId = this.endpoints[keyOf(position.x, position.y)];
      if (endpointPairId) {
        const endpointMode = this.getEndpointStartMode(endpointPairId, position);
        if (endpointMode) {
          return { pairId: endpointPairId, mode: endpointMode };
        }
      }

      for (const [pairId] of Object.entries(this.paths)) {
        const state = this.readPairPathState(pairId);
        if (state.completed) continue;
        const branchIndex = state.branches.findIndex((branch) => samePoint(branch[branch.length - 1], positionToArray(position)));
        if (branchIndex >= 0) {
          return { pairId, mode: "path-end" };
        }
      }

      return null;
    },

    /**
     * 判断指定端点是否允许作为路径起点。
     *
     * @param {string} pairId 点对 id。
     * @param {{ x: number, y: number }} position 端点位置。
     * @returns {"endpoint"|"completed-endpoint"|""} 起点模式；不可开始时返回空字符串。
     */
    getEndpointStartMode(pairId, position) {
      if (this.isPairHintLocked(pairId)) return "";
      const state = this.readPairPathState(pairId);
      const point = positionToArray(position);
      if (state.completed) {
        const completedBranch = state.branches.find((branch) => this.pathTouchesBothEndpoints(pairId, branch));
        if (!completedBranch) return "";
        const isCompletedEnd = samePoint(completedBranch[0], point) || samePoint(completedBranch[completedBranch.length - 1], point);
        return isCompletedEnd ? "completed-endpoint" : "";
      }

      const branch = state.branches.find((item) => samePoint(item[0], point));
      if (!branch) return state.branches.length < 2 ? "endpoint" : "";
      return samePoint(branch[branch.length - 1], point) && this.getPathDegree(branch, point) <= 1 ? "endpoint" : "";
    },

    /**
     * 判断指定端点是否允许作为路径起点。
     *
     * @param {string} pairId 点对 id。
     * @param {{ x: number, y: number }} position 端点位置。
     * @returns {boolean} 是否可开始绘制。
     */
    canStartFromEndpoint(pairId, position) {
      return Boolean(this.getEndpointStartMode(pairId, position));
    },

    /**
     * 清空指定点对路径。
     *
     * @param {string} pairId 点对 id。
     * @returns {void}
     */
    clearPairPath(pairId) {
      if (this.isPairHintLocked(pairId)) return;
      const state = this.normalizePairPathState(pairId, this.paths[pairId]);
      if (state.branches.length === 0) {
        return;
      }

      this.paths[pairId] = { branches: [], completed: false };
      this.activePair = null;
      this.activePathMode = "";
      this.activeBranchIndex = null;
      this.activeRetractBranch = null;
      this.isDrawing = false;
      this.isWon = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
    },

    /**
     * 暂停当前路径绘制，并在必要时重新判定棋盘。
     *
     * @param {string} pairId 点对 id。
     * @param {boolean} hasMoved 本次指针是否移动过。
     * @returns {void}
     */
    pausePath(pairId, hasMoved) {
      const state = this.readPairPathState(pairId);
      this.isDrawing = false;
      this.activePair = null;
      this.activePathMode = "";
      this.activeBranchIndex = null;
      this.activeRetractBranch = null;

      if (state.completed) {
        this.evaluateBoard();
        return;
      }

      if (!hasMoved) {
        return;
      }
    },

    /**
     * 停止当前绘制状态。
     *
     * @returns {void}
     */
    stopDrawing() {
      this.isDrawing = false;
      this.activePair = null;
      this.activePathMode = "";
      this.activeBranchIndex = null;
      this.activeRetractBranch = null;
      this.pointerMoved = false;
      this.cancelLinkedBlinkTimer();
      this.cancelBoardDragFrame();
      this.clearPointerPreview();
      this.lastPointerNodeKey = "";
      this.boardPointerGeometry = null;
    },

    /**
     * 启动游戏计时器。
     *
     * @returns {void}
     */
    startGameTimer() {
      if (this.timerStartedAt !== null) return;
      this.timerStartedAt = Date.now();
      this.timerElapsedMs = 0;
      this.timerIntervalId = window.setInterval(() => {
        this.updateGameTimer();
      }, 250);
    },

    /**
     * 根据开始时间刷新当前用时。
     *
     * @returns {void}
     */
    updateGameTimer() {
      if (this.timerStartedAt === null) return;
      this.timerElapsedMs = Date.now() - this.timerStartedAt;
    },

    /**
     * 停止游戏计时器并同步最终用时。
     *
     * @returns {void}
     */
    stopGameTimer() {
      if (this.timerIntervalId !== null) {
        window.clearInterval(this.timerIntervalId);
        this.timerIntervalId = null;
      }
      this.updateGameTimer();
    },

    /**
     * 重置游戏计时器状态。
     *
     * @returns {void}
     */
    resetGameTimer() {
      if (this.timerIntervalId !== null) {
        window.clearInterval(this.timerIntervalId);
      }
      this.timerStartedAt = null;
      this.timerElapsedMs = 0;
      this.timerIntervalId = null;
    },

    /**
     * 延迟 0.5 秒后启用同色端点闪烁。
     *
     * @param {string} pairId 当前点对 id。
     * @returns {void}
     */
    scheduleLinkedBlink(pairId) {
      this.cancelLinkedBlinkTimer();
      if (!this.isLinkedBlinkEnabled || !pairId) return;
      this.linkedBlinkTimerId = window.setTimeout(() => {
        this.linkedBlinkTimerId = null;
        if (!this.isLinkedBlinkEnabled || !this.isDrawing || this.activePair !== pairId) return;
        this.isLinkedBlinkActive = true;
      }, 500);
    },

    /**
     * 停止关联闪烁并清理延迟计时器。
     *
     * @returns {void}
     */
    cancelLinkedBlinkTimer() {
      if (this.linkedBlinkTimerId !== null) {
        window.clearTimeout(this.linkedBlinkTimerId);
        this.linkedBlinkTimerId = null;
      }
      this.isLinkedBlinkActive = false;
    },

    /**
     * 缓存棋盘尺寸和网格边界，避免绘制过程中每帧读取 DOM 布局。
     *
     * @param {HTMLElement|null} boardElement 棋盘元素。
     * @returns {void}
     */
    cacheBoardPointerGeometry(boardElement) {
      if (!boardElement || !this.activeBoardLevel) {
        this.boardPointerGeometry = null;
        return;
      }
      const rect = boardElement.getBoundingClientRect();
      this.boardPointerGeometry = {
        left: rect.left,
        top: rect.top,
        width: rect.width || 1,
        height: rect.height || 1,
        bounds: this.boardDisplayBounds,
        sourceBounds: getGridBounds(this.activeBoardLevel)
      };
    },

    /**
     * 判断连续两次点击是否构成棋盘双击。
     *
     * @param {PointerEvent} event 指针事件。
     * @param {{ x: number, y: number }} position 吸附节点。
     * @returns {boolean} 是否双击。
     */
    isBoardDoubleTap(event, position) {
      const lastTap = this.lastBoardTap;
      if (!lastTap) return false;
      if (lastTap.pointerType !== event.pointerType) return false;
      const elapsed = event.timeStamp - lastTap.timeStamp;
      const maxElapsed = event.pointerType === "touch" ? TOUCH_DOUBLE_TAP_MS : POINTER_DOUBLE_TAP_MS;
      if (elapsed < 0 || elapsed > maxElapsed) return false;
      if (lastTap.nodeKey !== keyOf(position.x, position.y)) return false;
      const distance = Math.hypot(event.clientX - lastTap.clientX, event.clientY - lastTap.clientY);
      const maxDistance = event.pointerType === "touch" ? TOUCH_DOUBLE_TAP_DISTANCE : POINTER_DOUBLE_TAP_DISTANCE;
      return distance <= maxDistance;
    },

    /**
     * 记录点击，用于自行识别棋盘双击。
     *
     * @param {PointerEvent} event 指针事件。
     * @param {{ x: number, y: number }} position 吸附节点。
     * @returns {void}
     */
    rememberBoardTap(event, position) {
      this.lastBoardTap = {
        timeStamp: event.timeStamp,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        nodeKey: keyOf(position.x, position.y)
      };
    },

    /**
     * 合并预览线更新到下一帧，降低移动端响应式更新频率。
     *
     * @param {{ x: number, y: number }|null} preview 指针预览位置。
     * @returns {void}
     */
    queuePointerPreview(preview) {
      this.pendingPointerPreview = preview;
      if (this.pointerPreviewFrameId) return;
      this.pointerPreviewFrameId = window.requestAnimationFrame(() => {
        this.pointerPreviewFrameId = 0;
        this.pointerPreview = this.pendingPointerPreview;
      });
    },

    /**
     * 取消挂起的预览线帧。
     *
     * @returns {void}
     */
    cancelPointerPreviewFrame() {
      if (!this.pointerPreviewFrameId) return;
      window.cancelAnimationFrame(this.pointerPreviewFrameId);
      this.pointerPreviewFrameId = 0;
    },

    /**
     * 清理预览线状态。
     *
     * @returns {void}
     */
    clearPointerPreview() {
      this.cancelPointerPreviewFrame();
      this.pendingPointerPreview = null;
      this.pointerPreview = null;
    },

    /**
     * 将拖拽节点计算合并到下一帧，避免高频 pointermove 压低帧率。
     *
     * @param {{ x: number, y: number, renderX: number, renderY: number }|null} point 最新指针位置。
     * @returns {void}
     */
    queueBoardDragPosition(point) {
      this.pendingBoardDragPosition = point;
      if (this.boardDragFrameId) return;
      this.boardDragFrameId = window.requestAnimationFrame(() => {
        this.boardDragFrameId = 0;
        this.processQueuedBoardDragPosition();
      });
    },

    /**
     * 处理当前帧最后一次拖拽位置。
     *
     * @returns {void}
     */
    processQueuedBoardDragPosition() {
      const pointerPosition = this.pendingBoardDragPosition;
      this.pendingBoardDragPosition = null;
      if (!this.isDrawing || !this.activePair || !pointerPosition) return;

      const position = this.dragPositionFromPointer(pointerPosition);
      if (!position) return;
      const nodeKey = keyOf(position.x, position.y);
      if (nodeKey === this.lastPointerNodeKey) return;
      if (this.addStep(position)) {
        this.pointerMoved = true;
        this.lastPointerNodeKey = nodeKey;
      }
    },

    /**
     * 取消挂起的拖拽计算帧。
     *
     * @returns {void}
     */
    cancelBoardDragFrame() {
      if (this.boardDragFrameId) {
        window.cancelAnimationFrame(this.boardDragFrameId);
        this.boardDragFrameId = 0;
      }
      this.pendingBoardDragPosition = null;
    },

    /**
     * 将用时规整到 10 毫秒精度。
     *
     * @param {number} milliseconds 原始毫秒数。
     * @returns {number} 规整后的毫秒数。
     */
    normalizeTimerElapsedMs(milliseconds) {
      return Math.floor(Math.max(0, milliseconds) / 10) * 10;
    },

    /**
     * 安全释放指针捕获。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    releasePointer(event) {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },

    /**
     * 将一条路径按指定端点重排，使该端点位于分支末尾，便于回拉撤线。
     *
     * @param {Array<[number, number]>} branch 路径分支。
     * @param {[number, number]} point 选中的端点。
     * @returns {Array<[number, number]>|null} 重排后的分支；不是端点时返回 null。
     */
    orientBranchToEndAtPoint(branch, point) {
      if (!Array.isArray(branch) || branch.length === 0) return null;
      if (samePoint(branch[branch.length - 1], point)) return this.clonePath(branch);
      if (samePoint(branch[0], point)) return this.clonePath(branch).reverse();
      return null;
    },

    /**
     * 获取当前关卡中的点对配置。
     *
     * @param {string} pairId 点对 id。
     * @returns {object|null} 点对配置。
     */
    getPair(pairId) {
      return this.activeBoardLevel?.pairs.find((pair) => pair.id === pairId) ?? null;
    },

    /**
     * 查找指定边当前被哪个点对占用。
     *
     * @param {[number, number]} from 边起点。
     * @param {[number, number]} to 边终点。
     * @returns {string|null} 占用点对 id。
     */
    getEdgeOccupant(from, to) {
      const edge = edgeKey(from, to);
      for (const [pairId] of Object.entries(this.paths)) {
        for (const branch of this.getPairBranches(pairId)) {
          for (let index = 1; index < branch.length; index += 1) {
            if (edgeKey(branch[index - 1], branch[index]) === edge) return pairId;
          }
        }
      }
      return null;
    },

    /**
     * 查找指定节点当前被哪个点对占用。
     *
     * @param {[number, number]} point 节点坐标。
     * @returns {string|null} 占用点对 id。
     */
    getNodeOccupant(point) {
      const nodeKey = keyOf(point[0], point[1]);
      for (const [pairId] of Object.entries(this.paths)) {
        if (this.getPairBranches(pairId).some((branch) => branch.some(([x, y]) => keyOf(x, y) === nodeKey))) return pairId;
      }
      return null;
    },

    /**
     * 判断当前关卡中某条边是否已被移除。
     *
     * @param {string} edge 边 key。
     * @returns {boolean} 是否移除。
     */
    isLevelEdgeRemoved(edge) {
      return new Set(this.activeBoardLevel?.removedEdges ?? []).has(edge);
    },

    /**
     * 判断当前路径中的端点是否已经接入过线路。
     *
     * @param {string} pairId 点对 id。
     * @param {[number, number]} point 端点坐标。
     * @returns {boolean} 是否已连接。
     */
    isEndpointAlreadyLinked(pairId, point) {
      return this.getPairBranches(pairId).some((branch) => this.getPathDegree(branch, point) > 0);
    },

    /**
     * 获取节点在路径中的连接度。
     *
     * @param {Array<[number, number]>} path 路径坐标。
     * @param {[number, number]} point 节点坐标。
     * @returns {number} 相邻路径节点数量。
     */
    getPathDegree(path, point) {
      const index = path.findIndex((item) => samePoint(item, point));
      if (index < 0) return 0;
      return [path[index - 1], path[index + 1]].filter(Boolean).length;
    },

    /**
     * 判断路径是否已经经过点对的两个端点。
     *
     * @param {string} pairId 点对 id。
     * @param {Array<[number, number]>} path 路径坐标。
     * @returns {boolean} 是否到达两个端点。
     */
    hasPairReachedBothEndpoints(pairId, path) {
      return this.pathTouchesBothEndpoints(pairId, path);
    },

    /**
     * 判断点对路径是否从一个端点连到另一个端点。
     *
     * @param {object} pair 点对配置。
     * @returns {boolean} 是否完成连接。
     */
    isPairConnected(pair) {
      const state = this.readPairPathState(pair.id);
      return state.branches.some((path) => {
        if (path.length < 2) return false;
        const first = path[0];
        const last = path[path.length - 1];
        return (
          (samePoint(first, pair.points[0]) && samePoint(last, pair.points[1])) ||
          (samePoint(first, pair.points[1]) && samePoint(last, pair.points[0]))
        );
      });
    },

    /**
     * 校验所有路径是否满足结构规则。
     *
     * @returns {boolean} 是否全部有效。
     */
    areAllPathsStructurallyValid() {
      return areAllPathsStructurallyValid(this.activeBoardLevel, this.getCompletedPathView(), this.endpoints);
    },

    /**
     * 校验所有节点是否只被一个点对占用。
     *
     * @returns {boolean} 是否无跨点对重叠。
     */
    areAllNodesExclusive() {
      const nodes = new Map();
      for (const [pairId] of Object.entries(this.paths)) {
        for (const branch of this.getPairBranches(pairId)) {
          for (const point of branch) {
            const nodeKey = keyOf(point[0], point[1]);
            const occupant = nodes.get(nodeKey);
            if (occupant && occupant !== pairId) return false;
            nodes.set(nodeKey, pairId);
          }
        }
      }
      return true;
    },

    /**
     * 校验单条路径的节点重复、相邻边和端点度数规则。
     *
     * @param {string} pairId 点对 id。
     * @param {Array<[number, number]>} path 路径坐标。
     * @returns {boolean} 路径结构是否有效。
     */
    isPathStructurallyValid(pairId, path) {
      return isPathStructurallyValid(this.activeBoardLevel, pairId, path, this.endpoints);
    },

    /**
     * 判断棋盘是否填满所有可通行节点。
     *
     * @returns {boolean} 是否满足填充条件。
     */
    isBoardFilled() {
      return isLevelAnswerFilled(this.activeBoardLevel, this.getCompletedPathView());
    },

    /**
     * 获取当前关卡要求覆盖的答案边。
     *
     * @returns {Set<string>} 答案边集合。
     */
    getAnswerEdges() {
      return getAnswerEdges(this.currentLevel);
    },

    /**
     * 获取玩家当前已绘制的全部边。
     *
     * @returns {Set<string>} 已绘制边集合。
     */
    getFilledEdges() {
      return new Set(this.getPathSegments().map((segment) => segment.edge));
    },

    /**
     * 获取玩家当前已占用的全部节点。
     *
     * @returns {Set<string>} 已占用节点集合。
     */
    getFilledNodes() {
      const nodes = new Set();
      Object.keys(this.paths).forEach((pairId) => {
        this.getPairBranches(pairId).forEach((branch) => {
          branch.forEach(([x, y]) => nodes.add(keyOf(x, y)));
        });
      });
      return nodes;
    },

    /**
     * 获取没有被完全移除的必需节点。
     *
     * @returns {string[]} 必需节点 key 列表。
     */
    getRequiredNodes() {
      return getRequiredNodes(this.activeBoardLevel);
    },

    /**
     * 获取当前还可以继续延伸的路径末端。
     *
     * @returns {Set<string>} 末端节点 key 集合。
     */
    getExtendableEnds() {
      const ends = new Set();
      Object.entries(this.paths).forEach(([pairId]) => {
        const state = this.readPairPathState(pairId);
        if (state.completed) return;
        state.branches.forEach((branch) => {
          const last = branch[branch.length - 1];
          if (last) ends.add(keyOf(last[0], last[1]));
        });
      });
      return ends;
    },

    /**
     * 判断节点是否是当前活跃路径的末端。
     *
     * @param {number} x 节点横坐标。
     * @param {number} y 节点纵坐标。
     * @returns {boolean} 是否为活跃节点。
     */
    isActiveNode(x, y) {
      if (!this.activePair) return false;
      const last = this.getActiveBranch().at(-1);
      return Boolean(last && last[0] === x && last[1] === y);
    },

    /**
     * 获取当前活跃路径应连接的目标端点 key。
     *
     * @returns {string} 目标端点 key；没有活跃路径时为空字符串。
     */
    getActiveTargetKey() {
      if (!this.activePair) return "";
      const pair = this.getPair(this.activePair);
      const path = this.getActiveBranch();
      const start = path[0];
      if (!pair || !start) return "";

      const target = pair.points.find((point) => !samePoint(point, start));
      return target ? keyOf(target[0], target[1]) : "";
    },

};
