<template>
  <LevelGridPicker
    :is-open="app.isLevelPickerOpen"
    title="关卡选择"
    :status-text="app.levelDirectoryStatusText"
    :footer-text="app.developerStatusText"
    :levels="pickerLevels"
    :active-level-id="activeLevelId"
    :show-filters="false"
    @close="app.closeLevelPicker"
    @select-level="selectLevel"
    @scroll="app.handleLevelPickerScroll"
  >
    <template #filters>
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
    </template>
    <template #actions="{ level }">
      <div v-if="app.isDeveloperMode && level.sourceCategory === 'alpha'" class="level-review-actions">
        <button type="button" @click="app.reviewTestLevel(level.raw, 'include')">收录</button>
        <button type="button" @click="app.reviewTestLevel(level.raw, 'reject')">不收录</button>
      </div>
    </template>
  </LevelGridPicker>
</template>

<script>
import LevelGridPicker from "../../../shared/components/LevelGridPicker.vue";

export default {
  name: "LevelPickerPanel",
  components: {
    LevelGridPicker
  },
  inject: ["app"],
  computed: {
    activeLevelId() {
      return this.app.getLevelCacheKey(this.app.currentLevel ?? {});
    },
    pickerLevels() {
      return this.app.groupedFilteredLevels.flatMap((group) => group.levels.map((item) => {
        const id = this.app.getLevelCacheKey(item.level);
        return {
          ...item.level,
          raw: item.level,
          id,
          difficulty: item.level.difficulty,
          sourceCategory: this.app.getLevelCategory(item.level),
          isCompleted: this.app.isLevelCompleted(id),
          metaText: this.app.getLevelBestTimeText(id),
          pickerIndex: item.index
        };
      }));
    }
  },
  methods: {
    selectLevel(levelId) {
      const item = this.pickerLevels.find((level) => level.id === levelId);
      if (!item) return;
      this.app.selectLevelFromPicker(item.pickerIndex);
    }
  }
};
</script>
