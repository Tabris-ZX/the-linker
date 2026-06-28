<template>
  <aside class="finder-side-panel" aria-label="数寻工具">
    <fieldset class="finder-panel-section">
      <div class="finder-console-title">
        <small>数寻</small>
        <strong>色点状态</strong>
      </div>
    </fieldset>

    <fieldset class="finder-panel-section">
      <legend>标记</legend>
      <div class="finder-tool-row" aria-label="选择隐藏端点编号">
        <div
          v-for="pair in app.finderPrimaryPairOptions"
          :key="pair.id"
          class="finder-pair-option"
        >
          <button
            type="button"
            class="finder-pair-chip"
            :class="{ 'is-active': app.finderActivePairId === pair.id }"
            :style="{ '--pair-color': pair.color }"
            @click="app.selectFinderPair(pair.id)"
          >
            {{ pair.label }}
          </button>
          <small class="finder-pair-distance" :class="`is-${pair.distanceStatus}`">
            {{ pair.distance === null ? "--" : pair.distance }}
          </small>
        </div>
      </div>
      <div class="finder-tool-row finder-tool-row-meta" aria-label="辅助标记">
        <button
          v-for="pair in app.finderMetaPairOptions"
          :key="pair.id"
          type="button"
          class="finder-pair-chip"
          :class="{
            'is-active': app.finderActivePairId === pair.id,
            'is-unknown': pair.isUnknown,
            'is-excluded': pair.isExcluded
          }"
          :style="{ '--pair-color': pair.color }"
          @click="app.selectFinderPair(pair.id)"
        >
          {{ pair.label }}
        </button>
      </div>
      <div class="finder-clear-row" aria-label="清除辅助标记">
        <button type="button" @click="app.clearFinderUnknownMarks">清除 ?</button>
        <button type="button" @click="app.clearFinderExcludedMarks">清除 x</button>
      </div>
    </fieldset>

    <fieldset class="finder-panel-section">
      <legend>提交</legend>
      <div class="finder-submit-row">
        <button type="button" :disabled="app.isFinderAnswerLoading" @click="app.submitFinderEndpoints">
          {{ app.isFinderAnswerLoading ? "检查中" : "提交" }}
        </button>
      </div>
      <div class="finder-console-stats" aria-label="数寻得分">
        <span>罚时</span>
        <strong>{{ app.finderPenaltyText }}</strong>
      </div>
    </fieldset>

    <fieldset class="finder-panel-section finder-feedback-section">
      <legend>反馈</legend>
      <div v-if="app.finderEndpointFeedback.length" class="finder-feedback" aria-live="polite">
        <p
          v-for="item in app.finderEndpointFeedback"
          :key="`${item.pairId}-${item.correctPairId}`"
          :class="{ 'is-correct': item.isCorrect, 'is-wrong': !item.isCorrect }"
        >
          {{ item.pairId }} · {{ item.isCorrect ? "正确" : "错误" }}
        </p>
      </div>
      <p v-else class="finder-status-text">提交后显示每个编号的结果。</p>
    </fieldset>
  </aside>
</template>

<script>
export default {
  name: "FinderSidePanel",
  inject: ["app"]
};
</script>
