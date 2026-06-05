<template>
  <section class="view view-editor" :class="{ 'is-active': app.activeView === 'editor' }" :hidden="app.activeView !== 'editor'" aria-labelledby="editor-title">
    <section class="editor-panel app-card">
      <h2 id="editor-title">关卡编辑器</h2>
      <form class="editor-form" @submit.prevent="app.writeLevelTemplate()">
        <label>
          修改关卡
          <select :value="app.editorEditingLevelId" @change="app.handleEditorLevelSelection($event.target.value)">
            <option value="">新建关卡</option>
            <option v-for="level in app.levels" :key="level.id" :value="level.id">
              {{ level.id }} · {{ level.name || level.id }}
            </option>
          </select>
        </label>
        <label class="editor-name-field">
          名称
          <input v-model.trim="app.editorState.name" type="text" placeholder="默认名字" :disabled="Boolean(app.editorEditingLevelId)" @input="app.syncEditorName">
        </label>
        <label>
          格子类型
          <select v-model="app.editorState.gridType" @change="app.syncEditorBounds">
            <option value="square">方形</option>
            <option value="right-triangle">直角三角形</option>
            <option value="equilateral-triangle">正三角形</option>
          </select>
        </label>
        <label v-if="app.editorState.gridType !== 'equilateral-triangle'">
          宽度
          <input v-model.number="app.editorState.width" type="number" min="2" max="12" @input="app.syncEditorBounds">
        </label>
        <label v-if="app.editorState.gridType !== 'equilateral-triangle'">
          高度
          <input v-model.number="app.editorState.height" type="number" min="2" max="12" @input="app.syncEditorBounds">
        </label>
        <label v-if="app.editorState.gridType === 'equilateral-triangle'">
          半径
          <input v-model.number="app.editorState.radius" type="number" min="1" max="8" @input="app.syncEditorBounds">
        </label>
        <label>
          点对数量
          <input v-model.number="app.editorPairCount" type="number" min="1" max="12" :disabled="Boolean(app.editorEditingLevelId)" @input="app.syncEditorPairCount">
        </label>
        <label>
          难度
          <input v-model.number="app.editorState.difficulty" type="number" min="1" max="5" @input="app.syncEditorDifficulty">
        </label>
        <label>
          编辑模式
          <select v-model="app.editorState.mode" @change="app.setEditorModeHint">
            <option value="mark">标记模式</option>
            <option value="edge">移除模式</option>
          </select>
        </label>
        <div class="editor-form-actions" aria-label="关卡操作">
          <button type="submit">生成 JSON</button>
          <button type="button" @click="app.clearEditorLayout">清空内容</button>
          <button type="button" @click="app.saveEditorLevel">保存关卡</button>
        </div>
      </form>
      <p class="preview-hint">{{ app.previewHint }}</p>
      <div class="editor-workspace">
        <section class="preview-panel" aria-label="关卡预览">
          <div class="preview-board-wrap">
            <div class="preview-board" :style="app.editorPreviewStyle" @click="app.handleEditorPreviewClick">
              <svg class="preview-grid" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <line v-for="line in app.editorGridLines" :key="line.key" v-bind="line.attrs"></line>
              </svg>
              <svg class="preview-blocked-layer" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <line v-for="edge in app.editorRemovedEdges" :key="edge.key" v-bind="edge.attrs"></line>
              </svg>
              <svg class="preview-answer-layer" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <line
                  v-for="edge in app.editorAnswerEdges"
                  :key="edge.key"
                  v-bind="edge.attrs"
                  :style="{ '--answer-color': edge.color }"
                ></line>
              </svg>
              <svg class="preview-hit-layer" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <line
                  v-for="edge in app.editorHitEdges"
                  :key="edge.key"
                  v-bind="edge.attrs"
                  :data-preview-edge="edge.key"
                ></line>
              </svg>
              <button
                v-for="node in app.editorNodes"
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
              v-for="pairId in app.editorState.pairIds"
              :key="pairId"
              type="button"
              class="pair-chip"
              :class="{ 'is-active': pairId === app.editorState.activePairId }"
              :style="{ '--pair-color': app.pointDefinitions[pairId]?.color ?? 'var(--accent)' }"
              @click="app.selectEditorPair(pairId)"
            >
              {{ app.pointDefinitions[pairId]?.label ?? pairId }}
            </button>
          </div>
        </section>
      </div>
      <section v-if="app.isLevelOutputVisible" class="level-output-panel" aria-label="生成的关卡 JSON">
        <div class="level-output-header">
          <strong>生成的 JSON</strong>
          <button type="button" @click="app.copyEditorLevelOutput">复制 JSON</button>
        </div>
        <textarea class="level-output-textarea" :value="app.levelOutput" readonly spellcheck="false" aria-label="生成的关卡 JSON 文本"></textarea>
      </section>
    </section>
  </section>
</template>

<script>
export default {
  name: "EditorView",
  inject: ["app"]
};
</script>
