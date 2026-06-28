<template>
  <div class="collection-shell">
    <header class="collection-nav">
      <button class="brand-button" type="button" @click="goHome">
        <span class="brand-mark" aria-hidden="true">
          <img src="/icon.webp?v=20260623" alt="">
        </span>
        <span>THER</span>
      </button>

      <nav aria-label="主导航">
        <button type="button" :class="{ 'is-active': activeView === 'home' }" @click="goHome">首页</button>
        <button type="button" :class="{ 'is-active': activeView === 'game' }" @click="goPlayPage">游玩</button>
        <button
          type="button"
          :class="{ 'is-active': isEditorActive }"
          :disabled="!isGlobalDeveloperMode"
          :aria-disabled="!isGlobalDeveloperMode"
          :title="editorButtonTitle"
          @click="openEditorLibrary"
        >
          编辑器
        </button>
      </nav>

      <div class="collection-nav-actions">
        <div v-if="showGameStatus" class="collection-status-strip collection-level-actions" aria-label="当前关卡状态">
          <span class="toolbar-clock">{{ currentGameStatus.timerText }}</span>
          <button type="button" :disabled="activeView === 'editor-game'" @click="toggleCurrentLevels">关卡</button>
          <strong class="toolbar-level-title">{{ currentGameStatus.levelLabel }}</strong>
          <button type="button" :disabled="!currentGameStatus.canReset" @click="resetCurrentGame">重置</button>
        </div>
        <div class="collection-global-actions" aria-label="全局操作">
          <button type="button" class="developer-toggle-button" @click="unlockDeveloperMode">{{ developerLabel }}</button>
          <a
            class="github-link"
            href="https://github.com/Tabris-ZX/the-linker"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 项目"
            title="GitHub"
          >
            <svg class="github-mark" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.68 0 8.22c0 3.63 2.29 6.71 5.47 7.8.4.08.55-.18.55-.4 0-.2-.01-.85-.01-1.55-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.15-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.42 7.42 0 0 1 8 4.01c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.75.54 1.52 0 1.1-.01 1.98-.01 2.25 0 .22.15.48.55.4A8.13 8.13 0 0 0 16 8.22C16 3.68 12.42 0 8 0Z"
              />
            </svg>
          </a>
          <button type="button" @click="toggleGlobalRulePanel">玩法</button>
          <button type="button" @click="toggleGlobalSettings">设置</button>
        </div>
      </div>
    </header>

    <GlobalRulePanel
      v-if="isGlobalRuleOpen"
      :title="globalRuleTitle"
      :lines="globalRuleLines"
      @close="isGlobalRuleOpen = false"
    />
    <GlobalSettingsPanel
      v-if="isGlobalSettingsOpen"
      :map-style="globalMapStyle"
      :settings="globalSettings"
      :theme-options="themeOptions"
      :palette-options="paletteOptions"
      @close="isGlobalSettingsOpen = false"
      @update-map-style="updateGlobalMapStyle"
      @update-setting="updateGlobalSetting"
      @reset-settings="resetGlobalMapStyle"
    />
    <div v-if="developerDialogOpen" class="app-dialog-backdrop">
      <section class="victory-mark app-dialog" role="dialog" aria-modal="true" aria-label="开发者模式">
        <div class="victory-main">
          <div class="victory-copy">
            <span>开发者模式</span>
            <strong>请输入开发者 token</strong>
          </div>
        </div>
        <form class="app-dialog-form" @submit.prevent="submitGlobalDeveloperToken">
          <input v-model.trim="developerTokenInput" type="password" autocomplete="off" placeholder="开发者 token">
          <div class="victory-actions">
            <button type="submit" class="victory-share-button">确认</button>
            <button type="button" class="close-button" @click="developerDialogOpen = false">关闭</button>
          </div>
        </form>
        <p v-if="developerStatus" class="victory-status">{{ developerStatus }}</p>
      </section>
    </div>
    <div v-if="developerLogoutDialogOpen" class="app-dialog-backdrop">
      <section class="victory-mark app-dialog" role="dialog" aria-modal="true" aria-label="退出开发者模式">
        <div class="victory-main">
          <div class="victory-copy">
            <span>开发者模式</span>
            <strong>确认退出开发者模式？</strong>
          </div>
        </div>
        <div class="victory-actions">
          <button type="button" class="victory-share-button" @click="confirmDeveloperLogout">退出</button>
          <button type="button" class="close-button" @click="developerLogoutDialogOpen = false">取消</button>
        </div>
      </section>
    </div>

    <main class="collection-main" :class="{ 'is-playing': activeView === 'game' || activeView === 'editor-game' }">
      <HomeView
        v-if="activeView === 'home'"
        @select-game="openGame"
      />
      <section v-else-if="activeView === 'editor-home'" class="home-view editor-home-view" aria-labelledby="editor-home-title">
        <div class="home-wrap">
          <div class="home-heading">
            <span>THER编辑器</span>
            <h1 id="editor-home-title">选择编辑器</h1>
            <p>三款游戏都提供独立关卡编辑器，并使用各自独立的数据接口。</p>
          </div>

          <div class="home-game-grid" aria-label="编辑器列表">
            <button
              v-for="game in editorCatalog"
              :key="game.id"
              type="button"
              class="home-game-card"
              :title="`进入${game.title}编辑器`"
              @click="selectEditorGame(game.id)"
            >
              <span class="home-game-mark" aria-hidden="true">{{ game.mark }}</span>
              <span class="home-game-copy">
                <small>可编辑</small>
                <strong>{{ game.title }}</strong>
                <span>{{ game.description }}</span>
              </span>
            </button>
          </div>
        </div>
      </section>
      <section v-else class="game-host" :aria-label="activeGameTitle">
        <component
          :is="activeGameComponent"
          v-if="activeGameComponent"
          ref="activeGameRef"
          :key="`${activeView}-${activeGame}`"
          v-bind="activeGameProps"
          @back-home="handleLocalBack"
          @developer-unlocked="handleGameDeveloperUnlocked"
          @status-change="handleGameStatusChange"
        />
      </section>
    </main>
  </div>
