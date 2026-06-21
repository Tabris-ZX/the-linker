<template>
  <div class="collection-shell">
    <header class="collection-nav">
      <button class="brand-button" type="button" @click="goHome">
        <span class="brand-mark" aria-hidden="true">TL</span>
        <span>THER</span>
      </button>

      <nav aria-label="主导航">
        <button type="button" :class="{ 'is-active': activeView === 'home' }" @click="goHome">首页</button>
        <button type="button" :class="{ 'is-active': activeView === 'game' }" @click="goPlayPage">游玩页</button>
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
          <button type="button" @click="toggleGlobalRulePanel">玩法</button>
          <button type="button" @click="toggleGlobalSettings">设置</button>
          <button type="button" @click="unlockDeveloperMode">{{ developerLabel }}</button>
          <a href="https://github.com/Tabris-ZX/the-linker" target="_blank" rel="noreferrer" aria-label="GitHub 项目">GH</a>
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
            <p>数链和数桥提供关卡编辑器。数寻继续复用数链地图，不单独提供编辑器。</p>
          </div>

          <div class="home-game-grid" aria-label="编辑器列表">
            <button
              v-for="game in editorCatalog"
              :key="game.id"
              type="button"
              class="home-game-card"
              :disabled="!game.canEdit"
              :aria-disabled="!game.canEdit"
              :title="game.canEdit ? `进入${game.title}编辑器` : '数寻复用数链地图，不提供独立编辑器'"
              @click="selectEditorGame(game.id)"
            >
              <span class="home-game-mark" aria-hidden="true">{{ game.mark }}</span>
              <span class="home-game-copy">
                <small>{{ game.canEdit ? '可编辑' : '复用数链' }}</small>
                <strong>{{ game.title }}</strong>
                <span>{{ game.canEdit ? game.description : '当前没有独立编辑器。' }}</span>
              </span>
            </button>
          </div>
        </div>
      </section>
      <section v-else class="game-host" :aria-label="activeGameTitle">
        <LinkerGame
          v-if="activeGame === 'play' || activeGame === 'weave-total'"
          ref="linkerGame"
          :key="`${activeView}-${activeGame}`"
          :initial-mode="activeGame"
          :start-in-editor="activeView === 'editor-game'"
          :shared-map-style="globalMapStyle"
          :shared-settings="globalSettings"
          :developer-token="developerToken"
          :is-global-developer-mode="isGlobalDeveloperMode"
          @back-home="handleLocalBack"
          @developer-unlocked="handleGameDeveloperUnlocked"
          @status-change="handleGameStatusChange"
        />
        <BridgeView
          ref="bridgeGame"
          v-else-if="activeGame === 'bridge'"
          :key="`${activeView}-${activeGame}`"
          :start-in-editor="activeView === 'editor-game'"
          :developer-token="developerToken"
          :is-developer-mode="isGlobalDeveloperMode"
          @back-home="handleLocalBack"
          @status-change="handleGameStatusChange"
        />
      </section>
    </main>
  </div>
</template>

<script>
import BridgeView from "./games/bridger/views/BridgeView.vue";
import LinkerGame from "./games/linker/LinkerGame.vue";
import { appConfig, defaultPointPaletteId, pointPalettes, themes } from "./games/linker/config/index.js";
import { setDeveloperToken, verifyDeveloperToken } from "./games/linker/router/levels.js";
import GlobalRulePanel from "./shell/GlobalRulePanel.vue";
import GlobalSettingsPanel from "./shell/GlobalSettingsPanel.vue";
import HomeView from "./shell/HomeView.vue";
import { gameCatalog } from "./shell/gameCatalog.js";

const GLOBAL_DEVELOPER_TOKEN_STORAGE_KEY = "the-linker-global-developer-token";

import "./shared/styles/base.css";
import "./shared/styles/mobile-base.css";
import "./shell/home.css";
import "./games/linker/styles/play.css";
import "./games/linker/styles/editor.css";
import "./games/linker/styles/mobile-play.css";
import "./games/linker/styles/mobile-weave.css";
import "./games/bridger/styles/bridge.css";

