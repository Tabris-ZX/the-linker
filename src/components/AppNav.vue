<template>
  <header class="app-topbar">
    <div class="topbar-left">
      <a class="brand" href="#" aria-label="the linker home">
        <img class="brand-icon" src="/favicon.ico" alt="">
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
      <div v-if="activeView === 'challenge'" class="challenge-actions" aria-label="关卡工具栏">
        <div class="game-timer" aria-label="计时">
          {{ timerText }}
        </div>
        <label class="level-switcher">
          关卡
          <select :value="currentLevelIndex" aria-label="选择关卡" @change="handleLevelChange">
            <option v-for="(item, index) in levels" :key="item.id" :value="index">
              {{ item.id }}
            </option>
          </select>
        </label>
        <button type="button" @click="$emit('resetPaths')">重置</button>
        <button type="button" @click="$emit('clearPaths')">清空</button>
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
    levels: {
      type: Array,
      required: true
    },
    currentLevelIndex: {
      type: Number,
      required: true
    }
  },
  emits: ["update:activeView", "update:selectedTheme", "selectLevel", "resetPaths", "clearPaths"],
  methods: {
    handleThemeChange(event) {
      this.$emit("update:selectedTheme", event.target.value);
    },
    handleLevelChange(event) {
      this.$emit("selectLevel", Number(event.target.value));
    }
  }
};
</script>