</template>

<script>
import BridgerGame from "./games/bridger/BridgerGame.vue";
import FinderGame from "./games/finder/FinderGame.vue";
import LinkerGame from "./games/linker/LinkerGame.vue";
import { setDeveloperToken, verifyDeveloperToken } from "./shared/api.js";
import { applyBackgroundImage, chooseRandomBackgroundImage } from "./shared/background.js";
import { appConfig, defaultPointPaletteId, pointPalettes, themes } from "./shared/config.js";
import GlobalRulePanel from "./shared/shell/GlobalRulePanel.vue";
import GlobalSettingsPanel from "./shared/shell/GlobalSettingsPanel.vue";
import HomeView from "./shared/shell/HomeView.vue";
import { gameCatalog } from "./shared/shell/gameCatalog.js";

const GLOBAL_DEVELOPER_TOKEN_STORAGE_KEY = "ther-puzzles-global-developer-token";
const GLOBAL_PERSONALIZATION_STORAGE_KEY = "ther-puzzles-personalization";
const GAME_ROUTE_ALIASES = {
  linker: "linker",
  finder: "finder",
  bridger: "bridger"
};
const PLAY_ROUTE_BY_GAME = {
  linker: "/play/linker",
  finder: "/play/finder",
  bridger: "/play/bridger"
};
const GAME_COMPONENTS = {
  linker: "LinkerGame",
  finder: "FinderGame",
  bridger: "BridgerGame"
};

import "./shared/styles/base.css";
import "./shared/styles/mobile-base.css";
import "./shared/shell/home.css";
import "./games/linker/styles/styles.css";
import "./games/linker/styles/mobile.css";
import "./games/finder/styles/styles.css";
import "./games/finder/styles/mobile.css";
import "./games/bridger/styles/styles.css";

