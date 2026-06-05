<template>
  <AppNav
    v-model:active-view="activeView"
    :view-tabs="visibleViewTabs"
    :timer-text="timerText"
    :current-level-label="currentLevelLabel"
    :can-reset-level="Boolean(currentLevel) && !isLevelsLoading"
    :is-developer-mode="isDeveloperMode"
    :favicon-url="faviconUrl"
    @toggle-level-picker="toggleLevelPicker"
    @reset-paths="resetPaths"
    @unlock-developer-mode="unlockDeveloperMode"
    @toggle-rule-panel="toggleRulePanel"
    @toggle-personalization="togglePersonalization"
  />

  <main class="app-shell">
    <RuleView v-if="isRulePanelOpen" />
    <PersonalizationView v-if="isPersonalizationOpen" />
    <ChallengeView />
    <EditorView />
  </main>
</template>

<script>
import appOptions from "./app/options.js";
import "../config/styles/base.css";
import "../config/styles/challenge.css";
import "../config/styles/editor.css";
import "../config/styles/mobile.css";

export default appOptions;
</script>
