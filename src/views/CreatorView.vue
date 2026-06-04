<template>
  <section class="view view-creator" :class="{ 'is-active': app.activeView === 'creator' }" :hidden="app.activeView !== 'creator'" aria-labelledby="editor-title">
    <section class="editor-panel app-card">
      <h2 id="editor-title">关卡编辑器</h2>
      <form class="creator-form" @submit.prevent="app.writeLevelTemplate()">
        <label>
          修改关卡
          <select :value="app.creatorEditingLevelId" @change="app.handleCreatorLevelSelection($event.target.value)">
            <option value="">新建关卡</option>
            <option v-for="level in app.levels" :key="level.id" :value="level.id">
              {{ level.id }} · {{ level.name || level.id }}
            </option>
          </select>
        </label>
        <label class="creator-name-field">
          名称
          <input v-model.trim="app.creatorState.name" type="text" placeholder="默认名字" :disabled="Boolean(app.creatorEditingLevelId)" @input="app.syncCreatorName">
        </label>
        <label>
          格子类型
          <select v-model="app.creatorState.gridType" @change="app.syncCreatorBounds">
            <option value="square">方形</option>
            <option value="right-triangle">直角三角形</option>
            <option value="equilateral-triangle">正三角形</option>
          </select>
        </label>
        <label v-if="app.creatorState.gridType !== 'equilateral-triangle'">
          宽度
          <input v-model.number="app.creatorState.width" type="number" min="2" max="12" @input="app.syncCreatorBounds">
        </label>
        <label v-if="app.creatorState.gridType !== 'equilateral-triangle'">
          高度
          <input v-model.number="app.creatorState.height" type="number" min="2" max="12" @input="app.syncCreatorBounds">
        </label>
        <label v-if="app.creatorState.gridType === 'equilateral-triangle'">
          半径
          <input v-model.number="app.creatorState.radius" type="number" min="1" max="8" @input="app.syncCreatorBounds">
        </label>
        <label>
          点对数量
          <input v-model.number="app.creatorPairCount" type="number" min="1" max="12" :disabled="Boolean(app.creatorEditingLevelId)" @input="app.syncCreatorPairCount">
        </label>
        <label>
          难度
          <input v-model.number="app.creatorState.difficulty" type="number" min="1" max="5" @input="app.syncCreatorDifficulty">
        </label>
        <label>
          编辑模式
          <select v-model="app.creatorState.mode" @change="app.setCreatorModeHint">
            <option value="mark">标记模式</option>
            <option value="edge">移除模式</option>
          </select>
        </label>
        <button type="submit">生成 JSON</button>
        <button type="button" @click="app.saveCreatorLevel">保存关卡</button>
      </form>
      <p class="preview-hint">{{ app.previewHint }}</p>
      <section v-if="app.isLevelOutputVisible" class="level-output-panel" aria-label="生成的关卡 JSON">
        <div class="level-output-header">
          <strong>生成的 JSON</strong>
        </div>
        <pre>{{ app.levelOutput }}</pre>
      </section>
      <div class="creator-workspace">
        <section class="preview-panel" aria-label="关卡预览">
          <div class="preview-board-wrap">
            <div class="preview-board" :style="app.creatorPreviewStyle" @click="app.handleCreatorPreviewClick">
              <svg class="preview-grid" :viewBox="app.creatorViewBox" preserveAspectRatio="none">
                <line v-for="line in app.creatorGridLines" :key="line.key" v-bind="line.attrs"></line>
              </svg>
              <svg class="preview-blocked-layer" :viewBox="app.creatorViewBox" preserveAspectRatio="none">
                <line v-for="edge in app.creatorRemovedEdges" :key="edge.key" v-bind="edge.attrs"></line>
              </svg>
              <svg class="preview-answer-layer" :viewBox="app.creatorViewBox" preserveAspectRatio="none">
                <line
                  v-for="edge in app.creatorAnswerEdges"
                  :key="edge.key"
                  v-bind="edge.attrs"
                  :style="{ '--answer-color': edge.color }"
                ></line>
              </svg>
              <svg class="preview-hit-layer" :viewBox="app.creatorViewBox" preserveAspectRatio="none">
                <line
                  v-for="edge in app.creatorHitEdges"
                  :key="edge.key"
                  v-bind="edge.attrs"
                  :data-preview-edge="edge.key"
                ></line>
              </svg>
              <button
                v-for="node in app.creatorNodes"
                :key="node.key"
                type="button"
                class="preview-node"
                :style="node.style"
                :data-preview-node="node.key"
              >
                <span
                  v-if="node.point"
                  class="preview-dot"
                  :style="{ '--dot-color': node.point.color }"
                >
                  {{ node.point.label }}
                </span>
              </button>
            </div>
          </div>
          <div class="pair-picker" aria-label="选择点对">
            <button
              v-for="pairId in app.creatorState.pairIds"
              :key="pairId"
              type="button"
              class="pair-chip"
              :class="{ 'is-active': pairId === app.creatorState.activePairId }"
              :style="{ '--pair-color': app.pointDefinitions[pairId]?.color ?? 'var(--accent)' }"
              @click="app.selectCreatorPair(pairId)"
            >
              {{ app.pointDefinitions[pairId]?.label ?? pairId }}
            </button>
          </div>
        </section>
      </div>
    </section>
  </section>
</template>

<script>
export default {
  name: "CreatorView",
  inject: ["app"]
};
</script>