export default {
  name: "App",
  components: {
    BridgerGame,
    FinderGame,
    GlobalRulePanel,
    GlobalSettingsPanel,
    HomeView,
    LinkerGame
  },
  data() {
    return {
      activeView: "home",
      activeGame: "",
      currentGameStatus: {
        title: "",
        timerText: "00:00",
        levelLabel: "未选择关卡",
        canReset: false,
        canSelectLevel: false,
        isEditor: false
      },
      isGlobalRuleOpen: false,
      isGlobalSettingsOpen: false,
      globalMapStyle: { ...appConfig.mapStyle },
      globalSettings: {
        theme: appConfig.theme.default,
        palette: pointPalettes[appConfig.colors.palette] ? appConfig.colors.palette : defaultPointPaletteId,
        assistMode: false,
        linkedBlink: false
      },
      developerDialogOpen: false,
      developerLogoutDialogOpen: false,
      developerTokenInput: "",
      developerToken: "",
      developerStatus: "",
      isApplyingRoute: false
    };
  },
  computed: {
    activeGameTitle() {
      return gameCatalog.find((game) => game.id === this.activeGame)?.title ?? "游戏";
    },
    editorCatalog() {
      return gameCatalog;
    },
    developerLabel() {
      const game = this.getActiveGame();
      if (game?.isDeveloperMode && game?.onlineCountText) return game.onlineCountText;
      return this.isGlobalDeveloperMode ? "已解锁" : "开发者";
    },
    activeGameComponent() {
      return GAME_COMPONENTS[this.activeGame] ?? null;
    },
    activeGameProps() {
      return {
        initialMode: this.activeGame,
        startInEditor: this.activeView === "editor-game",
        sharedMapStyle: this.globalMapStyle,
        sharedSettings: this.globalSettings,
        developerToken: this.developerToken,
        isGlobalDeveloperMode: this.isGlobalDeveloperMode,
        isDeveloperMode: this.isGlobalDeveloperMode
      };
    },
    isGlobalDeveloperMode() {
      return Boolean(this.developerToken);
    },
    isEditorActive() {
      return this.activeView === "editor-home" || this.activeView === "editor-game";
    },
    editorButtonTitle() {
      if (!this.isGlobalDeveloperMode) return "需要先解锁开发者模式";
      return "打开编辑器";
    },
    showGameStatus() {
      return this.activeView === "game" || this.activeView === "editor-game";
    },
    themeOptions() {
      return Object.values(themes);
    },
    paletteOptions() {
      return Object.keys(pointPalettes).map((id) => ({ id, label: id }));
    },
    globalRuleTitle() {
      return this.activeGameTitle;
    },
    globalRuleLines() {
      if (this.activeGame === "bridger") {
        return [
          "连接同一行或同一列的岛屿，桥不能跨过其它岛屿。",
          "两座岛之间最多可以有两座桥，桥不能交叉。",
          "每个岛上的数字表示它需要连接的桥数。",
          "所有岛屿数字满足，并且全部连通时通关。"
        ];
      }
      return ["选择同色数字并连接路径，铺满所有可通行节点即可通关。"];
    }
  },
  mounted() {
    this.loadGlobalSettings();
    this.restoreDeveloperMode();
    this.applyConfiguredBackground();
    this.applyGlobalMapStyle();
    this.applyGlobalTheme(this.globalSettings.theme);
    this.applyRouteFromLocation({ replace: true });
    window.addEventListener("popstate", this.handlePopState);
  },
  beforeUnmount() {
    window.removeEventListener("popstate", this.handlePopState);
  },
  methods: {
    goHome() {
      this.navigateToRoute("/home");
      this.activeView = "home";
    },
    goPlayPage() {
      if (!this.activeGame) {
        this.openGame("linker");
        return;
      }
      this.navigateToRoute(this.getPlayRoute(this.activeGame));
      this.activeView = "game";
      this.$nextTick(() => {
        this.getActiveGame()?.openPlay?.();
        this.syncSharedSettings();
      });
    },
    openGame(gameId) {
      this.activeGame = gameId;
      this.activeView = "game";
      this.resetCurrentGameStatus();
      this.navigateToRoute(this.getPlayRoute(gameId));
      this.$nextTick(() => this.syncSharedSettings());
    },
    handleLocalBack() {
      if (this.activeView === "editor-game") {
        this.openEditorLibrary();
        return;
      }
      this.goHome();
    },
    getActiveGame() {
      return this.$refs.activeGameRef ?? null;
    },
    toggleGlobalRulePanel() {
      this.isGlobalRuleOpen = !this.isGlobalRuleOpen;
      if (this.isGlobalRuleOpen) this.isGlobalSettingsOpen = false;
    },
    toggleGlobalSettings() {
      this.isGlobalSettingsOpen = !this.isGlobalSettingsOpen;
      if (this.isGlobalSettingsOpen) this.isGlobalRuleOpen = false;
    },
    unlockDeveloperMode() {
      if (this.isGlobalDeveloperMode) {
        this.developerLogoutDialogOpen = true;
        this.developerDialogOpen = false;
        return;
      }
      this.developerDialogOpen = true;
      this.developerStatus = "";
      this.developerTokenInput = "";
      this.isGlobalRuleOpen = false;
      this.isGlobalSettingsOpen = false;
    },
    async submitGlobalDeveloperToken() {
      if (!this.developerTokenInput) {
        this.developerStatus = "请输入 token";
        return;
      }
      try {
        await verifyDeveloperToken(this.developerTokenInput);
        this.developerToken = this.developerTokenInput;
        this.persistDeveloperToken(this.developerToken);
        setDeveloperToken(this.developerToken);
        this.developerDialogOpen = false;
        this.developerStatus = "";
      } catch (error) {
        this.developerStatus = error.message || "开发者 token 无效";
      }
    },
    handleGameDeveloperUnlocked(token) {
      if (!token) return;
      this.developerToken = token;
      this.persistDeveloperToken(token);
      setDeveloperToken(token);
    },
    openEditorLibrary() {
      if (!this.isGlobalDeveloperMode) return;
      this.activeView = "editor-home";
      this.resetCurrentGameStatus();
      this.navigateToRoute("/editor");
    },
    selectEditorGame(gameId) {
      if (!this.isGlobalDeveloperMode || !GAME_ROUTE_ALIASES[gameId]) return;
      this.activeGame = gameId;
      this.activeView = "editor-game";
      this.resetCurrentGameStatus();
      this.navigateToRoute(`/editor/${gameId}`);
      this.$nextTick(() => {
        this.getActiveGame()?.openEditor?.();
        this.syncSharedSettings();
      });
    },
    toggleCurrentLevels() {
      if (this.activeView === "editor-game") return;
      const game = this.getActiveGame();
      game?.toggleLevelPicker?.();
      game?.toggleLevelPanel?.();
    },
    resetCurrentGame() {
      const game = this.getActiveGame();
      game?.resetPaths?.();
      game?.resetLevel?.();
    },
    handleGameStatusChange(status) {
      this.currentGameStatus = {
        ...this.currentGameStatus,
        ...status
      };
    },
    resetCurrentGameStatus() {
      this.currentGameStatus = {
        title: "",
        timerText: "00:00",
        levelLabel: "未选择关卡",
        canReset: false,
        canSelectLevel: false,
        isEditor: false
      };
    },
    confirmDeveloperLogout() {
      this.developerLogoutDialogOpen = false;
      this.developerToken = "";
      this.developerTokenInput = "";
      this.developerStatus = "";
      setDeveloperToken("");
      try {
        window.localStorage.removeItem(GLOBAL_DEVELOPER_TOKEN_STORAGE_KEY);
      } catch {
        // Ignore unavailable storage.
      }
      this.getActiveGame()?.applyDeveloperLogout?.();
      if (this.activeView === "editor-home") this.goHome();
      if (this.activeView === "editor-game") this.goPlayPage();
    },
    persistDeveloperToken(token) {
      try {
        window.localStorage.setItem(GLOBAL_DEVELOPER_TOKEN_STORAGE_KEY, token);
      } catch {
        // Ignore unavailable storage.
      }
    },
    restoreDeveloperMode() {
      try {
        const token = window.localStorage.getItem(GLOBAL_DEVELOPER_TOKEN_STORAGE_KEY) || "";
        if (!token) return;
        this.developerToken = token;
        setDeveloperToken(token);
      } catch {
        // Ignore unavailable storage.
      }
    },
    handlePopState() {
      this.applyRouteFromLocation({ replace: false });
    },
    applyRouteFromLocation({ replace = false } = {}) {
      const route = this.parseCurrentRoute();
      this.isApplyingRoute = true;
      if (route.view === "home") {
        this.activeView = "home";
        this.resetCurrentGameStatus();
      } else if (route.view === "editor-home") {
        this.activeView = this.isGlobalDeveloperMode ? "editor-home" : "home";
        this.resetCurrentGameStatus();
      } else if (route.view === "editor-game") {
        if (this.isGlobalDeveloperMode && route.game) {
          this.activeGame = route.game;
          this.activeView = "editor-game";
          this.resetCurrentGameStatus();
          this.$nextTick(() => this.syncSharedSettings());
        } else {
          this.activeView = this.isGlobalDeveloperMode ? "editor-home" : "home";
          this.resetCurrentGameStatus();
        }
      } else {
        this.activeGame = route.game;
        this.activeView = "game";
        this.resetCurrentGameStatus();
        this.$nextTick(() => this.syncSharedSettings());
      }
      this.isApplyingRoute = false;
      if (replace && this.isGlobalDeveloperMode) this.replaceCurrentRoute();
    },
    parseCurrentRoute() {
      const segments = window.location.pathname.split("/").filter(Boolean);
      if (!segments.length || (segments.length === 1 && segments[0] === "home")) return { view: "home", game: "" };
      if (segments.length === 1 && segments[0] === "editor") return { view: "editor-home", game: "" };
      if (segments[0] === "editor") {
        const game = GAME_ROUTE_ALIASES[segments[1]];
        if (game) return { view: "editor-game", game };
        return { view: "editor-home", game: "" };
      }
      if (segments[0] === "play") {
        const game = GAME_ROUTE_ALIASES[segments[1]];
        if (game) return { view: "game", game };
      }
      return { view: "home", game: "" };
    },
    replaceCurrentRoute() {
      const targetPath = this.getCurrentRoutePath();
      if (window.location.pathname === targetPath) return;
      window.history.replaceState({}, "", targetPath);
    },
    navigateToRoute(path) {
      if (this.isApplyingRoute || window.location.pathname === path) return;
      window.history.pushState({}, "", path);
    },
    getCurrentRoutePath() {
      if (this.activeView === "home") return "/home";
      if (this.activeView === "editor-home") return "/editor";
      if (this.activeView === "editor-game") return `/editor/${this.activeGame}`;
      return this.getPlayRoute(this.activeGame);
    },
    getPlayRoute(gameId) {
      return PLAY_ROUTE_BY_GAME[gameId] ?? "/play/linker";
    },
    syncSharedSettings() {
      const game = this.getActiveGame();
      if (!game) return;
      if (game.themes?.[this.globalSettings.theme]) game.selectedTheme = this.globalSettings.theme;
      if (game.pointPalettes?.[this.globalSettings.palette]) game.selectedPalette = this.globalSettings.palette;
      if ("mapStyle" in game) game.mapStyle = { ...this.globalMapStyle };
      if (typeof game.setAssistMode === "function") game.setAssistMode(this.globalSettings.assistMode);
      if (typeof game.setLinkedBlinkMode === "function") game.setLinkedBlinkMode(this.globalSettings.linkedBlink);
    },
    loadGlobalSettings() {
      try {
        const stored = JSON.parse(window.localStorage.getItem(GLOBAL_PERSONALIZATION_STORAGE_KEY) || "null");
        if (!stored || typeof stored !== "object") return;
        if (themes[stored.theme]) this.globalSettings.theme = stored.theme;
        if (pointPalettes[stored.palette]) this.globalSettings.palette = stored.palette;
        this.globalSettings.assistMode = Boolean(stored.assistMode);
        this.globalSettings.linkedBlink = Boolean(stored.linkedBlink);
        if (stored.mapStyle && typeof stored.mapStyle === "object") {
          this.globalMapStyle = this.normalizeMapStyle(stored.mapStyle);
        }
      } catch {
        // Ignore unavailable or invalid storage.
      }
    },
    saveGlobalSettings() {
      try {
        window.localStorage.setItem(GLOBAL_PERSONALIZATION_STORAGE_KEY, JSON.stringify({
          theme: this.globalSettings.theme,
          palette: this.globalSettings.palette,
          navLayout: "top",
          assistMode: this.globalSettings.assistMode,
          linkedBlink: this.globalSettings.linkedBlink,
          mapStyle: { ...this.globalMapStyle }
        }));
      } catch {
        // Ignore unavailable storage.
      }
    },
    updateGlobalSetting(field, value) {
      if (!Object.prototype.hasOwnProperty.call(this.globalSettings, field)) return;
      this.globalSettings = { ...this.globalSettings, [field]: value };
      if (field === "theme") this.applyGlobalTheme(value);
      this.saveGlobalSettings();
      this.$nextTick(() => this.syncSharedSettings());
    },
    updateGlobalMapStyle(field, value) {
      this.globalMapStyle = this.normalizeMapStyle({ ...this.globalMapStyle, [field]: value });
      this.applyGlobalMapStyle();
      this.saveGlobalSettings();
      this.$nextTick(() => this.syncSharedSettings());
    },
    normalizeMapStyle(style) {
      const limits = {
        boardScale: [0.6, 1.4],
        dotScale: [0.3, 0.8],
        nodeScale: [0.04, 0.5],
        lineScale: [0.1, 0.8],
        gridLineScale: [0.02, 0.2],
        snapPointTolerance: [0.1, 0.5]
      };
      return Object.keys(limits).reduce((normalized, key) => {
        const [min, max] = limits[key];
        const numeric = Number(style?.[key]);
        normalized[key] = Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : appConfig.mapStyle[key];
        return normalized;
      }, {});
    },
    resetGlobalMapStyle() {
      this.globalMapStyle = { ...appConfig.mapStyle };
      this.globalSettings = {
        theme: appConfig.theme.default,
        palette: pointPalettes[appConfig.colors.palette] ? appConfig.colors.palette : defaultPointPaletteId,
        assistMode: false,
        linkedBlink: false
      };
      this.applyGlobalTheme(this.globalSettings.theme);
      this.applyGlobalMapStyle();
      this.saveGlobalSettings();
      this.$nextTick(() => this.syncSharedSettings());
    },
    applyGlobalMapStyle() {
      document.documentElement.style.setProperty("--map-board-scale", this.globalMapStyle.boardScale);
      document.documentElement.style.setProperty("--map-dot-scale", this.globalMapStyle.dotScale);
      document.documentElement.style.setProperty("--map-node-scale", this.globalMapStyle.nodeScale);
      document.documentElement.style.setProperty("--map-line-scale", this.globalMapStyle.lineScale);
      document.documentElement.style.setProperty("--map-grid-line-scale", this.globalMapStyle.gridLineScale);
    },
    applyGlobalTheme(themeId) {
      const theme = themes[themeId] ?? themes[appConfig.theme.default] ?? Object.values(themes)[0];
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
      if (!theme) return;
      document.documentElement.dataset.theme = theme.id;
      Object.entries(theme.tokens ?? {}).forEach(([tokenName, tokenValue]) => {
        const cssVariable = tokenMap[tokenName];
        if (cssVariable) document.documentElement.style.setProperty(cssVariable, tokenValue);
      });
    },
    applyConfiguredBackground() {
      const background = appConfig.background;
      document.documentElement.style.setProperty("--background-opacity", String(background.opacity));
      document.documentElement.style.setProperty("--background-blur", background.blur);

      const images = background.images?.length ? background.images : [background.image].filter(Boolean);
      applyBackgroundImage(chooseRandomBackgroundImage(images));
    }
  }
};
</script>
