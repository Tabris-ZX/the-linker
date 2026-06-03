<template>
  <header class="app-topbar" :class="`is-${activeView}`">
    <div class="topbar-left">
      <a class="brand" href="#" aria-label="the linker home">
        <img class="brand-icon" :src="faviconUrl" alt="">
        <span>the linker</span>
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
    </div>

    <div class="topbar-center">
      <div v-if="activeView === 'challenge'" class="challenge-toolbar" aria-label="关卡工具栏">
        <div class="game-timer" aria-label="计时">
          {{ timerText }}
        </div>
        <div class="challenge-actions">
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
      <label class="theme-switcher">
        主题
        <select :value="selectedTheme" aria-label="主题切换" @change="handleThemeChange">
          <option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
        </select>
      </label>
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
    themeOptions: {
      type: Array,
      required: true
    },
    selectedTheme: {
      type: String,
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
    faviconUrl: {
      type: String,
      required: true
    }
  },
  emits: ["update:activeView", "update:selectedTheme", "toggleLevelPicker", "resetPaths"],
  methods: {
    handleThemeChange(event) {
      this.$emit("update:selectedTheme", event.target.value);
    }
  }
};
</script>