export default {
  name: "App",
  components: {
    BridgeView,
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
      developerStatus: ""
    };
  },
  computed: {
    activeGameTitle() {
      return gameCatalog.find((game) => game.id === this.activeGame)?.title ?? "游戏";
    },
    editorCatalog() {
      return gameCatalog.map((game) => ({
        ...game,
        canEdit: game.id === "play" || game.id === "bridge"
      }));
    },
    developerLabel() {
      const linker = this.$refs.linkerGame;
      if (linker?.isDeveloperMode) return linker.onlineCountText;
      return this.isGlobalDeveloperMode ? "已解锁" : "开发者";
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
      if (this.activeGame === "bridge") {
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
  },
  methods: {
    goHome() {
      this.activeView = "home";
    },
    goPlayPage() {
      if (!this.activeGame) {
        this.openGame("play");
        return;
      }
      this.activeView = "game";
      this.$nextTick(() => {
        this.getLinkerGame()?.openPlay?.();
        this.getBridgeGame()?.openPlay?.();
        this.syncLinkerSettings();
      });
    },
    openGame(gameId) {
      this.activeGame = gameId;
      this.activeView = "game";
      this.resetCurrentGameStatus();
      this.$nextTick(() => this.syncLinkerSettings());
    },
    handleLocalBack() {
      if (this.activeView === "editor-game") {
        this.openEditorLibrary();
        return;
      }
      this.goHome();
    },
    getLinkerGame() {
      return this.$refs.linkerGame ?? null;
    },
    getBridgeGame() {
      return this.$refs.bridgeGame ?? null;
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
      if (this.getLinkerGame()?.unlockDeveloperMode) {
        this.getLinkerGame().unlockDeveloperMode();
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
    },
    selectEditorGame(gameId) {
      if (!this.isGlobalDeveloperMode || (gameId !== "play" && gameId !== "bridge")) return;
      this.activeGame = gameId;
      this.activeView = "editor-game";
      this.resetCurrentGameStatus();
      this.$nextTick(() => this.syncLinkerSettings());
    },
    toggleCurrentLevels() {
      if (this.activeView === "editor-game") return;
      this.getLinkerGame()?.toggleLevelPicker?.();
      this.getBridgeGame()?.toggleLevelPanel?.();
    },
    resetCurrentGame() {
      this.getLinkerGame()?.resetPaths?.();
      this.getBridgeGame()?.resetLevel?.();
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
      this.getLinkerGame()?.applyDeveloperLogout?.();
      this.getBridgeGame()?.applyDeveloperLogout?.();
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
    syncLinkerSettings() {
      const linker = this.getLinkerGame();
      if (!linker) return;
      if (linker.themes?.[this.globalSettings.theme]) linker.selectedTheme = this.globalSettings.theme;
      if (linker.pointPalettes?.[this.globalSettings.palette]) linker.selectedPalette = this.globalSettings.palette;
      linker.mapStyle = { ...this.globalMapStyle };
      if (typeof linker.setAssistMode === "function") linker.setAssistMode(this.globalSettings.assistMode);
      if (typeof linker.setLinkedBlinkMode === "function") linker.setLinkedBlinkMode(this.globalSettings.linkedBlink);
    },
    loadGlobalSettings() {
      try {
        const stored = JSON.parse(window.localStorage.getItem("the-linker-personalization") || "null");
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
        window.localStorage.setItem("the-linker-personalization", JSON.stringify({
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
      this.$nextTick(() => this.syncLinkerSettings());
    },
    updateGlobalMapStyle(field, value) {
      this.globalMapStyle = this.normalizeMapStyle({ ...this.globalMapStyle, [field]: value });
      this.applyGlobalMapStyle();
      this.saveGlobalSettings();
      this.$nextTick(() => this.syncLinkerSettings());
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
      this.$nextTick(() => this.syncLinkerSettings());
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
      if (!images.length) {
        document.documentElement.style.setProperty("--background-image", "none");
        return;
      }

      const imagePaths = images.map((image) => new URL(image, window.location.href).href);
      document.documentElement.style.setProperty("--background-image", `url("${imagePaths[0]}")`);

      window.requestIdleCallback?.(() => this.verifyBackgroundImages(imagePaths))
        ?? window.setTimeout(() => this.verifyBackgroundImages(imagePaths), 0);
    },
    async verifyBackgroundImages(imagePaths) {
      for (const imagePath of imagePaths) {
        const isAvailable = await new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = imagePath;
        });
        if (isAvailable) {
          document.documentElement.style.setProperty("--background-image", `url("${imagePath}")`);
          return;
        }
      }
      document.documentElement.style.setProperty("--background-image", "none");
    }
  }
};
</script>
