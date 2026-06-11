<template>
  <AppNav
    v-model:active-view="activeView"
    :view-tabs="visibleViewTabs"
    :timer-text="timerText"
    :current-level-label="currentLevelLabel"
    :can-reset-level="Boolean(currentLevel) && !isLevelsLoading"
    :is-developer-mode="isDeveloperMode"
    :online-count-text="onlineCountText"
    :favicon-url="faviconUrl"
    :nav-layout="navLayout"
    @toggle-level-picker="toggleLevelPicker"
    @reset-paths="resetPaths"
    @unlock-developer-mode="unlockDeveloperMode"
    @toggle-rule-panel="toggleRulePanel"
    @toggle-personalization="togglePersonalization"
  />

  <main class="app-shell" :class="{ 'has-sidebar-nav': navLayout === 'sidebar' }">
    <RuleView v-if="isRulePanelOpen" />
    <PersonalizationView v-if="isPersonalizationOpen" />
    <PlayView />
    <EditorView />
  </main>

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

      <form v-if="appDialog.type === 'developer-token'" class="app-dialog-form" @submit.prevent="submitDeveloperToken">
        <input v-model.trim="appDialog.inputValue" type="password" autocomplete="off" placeholder="开发者 token" :disabled="Boolean(developerTokenCooldownText)">
        <div class="victory-actions">
          <button type="submit" class="victory-share-button" :disabled="Boolean(developerTokenCooldownText)">确认</button>
          <button type="button" class="close-button" @click="closeAppDialog">关闭</button>
        </div>
      </form>

      <div v-else class="victory-actions">
        <button type="button" class="close-button" @click="closeAppDialog">关闭</button>
      </div>

      <p v-if="appDialog.status" class="victory-status">{{ appDialog.status }}</p>
    </section>
  </div>
</template>

<script>
import appOptions from "./app/options.js";
import "./asserts/styles/base.css";
import "./asserts/styles/play.css";
import "./asserts/styles/editor.css";
import "./asserts/styles/mobile.css";

export default appOptions;
</script>
