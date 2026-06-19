<template>
  <header class="app-topbar" :class="[`is-${activeView}`, `layout-${navLayout}`]">
    <div class="topbar-left">
      <a class="brand" href="#" aria-label="The Linker home">
        <img class="brand-icon" :src="faviconUrl" alt="">
        <span>The Linker</span>
      </a>
      <nav class="view-tabs" aria-label="页面导航">
        <button
          v-for="tab in viewTabs"
          :key="tab.id"
          class="view-tab"
          :class="{ 'is-active': activeView === tab.id }"
          type="button"
          :aria-selected="String(activeView === tab.id)"
          @click="$emit('update:activeView', tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>
      <button class="developer-button" :class="{ 'is-unlocked': isDeveloperMode }" type="button" @click="$emit('unlockDeveloperMode')">
        SU
      </button>
    </div>

    <div class="topbar-center">
      <div class="play-toolbar" :class="{ 'is-hidden': activeView !== 'play' && activeView !== 'weave-total' }" aria-label="关卡工具栏">
        <div class="game-timer" aria-label="计时">
          {{ timerText }}
        </div>
        <div class="play-actions">
          <button class="level-picker-button" type="button" @click="$emit('toggleLevelPicker')">
            关卡选择
          </button>
          <div class="current-level-label" aria-label="当前关卡">
            {{ currentLevelLabel }}
          </div>
          <button type="button" :disabled="!canResetLevel" @click="$emit('resetPaths')">重置</button>
        </div>
      </div>
    </div>

    <div class="topbar-right">
      <div v-if="isDeveloperMode" class="online-count" aria-label="当前在线人数">
        {{ onlineCountText }}
      </div>
      <a class="github-link" href="https://github.com/Tabris-ZX/the-linker" target="_blank" rel="noreferrer" aria-label="GitHub 项目主页">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.86 8.35 6.84 9.71.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.1-1.5-1.1-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.05 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.04A9.3 9.3 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.04 2.74-1.04.55 1.4.2 2.44.1 2.7.64.71 1.03 1.62 1.03 2.74 0 3.92-2.34 4.78-4.57 5.04.36.32.68.94.68 1.9v2.78c0 .27.18.59.69.49A10.17 10.17 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z"></path>
        </svg>
        
      </a>
      <button class="rule-button" type="button" @click="$emit('toggleRulePanel')">
        玩法
      </button>
      <button class="personalize-button" type="button" @click="$emit('togglePersonalization')">
        设置
      </button>
    </div>
  </header>
</template>

<script>
export default {
  name: "AppNav",
  props: {
    activeView: {
      type: String,
      required: true
    },
    viewTabs: {
      type: Array,
      required: true
    },
    timerText: {
      type: String,
      required: true
    },
    currentLevelLabel: {
      type: String,
      required: true
    },
    canResetLevel: {
      type: Boolean,
      default: true
    },
    isDeveloperMode: {
      type: Boolean,
      default: false
    },
    onlineCountText: {
      type: String,
      default: "在线 --"
    },
    faviconUrl: {
      type: String,
      required: true
    },
    navLayout: {
      type: String,
      default: "top"
    }
  },
  emits: ["update:activeView", "toggleLevelPicker", "resetPaths", "unlockDeveloperMode", "toggleRulePanel", "togglePersonalization"]
};
</script>
