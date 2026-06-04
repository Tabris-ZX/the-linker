<template>
  <AppNav
    v-model:active-view="activeView"
    :view-tabs="visibleViewTabs"
    :timer-text="timerText"
    :current-level-label="currentLevelLabel"
    :can-reset-level="Boolean(currentLevel) && !isLevelsLoading"
    :favicon-url="faviconUrl"
    @toggle-level-picker="toggleLevelPicker"
    @reset-paths="resetPaths"
    @toggle-personalization="togglePersonalization"
  />

  <main class="app-shell">
    <PersonalizationView v-if="isPersonalizationOpen" />
    <ChallengeView />
    <CreatorView />
  </main>
</template>

<script>
import appOptions from "./app/options.js";
import "../config/styles/base.css";
import "../config/styles/challenge.css";
import "../config/styles/creator.css";
import "../config/styles/mobile.css";

export default appOptions;
</script>
