<template>
  <section class="view view-play" :class="{ 'is-active': app.activeView === 'play' }" :hidden="app.activeView !== 'play'" aria-labelledby="game-title">
    <section class="game-panel">
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
                  <button type="button" @click="app.reviewTestLevel(item.level.id, 'include')">收录</button>
                  <button type="button" @click="app.reviewTestLevel(item.level.id, 'reject')">不收录</button>
                </div>
              </article>
            </div>
          </section>
        </div>
        <p v-if="app.developerStatusText" class="level-picker-status">{{ app.developerStatusText }}</p>
      </section>
      <div v-if="!app.isInitialLevelLoading && !app.isLevelsLoading && !app.isLevelDetailLoading && !app.currentLevel" class="play-status" role="status" aria-live="polite">
        {{ app.developerStatusText || "暂无关卡" }}
      </div>
      <div
        v-else
        class="board-wrap"
        :class="{ 'is-loading': app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || !app.currentLevel }"
        :aria-busy="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading ? 'true' : 'false'"
      >
        <div
          ref="boardRef"
          class="board"
          aria-label="the linker board"
          :style="app.boardStyle"
          @pointerdown="app.handleBoardPointerDown"
          @pointermove="app.handleBoardPointerMove"
          @pointerup="app.handleBoardPointerUp"
          @click.prevent
          @dblclick.prevent="app.handleBoardDoubleClick"
        >
          <div v-if="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading" class="board-loading" role="status" aria-live="polite">加载中...</div>
          <svg v-if="app.currentLevel" class="edge-grid" :viewBox="app.boardViewBox" preserveAspectRatio="none">
            <path v-if="app.gridPathD" :d="app.gridPathD"></path>
          </svg>
          <svg v-if="app.currentLevel" class="edge-lines" :viewBox="app.boardViewBox" preserveAspectRatio="none">
            <path
              v-for="group in app.renderedPathGroups"
              :key="group.key"
              :d="group.d"
              :stroke="group.color"
              :class="group.className"
            ></path>
          </svg>
          <template v-if="app.currentLevel">
            <button
              v-for="node in app.boardNodes"
              :key="node.key"
              type="button"
              class="node"
              :class="node.classes"
              :style="node.style"
              :aria-label="`交点 ${node.x + 1}, ${node.y + 1}`"
            >
              <span
                v-if="node.endpoint"
                class="dot"
                :style="{ '--dot-color': node.endpoint.color }"
              >
                {{ node.endpoint.label }}
              </span>
            </button>
          </template>
        </div>
      </div>

      <div v-if="app.isWon && !app.isVictoryDismissed" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功!</span>
            <strong>用时 {{ app.victoryTimeText }}</strong>
          </div>
          <strong v-if="app.isPersonalBest" class="victory-pb">PB</strong>
        </div>
        <div class="victory-actions">
          <button type="button" class="victory-share-button" @click="app.goToNextUncompletedLevel">
            下一关
          </button>
          <button type="button" class="victory-share-button" @click="app.shareVictory">
            {{ app.shareStatusText }}
          </button>
          <button type="button" class="close-button" aria-label="关闭通关提示" @click="app.closeVictoryMark">
            关闭
          </button>
        </div>
        <p v-if="app.nextLevelStatusText" class="victory-status">{{ app.nextLevelStatusText }}</p>
      </div>
    </section>
  </section>
</template>

<script>
export default {
  name: "PlayView",
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
