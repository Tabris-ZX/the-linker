<template>
  <section v-if="app.isLevelPickerOpen" class="level-picker-panel app-card" aria-label="关卡选择">
    <div class="level-picker-header">
      <strong>关卡选择</strong>
      <span class="level-directory-status">{{ app.levelDirectoryStatusText }}</span>
      <button type="button" class="close-button" aria-label="关闭关卡选择" @click="app.closeLevelPicker">
        关闭
      </button>
    </div>
    <div class="level-picker-filters">
      <label>
        版本
        <select v-model="app.levelCategoryFilter">
          <option value="all">全部 {{ app.levelCategoryCounts.total }}</option>
          <option value="stable">正式版 {{ app.levelCategoryCounts.stable }}</option>
          <option value="alpha">测试版 {{ app.levelCategoryCounts.alpha }}</option>
          <option value="removed">待删版 {{ app.levelCategoryCounts.removed }}</option>
        </select>
      </label>
      <label>
        难度
        <select v-model="app.levelDifficultyFilter">
          <option value="all">全部</option>
          <option v-for="difficulty in app.levelDifficulties" :key="difficulty" :value="String(difficulty)">
            {{ difficulty }}
          </option>
        </select>
      </label>
      <label>
        状态
        <select v-model="app.levelCompletionFilter">
          <option value="all">全部</option>
          <option value="new">未完成</option>
          <option value="done">已完成</option>
        </select>
      </label>
    </div>
    <div ref="levelGroupList" class="level-group-list" @scroll="app.handleLevelPickerScroll">
      <section v-for="group in app.groupedFilteredLevels" :key="group.difficulty" class="level-group">
        <h2>{{ group.difficulty }}</h2>
        <div class="level-card-grid">
          <article
            v-for="item in group.levels"
            :key="app.getLevelCacheKey(item.level)"
            class="level-card"
            :class="{ 'is-active': item.index === app.currentLevelIndex, 'is-completed': app.isLevelCompleted(app.getLevelCacheKey(item.level)) }"
          >
            <button type="button" class="level-card-main" @click="app.selectLevelFromPicker(item.index)">
              <strong>{{ item.level.name || item.level.id }}</strong>
              <span>{{ item.level.id }}</span>
              <small>{{ app.getLevelBestTimeText(app.getLevelCacheKey(item.level)) }}</small>
            </button>
            <div v-if="app.isDeveloperMode && app.getLevelCategory(item.level) === 'alpha'" class="level-review-actions">
              <button type="button" @click="app.reviewTestLevel(item.level, 'include')">收录</button>
              <button type="button" @click="app.reviewTestLevel(item.level, 'reject')">不收录</button>
            </div>
          </article>
        </div>
      </section>
    </div>
    <p v-if="app.developerStatusText" class="level-picker-status">{{ app.developerStatusText }}</p>
  </section>
</template>

<script>
export default {
  name: "LevelPickerPanel",
  inject: ["app"],
  watch: {
    "app.isLevelPickerOpen"(isOpen) {
      if (!isOpen) return;
      this.$nextTick(this.restoreLevelPickerScroll);
    },
    "app.levelCategoryFilter"() {
      if (!this.app.isLevelPickerOpen) return;
      this.$nextTick(this.restoreLevelPickerScroll);
    },
    "app.levelDifficultyFilter"() {
      if (!this.app.isLevelPickerOpen) return;
      this.$nextTick(this.restoreLevelPickerScroll);
    },
    "app.levelCompletionFilter"() {
      if (!this.app.isLevelPickerOpen) return;
      this.$nextTick(this.restoreLevelPickerScroll);
    }
  },
  mounted() {
    if (this.app.isLevelPickerOpen) {
      this.$nextTick(this.restoreLevelPickerScroll);
    }
  },
  methods: {
    restoreLevelPickerScroll() {
      const list = this.$refs.levelGroupList;
      if (!list) return;
      list.scrollTop = this.app.levelPickerScrollTop;
    }
  }
};
</script>
