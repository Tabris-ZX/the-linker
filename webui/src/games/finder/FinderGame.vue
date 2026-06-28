<template>
  <div class="finder-game is-finder-active">
    <GameToolbar
      title="数寻"
      @back="$emit('back-home')"
    />

    <PlayView />
    <EditorView />

    <div v-if="appDialog.type" class="app-dialog-backdrop">
      <section class="victory-mark app-dialog" role="dialog" aria-modal="true" :aria-label="appDialog.title">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>{{ appDialog.title }}</span>
            <strong>{{ appDialog.message }}</strong>
          </div>
        </div>

        <div class="victory-actions">
          <button type="button" class="close-button" @click="closeAppDialog">关闭</button>
        </div>

        <p v-if="appDialog.status" class="victory-status">{{ appDialog.status }}</p>
      </section>
    </div>
  </div>
</template>

<script>
import finderOptions from "./app.js";
import PlayView from "./views/PlayView.vue";
import EditorView from "./views/EditorView.vue";
import GameToolbar from "../../shared/components/GameToolbar.vue";
import { setDeveloperToken } from "../../shared/api.js";

export default {
  name: "FinderGame",
  ...finderOptions,
  props: {
    sharedMapStyle: {
      type: Object,
      required: true
    },
    sharedSettings: {
      type: Object,
      required: true
    },
    developerToken: {
      type: String,
      default: ""
    },
    isGlobalDeveloperMode: {
      type: Boolean,
      default: false
    },
    startInEditor: {
      type: Boolean,
      default: false
    }
  },
  emits: ["back-home", "status-change"],
  components: {
    ...finderOptions.components,
    PlayView,
    EditorView,
    GameToolbar
  },
  data() {
    return {
      ...finderOptions.data(),
      activeView: "finder",
      viewTabs: []
    };
  },
  async mounted() {
    await finderOptions.mounted.call(this);
    this.applySharedSettings();
    this.applyGlobalDeveloperMode();
    await this.toggleFinderMode(true);
    this.activeView = this.startInEditor ? "editor" : "finder";
    this.emitStatusChange();
  },
  computed: {
    ...finderOptions.computed,
    gameLabel() {
      return "数寻";
    }
  },
  watch: {
    ...finderOptions.watch,
    sharedMapStyle: {
      deep: true,
      handler() {
        this.applySharedSettings();
      }
    },
    sharedSettings: {
      deep: true,
      handler() {
        this.applySharedSettings();
      }
    },
    developerToken() {
      this.applyGlobalDeveloperMode();
    },
    isGlobalDeveloperMode() {
      this.applyGlobalDeveloperMode();
    },
    startInEditor(enabled) {
      if (enabled) this.openEditor();
    },
    async activeView(view) {
      if (view !== "finder" && view !== "editor") {
        this.activeView = "finder";
        return;
      }
      await finderOptions.watch.activeView.call(this, view);
      this.emitStatusChange();
    },
    timerText() {
      this.emitStatusChange();
    },
    currentLevelLabel() {
      this.emitStatusChange();
    }
  },
  methods: {
    ...finderOptions.methods,
    async applyGlobalDeveloperMode() {
      if (!this.isGlobalDeveloperMode || !this.developerToken || this.isDeveloperMode) return;
      this.isDeveloperMode = true;
      this.canUseLevelEditor = true;
      setDeveloperToken(this.developerToken);
    },
    openEditor() {
      if (!this.isGlobalDeveloperMode) return;
      this.canUseLevelEditor = true;
      this.activeView = "editor";
      this.emitStatusChange();
    },
    openPlay() {
      this.activeView = "finder";
      this.emitStatusChange();
    },
    applyDeveloperLogout() {
      this.isDeveloperMode = false;
      this.canUseLevelEditor = false;
      setDeveloperToken("");
      this.activeView = "finder";
      this.emitStatusChange();
    },
    emitStatusChange() {
      this.$emit("status-change", {
        title: "数寻",
        timerText: this.timerText,
        levelLabel: this.currentLevelLabel,
        canReset: Boolean(this.currentLevel) && !this.isLevelsLoading,
        canSelectLevel: true,
        isEditor: this.activeView === "editor"
      });
    },
    applySharedSettings() {
      this.mapStyle = { ...this.sharedMapStyle };
      if (this.themes?.[this.sharedSettings.theme]) this.selectedTheme = this.sharedSettings.theme;
      if (this.pointPalettes?.[this.sharedSettings.palette]) this.selectedPalette = this.sharedSettings.palette;
      const nextAssistMode = Boolean(this.sharedSettings.assistMode);
      const nextLinkedBlinkMode = Boolean(this.sharedSettings.linkedBlink);
      if (this.isHintModeEnabled !== nextAssistMode) this.setAssistMode(nextAssistMode);
      if (this.isLinkedBlinkEnabled !== nextLinkedBlinkMode) this.setLinkedBlinkMode(nextLinkedBlinkMode);
    }
  }
};
</script>
