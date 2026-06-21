<template>
  <section v-if="isOpen" class="level-picker-panel app-card" aria-label="关卡选择">
    <div class="level-picker-header">
      <strong>{{ title }}</strong>
      <span class="level-directory-status">{{ statusText }}</span>
      <button type="button" class="close-button" aria-label="关闭关卡选择" @click="$emit('close')">
        关闭
      </button>
    </div>
    <slot name="filters">
      <div v-if="showFilters" class="level-picker-filters">
        <label>
          难度
          <select :value="difficultyFilter" @change="$emit('update:difficultyFilter', $event.target.value)">
            <option value="all">全部</option>
            <option v-for="difficulty in difficulties" :key="difficulty" :value="String(difficulty)">
              {{ difficulty }}
            </option>
          </select>
        </label>
        <label v-if="completionOptions.length">
          状态
          <select :value="completionFilter" @change="$emit('update:completionFilter', $event.target.value)">
            <option v-for="option in completionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </slot>
    <div class="level-group-list" @scroll="$emit('scroll', $event)">
      <section v-for="group in groupedLevels" :key="group.difficulty" class="level-group">
        <h2>{{ group.difficulty }}</h2>
        <div class="level-card-grid">
          <article
            v-for="item in group.levels"
            :key="item.id"
            class="level-card"
            :class="{ 'is-active': item.id === activeLevelId, 'is-completed': item.isCompleted }"
          >
            <button type="button" class="level-card-main" @click="$emit('select-level', item.id)">
              <strong>{{ item.name || item.id }}</strong>
              <span>{{ item.id }}</span>
              <small>{{ item.metaText || `难度 ${item.difficulty}` }}</small>
            </button>
            <slot name="actions" :level="item"></slot>
          </article>
        </div>
      </section>
    </div>
    <p v-if="footerText" class="level-picker-status">{{ footerText }}</p>
  </section>
</template>

<script>
export default {
  name: "LevelGridPicker",
  props: {
    isOpen: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: "关卡选择"
    },
    statusText: {
      type: String,
      default: ""
    },
    footerText: {
      type: String,
      default: ""
    },
    levels: {
      type: Array,
      default: () => []
    },
    activeLevelId: {
      type: String,
      default: ""
    },
    difficultyFilter: {
      type: String,
      default: "all"
    },
    completionFilter: {
      type: String,
      default: "all"
    },
    completionOptions: {
      type: Array,
      default: () => []
    },
    showFilters: {
      type: Boolean,
      default: true
    }
  },
  emits: ["close", "select-level", "update:difficultyFilter", "update:completionFilter", "scroll"],
  computed: {
    difficulties() {
      return [...new Set(this.levels.map((level) => Number(level.difficulty) || 1))].sort((a, b) => a - b);
    },
    filteredLevels() {
      return this.levels.filter((level) => {
        if (this.difficultyFilter !== "all" && String(level.difficulty) !== this.difficultyFilter) return false;
        if (this.completionFilter === "done" && !level.isCompleted) return false;
        if (this.completionFilter === "new" && level.isCompleted) return false;
        return true;
      });
    },
    groupedLevels() {
      const groups = new Map();
      this.filteredLevels.forEach((level) => {
        const difficulty = Number(level.difficulty) || 1;
        if (!groups.has(difficulty)) groups.set(difficulty, []);
        groups.get(difficulty).push(level);
      });
      return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([difficulty, levels]) => ({
          difficulty,
          levels: levels.slice().sort((left, right) => String(left.id).localeCompare(String(right.id)))
        }));
    }
  }
};
</script>
