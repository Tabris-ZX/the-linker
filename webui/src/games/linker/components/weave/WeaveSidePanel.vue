<template>
  <aside class="weave-side-panel" aria-label="数寻工具">
    <fieldset class="weave-panel-section">
      <div class="weave-console-title">
        <small>数寻</small>
        <strong>色点状态</strong>
      </div>
    </fieldset>

    <fieldset class="weave-panel-section">
      <legend>标记</legend>
      <div class="weave-tool-row" aria-label="选择隐藏端点编号">
        <div
          v-for="pair in app.weavePrimaryPairOptions"
          :key="pair.id"
          class="weave-pair-option"
        >
          <button
            type="button"
            class="weave-pair-chip"
            :class="{ 'is-active': app.weaveActivePairId === pair.id }"
            :style="{ '--pair-color': pair.color }"
            @click="app.selectWeavePair(pair.id)"
          >
            {{ pair.label }}
          </button>
          <small class="weave-pair-distance" :class="`is-${pair.distanceStatus}`">
            {{ pair.distance === null ? "--" : pair.distance }}
          </small>
        </div>
      </div>
      <div class="weave-tool-row weave-tool-row-meta" aria-label="辅助标记">
        <button
          v-for="pair in app.weaveMetaPairOptions"
          :key="pair.id"
          type="button"
          class="weave-pair-chip"
          :class="{
            'is-active': app.weaveActivePairId === pair.id,
            'is-unknown': pair.isUnknown,
            'is-excluded': pair.isExcluded
          }"
          :style="{ '--pair-color': pair.color }"
          @click="app.selectWeavePair(pair.id)"
        >
          {{ pair.label }}
        </button>
      </div>
      <div class="weave-clear-row" aria-label="清除辅助标记">
        <button type="button" @click="app.clearWeaveUnknownMarks">清除 ?</button>
        <button type="button" @click="app.clearWeaveExcludedMarks">清除 x</button>
      </div>
    </fieldset>

    <fieldset class="weave-panel-section">
      <legend>提交</legend>
      <div class="weave-submit-row">
        <button type="button" :disabled="app.isWeaveAnswerLoading" @click="app.submitWeaveEndpoints">
          {{ app.isWeaveAnswerLoading ? "检查中" : "提交" }}
        </button>
      </div>
      <div class="weave-console-stats" aria-label="数寻得分">
        <span>罚时</span>
        <strong>{{ app.weavePenaltyText }}</strong>
      </div>
    </fieldset>

    <fieldset class="weave-panel-section weave-feedback-section">
      <legend>反馈</legend>
      <div v-if="app.weaveEndpointFeedback.length" class="weave-feedback" aria-live="polite">
        <p
          v-for="item in app.weaveEndpointFeedback"
          :key="`${item.pairId}-${item.correctPairId}`"
          :class="{ 'is-correct': item.isCorrect, 'is-wrong': !item.isCorrect }"
        >
          {{ item.pairId }} · {{ item.isCorrect ? "正确" : "错误" }}
        </p>
      </div>
      <p v-else class="weave-status-text">提交后显示每个编号的结果。</p>
    </fieldset>
  </aside>
</template>

<script>
export default {
  name: "WeaveSidePanel",
  inject: ["app"]
};
</script>
