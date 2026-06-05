import { appConfig } from "../config/index.js";
import { areAllNodesExclusive, areAllPathsStructurallyValid, getAnswerEdges, getFilledEdges, getFilledNodes, getRequiredNodes, isLevelAnswerFilled, isPathStructurallyValid } from "../editor/checker.js";
import { reviewLevelRequest } from "../router/levels.js";
import { cloneLevel, hydrateLevel, loadLevelFiles } from "../services/levels.js";
import { edgeKey, fromRenderPoint, getAllGridEdges, getGridBounds, getGridNodes, isAdjacent, keyOf, positionToArray, samePoint } from "../utils/geometry.js";

const COMPLETED_LEVELS_STORAGE_KEY = "the-linker-completed-levels";
const LAST_LEVEL_STORAGE_KEY = "the-linker-last-level-id";
const GAME_STORAGE_KEY_PREFIX = "the-linker-";

export const methods = {
    /**
     * 检测当前环境是否允许使用关卡编辑器。
     *
     * @returns {Promise<void>}
     */
    async detectLevelEditorAvailability() {
      this.canUseLevelEditor = import.meta.env.DEV;

      if (!this.canUseLevelEditor && this.activeView === "editor") {
        this.activeView = "challenge";
      }
    },

    /**
     * 从关卡目录刷新内存中的关卡列表。
     *
     * @returns {Promise<void>}
     */
    async loadLevels() {
      // Refresh the in-memory level list from the local levels/ directory.
      this.isLevelsLoading = true;
      try {
        const fileLevels = await loadLevelFiles();
        const merged = new Map();

        fileLevels.forEach((item) => {
          const hydrated = hydrateLevel(item, this.pointDefinitions);
          merged.set(hydrated.id, hydrated);
        });

        this.levels = [...merged.values()];
      } finally {
        this.isLevelsLoading = false;
      }
    },

    /**
     * 按列表索引加载当前关卡并重置路径状态。
     *
     * @param {number} index 关卡索引。
     * @returns {void}
     */
    loadLevel(index) {
      if (!Number.isInteger(index) || !this.levels[index]) return;
      this.currentLevelIndex = index;
      this.currentLevel = cloneLevel(hydrateLevel(this.levels[index], this.pointDefinitions));
      this.isLevelPickerOpen = false;
      this.isPersonalBest = false;
      this.saveLastLevelId(this.currentLevel.id);
      this.resetPaths();
    },

    /**
     * 获取上次打开的关卡索引，记录失效时回退到第一关。
     *
     * @returns {number} 初始关卡索引。
     */
    getInitialLevelIndex() {
      const lastLevelId = this.loadLastLevelId();
      const lastLevelIndex = this.levels.findIndex((level) => level.id === lastLevelId && this.isLevelCategoryVisible(level));
      if (lastLevelIndex >= 0) return lastLevelIndex;
      const firstVisibleIndex = this.levels.findIndex((level) => this.isLevelCategoryVisible(level));
      return firstVisibleIndex >= 0 ? firstVisibleIndex : 0;
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
      this.levelPickerScrollTop = event?.currentTarget?.scrollTop ?? 0;
    },

    /**
     * 解锁当前会话的开发者模式。
     *
     * @returns {void}
     */
    unlockDeveloperMode() {
      if (this.isDeveloperMode) {
        this.developerStatusText = "开发者模式已开启";
        return;
      }

      const password = window.prompt("请输入开发者密码");
      if (password === null) return;
      if (password !== appConfig.devPassword) {
        this.developerStatusText = "密码错误";
        return;
      }

      this.isDeveloperMode = true;
      this.developerStatusText = "开发者模式已开启";
    },

    /**
     * 判断关卡分类是否对当前用户可见。
     *
     * @param {object} level 关卡数据。
     * @returns {boolean} 是否可见。
     */
    isLevelCategoryVisible(level) {
      return this.getLevelCategory(level) === "official" || this.isDeveloperMode;
    },

    /**
     * 获取关卡分类。
     *
     * @param {object} level 关卡数据。
     * @returns {"official"|"tests"|"delete"} 关卡分类。
     */
    getLevelCategory(level) {
      return ["official", "tests", "delete"].includes(level?.sourceCategory) ? level.sourceCategory : "official";
    },

    /**
     * 获取关卡分类显示名。
     *
     * @param {string} category 关卡分类。
     * @returns {string} 显示名。
     */
    getLevelCategoryLabel(category) {
      const labels = {
        official: "正式版",
        tests: "开发者版",
        delete: "待删除版"
      };
      return labels[category] ?? labels.official;
    },

    /**
     * 按分类、难度和 id 排序关卡选择项。
     *
     * @param {{ level: object }} left 左侧关卡项。
     * @param {{ level: object }} right 右侧关卡项。
     * @returns {number} 排序结果。
     */
    compareLevelItems(left, right) {
      const categoryOrder = { official: 0, tests: 1, delete: 2 };
      const leftLevel = left?.level ?? {};
      const rightLevel = right?.level ?? {};
      return (categoryOrder[this.getLevelCategory(leftLevel)] ?? 9) - (categoryOrder[this.getLevelCategory(rightLevel)] ?? 9)
        || this.normalizeLevelDifficulty(leftLevel.difficulty) - this.normalizeLevelDifficulty(rightLevel.difficulty)
        || String(leftLevel.id ?? "").localeCompare(String(rightLevel.id ?? ""));
    },

    /**
     * 将测试关卡收录为正式版，或移入待删除版。
     *
     * @param {string} levelId 关卡 id。
     * @param {"include"|"reject"} action 处理动作。
     * @returns {Promise<void>}
     */
    async reviewTestLevel(levelId, action) {
      try {
        await reviewLevelRequest(levelId, action);
        await this.loadLevels();
        const movedIndex = this.levels.findIndex((level) => level.id === levelId);
        if (movedIndex >= 0) {
          this.loadLevel(movedIndex);
        }
        this.developerStatusText = action === "include" ? "已收录为正式版" : "已移入待删除版";
      } catch (error) {
        this.developerStatusText = error.message;
      }
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
    selectLevelFromPicker(index) {
      this.loadLevel(index);
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
          .filter((key) => key.startsWith(GAME_STORAGE_KEY_PREFIX))
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
     * 将毫秒数格式化为 mm:ss.cc。
     *
     * @param {number} milliseconds 毫秒数。
     * @returns {string} 计时文本。
     */
    formatElapsedTime(milliseconds) {
      const totalCentiseconds = Math.floor(Math.max(0, milliseconds) / 10);
      const minutes = String(Math.floor(totalCentiseconds / 6000)).padStart(2, "0");
      const seconds = String(Math.floor((totalCentiseconds % 6000) / 100)).padStart(2, "0");
      const centiseconds = String(totalCentiseconds % 100).padStart(2, "0");
      return `${minutes}:${seconds}:${centiseconds}`;
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
      const levelId = this.currentLevel.id;
      const previousRecord = this.completedLevels[levelId] ?? {};
      const elapsedMs = this.normalizeTimerElapsedMs(this.timerElapsedMs);
      const previousBestMs = Number(previousRecord.bestMs);
      const hasPreviousBest = Number.isFinite(previousBestMs);
      const isPersonalBest = !hasPreviousBest || elapsedMs < previousBestMs;
      this.isPersonalBest = isPersonalBest;
      this.completedLevels = {
        ...this.completedLevels,
        [levelId]: {
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
      const elapsedText = this.formatElapsedTime(this.timerElapsedMs);
      const completedCount = this.getCompletedLevelCount();
      const gameUrl = window.location.href;

      return [
        `游戏链接：${gameUrl}`,
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

      for (let offset = 1; offset <= this.levels.length; offset += 1) {
        const index = (this.currentLevelIndex + offset) % this.levels.length;
        if (!this.isLevelCompleted(this.levels[index].id)) return index;
      }

      return -1;
    },

    /**
     * 通关后跳到下一个未通关关卡；全部通关时显示提示。
     *
     * @returns {void}
     */
    goToNextUncompletedLevel() {
      const nextIndex = this.getNextUncompletedLevelIndex();
      if (nextIndex < 0) {
        this.nextLevelStatusText = "全部关卡已通关";
        return;
      }

      this.loadLevel(nextIndex);
    },

    /**
     * 复制当前地图样式 JSON 到剪贴板。
     *
     * @returns {Promise<void>}
     */
    async copyMapStyleJson() {
      await this.copyTextToClipboard(this.mapStyleJson);
    },

    /**
     * 复制文本到剪贴板，必要时使用旧版 execCommand 回退。
     *
     * @param {string} text 要复制的文本。
     * @returns {Promise<void>}
     */
    async copyTextToClipboard(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        const copied = document.execCommand("copy");
        if (!copied) throw new Error("Copy command failed");
      } finally {
        document.body.removeChild(textarea);
      }
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
      const nextDefinitions = this.pointPalettes[paletteId] ?? this.pointPalettes.default ?? this.pointPalettes[firstPaletteId] ?? {};
      this.pointDefinitions = nextDefinitions;
      this.levels = this.levels.map((level) => hydrateLevel(level, nextDefinitions));
      if (this.currentLevel) {
        this.currentLevel = cloneLevel(hydrateLevel(this.currentLevel, nextDefinitions));
      }
      this.writeLevelTemplate(false);
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
        console.warn(`Background image not found: ${images.join(", ")}. Put it under the background/ directory.`);
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
      if (!this.currentLevel) return;
      // Reset each pair to its first endpoint, matching the normal puzzle start state.
      const paths = {};
      this.currentLevel.pairs.forEach((pair) => {
        paths[pair.id] = [pair.points[0]];
      });
      this.paths = paths;
      this.activePair = null;
      this.isDrawing = false;
      this.pointerMoved = false;
      this.pointerPreview = null;
      this.resetGameTimer();
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
    },

    /**
     * 清空当前关卡的所有路径。
     *
     * @returns {void}
     */
    clearPaths() {
      if (!this.currentLevel) return;
      const paths = {};
      this.currentLevel.pairs.forEach((pair) => {
        paths[pair.id] = [];
      });
      this.paths = paths;
      this.activePair = null;
      this.isDrawing = false;
      this.pointerMoved = false;
      this.pointerPreview = null;
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.shareStatusText = "分享";
      this.nextLevelStatusText = "";
    },

    /**
     * 处理棋盘按下事件，确定是否开始绘制路径。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerDown(event) {
      if (!this.currentLevel) return;
      this.startGameTimer();
      const position = this.positionFromEvent(event);
      if (!position) return;

      if (event.detail > 1) {
        this.stopDrawing();
        return;
      }

      const startInfo = this.getPathStartInfo(position);
      if (!startInfo) {
        return;
      }

      this.startPath(startInfo.pairId, position, startInfo.mode);
      event.currentTarget.setPointerCapture(event.pointerId);
      this.pointerMoved = false;
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
      this.pointerPreview = this.pointerPositionFromEvent(event);

      const position = this.nearestPositionFromEvent(event);
      if (!position) return;
      this.pointerMoved = true;
      this.addStep(position);
    },

    /**
     * 处理棋盘抬起事件，结束当前绘制过程。
     *
     * @param {PointerEvent} event 指针事件。
     * @returns {void}
     */
    handleBoardPointerUp(event) {
      const pairToPause = this.activePair;
      const finalPosition = this.nearestPositionFromEvent(event);

      if (this.isDrawing && this.activePair && finalPosition) {
        this.addStep(finalPosition);
      }

      if (pairToPause) {
        this.pausePath(pairToPause, this.pointerMoved);
      }

      this.pointerMoved = false;
      this.pointerPreview = null;
      this.releasePointer(event);
    },

    /**
     * 处理棋盘双击事件，清空被双击端点所属路径。
     *
     * @param {MouseEvent} event 鼠标事件。
     * @returns {void}
     */
    handleBoardDoubleClick(event) {
      if (!this.currentLevel) return;
      const position = this.positionFromEvent(event);
      if (!position) return;

      const pairId = this.endpoints[keyOf(position.x, position.y)];
      if (!pairId) return;
      this.clearPairPath(pairId);
    },

    /**
     * 开始绘制指定点对路径。
     *
     * @param {string} pairId 点对 id。
     * @param {{ x: number, y: number }} position 起始位置。
     * @param {"endpoint"|"path-end"} [mode="endpoint"] 起点模式。
     * @returns {void}
     */
    startPath(pairId, position, mode = "endpoint") {
      this.activePair = pairId;
      this.isDrawing = true;
      this.pointerPreview = null;
      this.isWon = false;
      this.isPersonalBest = false;
      this.isVictoryDismissed = false;
      this.nextLevelStatusText = "";

      const currentPath = this.paths[pairId] ?? [];
      if (mode === "path-end") {
        this.paths[pairId] = this.orientPathForEnd(currentPath, position);
      } else {
        const pair = this.getPair(pairId);
        const endpointIndex = pair.points.findIndex(([x, y]) => x === position.x && y === position.y);
        if (endpointIndex === -1) return;

        if (currentPath.some(([x, y]) => x === position.x && y === position.y)) {
          this.paths[pairId] = this.trimPathForEndpointStart(currentPath, position);
        } else {
          this.paths[pairId] = [positionToArray(position)];
        }
      }
    },

    /**
     * 向当前路径追加一个节点，并校验碰撞、连通和终点规则。
     *
     * @param {{ x: number, y: number }} position 目标节点位置。
     * @returns {boolean} 是否成功追加或保持有效。
     */
    addStep(position) {
      // Commit one snapped grid point into the active path after validating collisions.
      const path = this.paths[this.activePair] ?? [];
      const last = path[path.length - 1];
      if (!last) {
        this.paths[this.activePair] = [positionToArray(position)];
        return true;
      }

      const next = positionToArray(position);
      if (samePoint(last, next)) return true;

      const previousIndex = path.findIndex((point) => samePoint(point, next));
      if (previousIndex >= 0) {
        if (previousIndex === path.length - 2) {
          this.paths[this.activePair] = path.slice(0, previousIndex + 1);
          return true;
        }

        return false;
      }

      if (this.hasPairReachedBothEndpoints(this.activePair, path)) {
        return false;
      }

      if (!isAdjacent(last, next, this.currentLevel.gridType)) {
        const routed = this.addStepsToward(next);
        if (routed) return true;
        return false;
      }

      if (!new Set(getAllGridEdges(this.currentLevel)).has(edgeKey(last, next))) {
        return false;
      }

      if (this.getEdgeOccupant(last, next)) {
        return false;
      }

      if (this.isLevelEdgeRemoved(edgeKey(last, next))) {
        return false;
      }

      const endpointOwner = this.endpoints[keyOf(next[0], next[1])];
      if (endpointOwner && endpointOwner !== this.activePair) {
        return false;
      }

      const nodeOccupant = this.getNodeOccupant(next);
      if (nodeOccupant && nodeOccupant !== this.activePair) {
        return false;
      }

      if (endpointOwner === this.activePair && this.isEndpointAlreadyLinked(this.activePair, next)) {
        return false;
      }

      const pair = this.getPair(this.activePair);
      const isOwnEndpoint = pair.points.some((point) => samePoint(point, next));
      const alreadyReachedEnd = path.some((point) => pair.points.some((endpoint) => samePoint(endpoint, point))) && path.length > 1;

      this.paths[this.activePair] = [...path, next];
      if (isOwnEndpoint && alreadyReachedEnd && !samePoint(path[0], next)) {
        this.evaluateBoard();
        this.isDrawing = false;
        this.activePair = null;
        return true;
      }

      this.evaluateBoard();
      return true;
    },

    /**
     * 沿水平或垂直方向向目标节点批量补步。
     *
     * @param {[number, number]} target 目标节点坐标。
     * @returns {boolean} 是否至少移动了一步。
     */
    addStepsToward(target) {
      const path = this.paths[this.activePair] ?? [];
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
        const updatedPath = this.paths[this.activePair] ?? [];
        current = updatedPath[updatedPath.length - 1];
        if (!this.activePair || !current) return moved;
      }

      return moved;
    },

    /**
     * 重新评估棋盘是否满足通关条件。
     *
     * @returns {void}
     */
    evaluateBoard() {
      // Win when every pair is connected and every traversable node is covered.
      if (!this.areAllPathsStructurallyValid()) {
        this.isWon = false;
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
        return;
      }

      const allConnected = this.currentLevel.pairs.every((pair) => this.isPairConnected(pair));
      const allFilled = this.isBoardFilled();
      const wasWon = this.isWon;
      this.isWon = allConnected && allFilled;
      if (!this.isWon) {
        this.isVictoryDismissed = false;
        this.shareStatusText = "分享";
        this.nextLevelStatusText = "";
      }
      if (this.isWon && !wasWon) {
        this.stopGameTimer();
        this.markCurrentLevelCompleted();
      }
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
     * @returns {{ x: number, y: number }|null} 最近节点；超出吸附半径时返回 null。
     */
    nearestPositionFromEvent(event) {
      const point = this.pointerPositionFromEvent(event);
      if (!point) return null;
      let nearest = null;
      let nearestDistance = Infinity;
      getGridNodes(this.currentLevel).forEach(([x, y]) => {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { x, y };
        }
      });
      if (!nearest || nearestDistance > this.mapStyle.snapPointRadius) return null;
      return nearest;
    },

    /**
     * 将屏幕指针坐标转换为逻辑网格坐标。
     *
     * @param {PointerEvent|MouseEvent} event 指针或鼠标事件。
     * @returns {{ x: number, y: number }|null} 逻辑坐标。
     */
    pointerPositionFromEvent(event) {
      const boardElement = event.currentTarget ?? this.$refs.boardRef;
      if (!boardElement) return null;
      const rect = boardElement.getBoundingClientRect();
      const bounds = getGridBounds(this.currentLevel);
      const renderX = bounds.minX + ((event.clientX - rect.left) / rect.width) * bounds.width;
      const renderY = bounds.minY + ((event.clientY - rect.top) / rect.height) * bounds.height;
      const [x, y] = fromRenderPoint([renderX, renderY], this.currentLevel.gridType);
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x, y };
    },

    /**
     * 判断某个节点是否可以作为路径起点。
     *
     * @param {{ x: number, y: number }} position 节点位置。
     * @returns {{ pairId: string, mode: string }|null} 起点信息。
     */
    getPathStartInfo(position) {
      const endpointPairId = this.endpoints[keyOf(position.x, position.y)];
      if (endpointPairId && this.canStartFromEndpoint(endpointPairId, position)) {
        return { pairId: endpointPairId, mode: "endpoint" };
      }

      for (const [pairId, path] of Object.entries(this.paths)) {
        if (path.length === 0 || this.hasPairReachedBothEndpoints(pairId, path)) continue;
        const last = path[path.length - 1];
        if (samePoint(last, positionToArray(position))) {
          return { pairId, mode: "path-end" };
        }
      }

      return null;
    },

    /**
     * 将路径调整为可从末端继续绘制的方向。
     *
     * @param {Array<[number, number]>} path 当前路径。
     * @param {{ x: number, y: number }} position 起始位置。
     * @returns {Array<[number, number]>} 调整后的路径。
     */
    orientPathForEnd(path, position) {
      const point = positionToArray(position);
      if (path.length === 0) return [point];
      if (samePoint(path[path.length - 1], point)) return path;
      return [point];
    },

    /**
     * 从端点重新开始绘制时裁剪已有路径。
     *
     * @param {Array<[number, number]>} path 当前路径。
     * @param {{ x: number, y: number }} position 端点位置。
     * @returns {Array<[number, number]>} 裁剪后的路径。
     */
    trimPathForEndpointStart(path, position) {
      const point = positionToArray(position);
      const index = path.findIndex((item) => samePoint(item, point));
      if (index <= 0) return [point];
      if (index === path.length - 1) return path;
      return path.slice(0, index + 1);
    },

    /**
     * 判断指定端点是否允许作为路径起点。
     *
     * @param {string} pairId 点对 id。
     * @param {{ x: number, y: number }} position 端点位置。
     * @returns {boolean} 是否可开始绘制。
     */
    canStartFromEndpoint(pairId, position) {
      const path = this.paths[pairId] ?? [];
      if (path.length === 0) return true;

      const point = positionToArray(position);
      if (!path.some((item) => samePoint(item, point))) return true;

      return samePoint(path[path.length - 1], point) && this.getPathDegree(path, point) <= 1;
    },

    /**
     * 清空指定点对路径。
     *
     * @param {string} pairId 点对 id。
     * @returns {void}
     */
    clearPairPath(pairId) {
      const path = this.paths[pairId] ?? [];
      if (path.length === 0) {
        return;
      }

      this.paths[pairId] = [];
      this.activePair = null;
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
      const path = this.paths[pairId] ?? [];
      this.isDrawing = false;
      this.activePair = null;

      if (this.hasPairReachedBothEndpoints(pairId, path)) {
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
      this.pointerMoved = false;
      this.pointerPreview = null;
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
      }, 10);
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
     * 获取当前关卡中的点对配置。
     *
     * @param {string} pairId 点对 id。
     * @returns {object|null} 点对配置。
     */
    getPair(pairId) {
      return this.currentLevel?.pairs.find((pair) => pair.id === pairId) ?? null;
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
      for (const [pairId, path] of Object.entries(this.paths)) {
        for (let index = 1; index < path.length; index += 1) {
          if (edgeKey(path[index - 1], path[index]) === edge) return pairId;
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
      for (const [pairId, path] of Object.entries(this.paths)) {
        if (path.some(([x, y]) => keyOf(x, y) === nodeKey)) return pairId;
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
      return new Set(this.currentLevel?.removedEdges ?? []).has(edge);
    },

    /**
     * 判断当前路径中的端点是否已经接入过线路。
     *
     * @param {string} pairId 点对 id。
     * @param {[number, number]} point 端点坐标。
     * @returns {boolean} 是否已连接。
     */
    isEndpointAlreadyLinked(pairId, point) {
      const path = this.paths[pairId] ?? [];
      return this.getPathDegree(path, point) > 0;
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
      const pair = this.getPair(pairId);
      return pair.points.every((endpoint) => path.some((point) => samePoint(point, endpoint)));
    },

    /**
     * 判断点对路径是否从一个端点连到另一个端点。
     *
     * @param {object} pair 点对配置。
     * @returns {boolean} 是否完成连接。
     */
    isPairConnected(pair) {
      const path = this.paths[pair.id] ?? [];
      if (path.length < 2) return false;
      const first = path[0];
      const last = path[path.length - 1];
      return (
        (samePoint(first, pair.points[0]) && samePoint(last, pair.points[1])) ||
        (samePoint(first, pair.points[1]) && samePoint(last, pair.points[0]))
      );
    },

    /**
     * 校验所有路径是否满足结构规则。
     *
     * @returns {boolean} 是否全部有效。
     */
    areAllPathsStructurallyValid() {
      return areAllPathsStructurallyValid(this.currentLevel, this.paths, this.endpoints);
    },

    /**
     * 校验所有节点是否只被一个点对占用。
     *
     * @returns {boolean} 是否无跨点对重叠。
     */
    areAllNodesExclusive() {
      return areAllNodesExclusive(this.paths);
    },

    /**
     * 校验单条路径的节点重复、相邻边和端点度数规则。
     *
     * @param {string} pairId 点对 id。
     * @param {Array<[number, number]>} path 路径坐标。
     * @returns {boolean} 路径结构是否有效。
     */
    isPathStructurallyValid(pairId, path) {
      return isPathStructurallyValid(this.currentLevel, pairId, path, this.endpoints);
    },

    /**
     * 判断棋盘是否填满所有可通行节点。
     *
     * @returns {boolean} 是否满足填充条件。
     */
    isBoardFilled() {
      return isLevelAnswerFilled(this.currentLevel, this.paths);
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
      return getFilledEdges(this.paths);
    },

    /**
     * 获取玩家当前已占用的全部节点。
     *
     * @returns {Set<string>} 已占用节点集合。
     */
    getFilledNodes() {
      return getFilledNodes(this.paths);
    },

    /**
     * 获取没有被完全移除的必需节点。
     *
     * @returns {string[]} 必需节点 key 列表。
     */
    getRequiredNodes() {
      return getRequiredNodes(this.currentLevel);
    },

    /**
     * 获取当前还可以继续延伸的路径末端。
     *
     * @returns {Set<string>} 末端节点 key 集合。
     */
    getExtendableEnds() {
      const ends = new Set();
      Object.entries(this.paths).forEach(([pairId, path]) => {
        if (path.length === 0 || this.hasPairReachedBothEndpoints(pairId, path)) return;
        const [x, y] = path[path.length - 1];
        ends.add(keyOf(x, y));
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
      const path = this.paths[this.activePair] ?? [];
      const last = path[path.length - 1];
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
      const path = this.paths[this.activePair] ?? [];
      const start = path[0];
      if (!pair || !start) return "";

      const target = pair.points.find((point) => !samePoint(point, start));
      return target ? keyOf(target[0], target[1]) : "";
    },

};
