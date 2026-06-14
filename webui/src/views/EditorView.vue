<template>
  <section class="view view-editor" :class="{ 'is-active': app.activeView === 'editor' && app.canUseLevelEditor }" :hidden="app.activeView !== 'editor' || !app.canUseLevelEditor" aria-labelledby="editor-title">
    <section class="editor-panel app-card">
      <h2 id="editor-title">关卡编辑器</h2>
      <form class="editor-form" @submit.prevent="app.writeLevelTemplate()">
        <div class="editor-form-group editor-form-group-main">
          <div class="editor-form-group-title">基础信息</div>
          <div v-if="app.isDeveloperMode" class="editor-level-select">
            <label>
              修改关卡
              <select :value="app.editorEditingLevelId" @change="app.handleEditorLevelSelection($event.target.value)">
                <option value="">新建关卡</option>
                <option v-for="level in app.loadedLevels" :key="app.getLevelCacheKey(level)" :value="app.getLevelCacheKey(level)">
                  {{ level.id }} · {{ level.name || level.id }}
                </option>
              </select>
            </label>
          </div>
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
        </div>
        <div class="editor-form-group editor-form-group-grid">
          <div class="editor-form-group-title">地图参数</div>
          <label v-if="app.editorState.gridType !== 'equilateral-triangle'">
            宽度
            <input v-model.number="app.editorState.width" type="number" min="2" max="15" @input="app.syncEditorBounds" @wheel.prevent="app.handleEditorNumberWheel($event, 'width', app.syncEditorBounds)">
          </label>
          <label v-if="app.editorState.gridType !== 'equilateral-triangle'">
            高度
            <input v-model.number="app.editorState.height" type="number" min="2" max="15" @input="app.syncEditorBounds" @wheel.prevent="app.handleEditorNumberWheel($event, 'height', app.syncEditorBounds)">
          </label>
          <label v-if="app.editorState.gridType === 'equilateral-triangle'">
            半径
            <input v-model.number="app.editorState.radius" type="number" min="1" max="6" @input="app.syncEditorBounds" @wheel.prevent="app.handleEditorNumberWheel($event, 'radius', app.syncEditorBounds)">
          </label>
          <label>
            点对数量
            <input v-model.number="app.editorPairCount" type="number" min="1" :max="app.editorPairLimit" @input="app.syncEditorPairCount" @wheel.prevent="app.handleEditorNumberWheel($event, 'pairCount', app.syncEditorPairCount)">
          </label>
          <label>
            难度
            <input v-model.number="app.editorState.difficulty" type="number" min="1" max="5" @input="app.syncEditorDifficulty" @wheel.prevent="app.handleEditorNumberWheel($event, 'difficulty', app.syncEditorDifficulty)">
          </label>
          <label>
            编辑模式
            <select v-model="app.editorState.mode" @change="app.setEditorModeHint">
              <option value="mark">标记模式</option>
              <option value="edge">移除模式</option>
            </select>
          </label>
        </div>
        <fieldset v-if="app.isDeveloperMode" class="editor-generator-panel">
          <legend>生成器</legend>
          <label>
            难度
            <select v-model.number="app.editorGeneratorState.difficulty">
              <option v-for="difficulty in [1, 2, 3, 4, 5]" :key="difficulty" :value="difficulty">
                {{ difficulty }}
              </option>
            </select>
          </label>
          <label>
            格子类型
            <select v-model="app.editorGeneratorState.gridType">
              <option value="square">方形</option>
              <option value="right-triangle">直角三角形</option>
              <option value="equilateral-triangle">正三角形</option>
            </select>
          </label>
          <button type="button" :disabled="app.isEditorGenerating" @click="app.generateEditorPuzzle">
            {{ app.isEditorGenerating ? "生成中" : "生成地图" }}
          </button>
        </fieldset>
        <div class="editor-form-actions" aria-label="关卡操作">
          <button type="submit">生成 JSON</button>
          <label class="editor-import-button">
            导入 JSON
            <input type="file" accept="application/json,.json" @change="app.importEditorLevelJson">
          </label>
          <button type="button" @click="app.clearEditorLayout">清空内容</button>
          <button v-if="app.isDeveloperMode" type="button" :disabled="app.isEditorCheckingGood" @click="app.checkEditorGoodSolution">
            {{ app.isEditorCheckingGood ? "检查中" : "检查好解" }}
          </button>
          <button v-if="app.isDeveloperMode" type="button" @click="app.saveEditorLevel">保存关卡</button>
        </div>
      </form>
      <p class="preview-hint">{{ app.previewHint }}</p>
      <div class="editor-workspace">
        <section class="preview-panel" aria-label="关卡预览">
          <div class="preview-board-wrap">
            <div class="preview-board" :style="app.editorPreviewStyle" @click="app.handleEditorPreviewClick">
              <svg class="preview-grid" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <path v-if="app.editorGridPathD" :d="app.editorGridPathD"></path>
              </svg>
              <svg class="preview-blocked-layer" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <path v-if="app.editorRemovedEdgesPathD" :d="app.editorRemovedEdgesPathD"></path>
              </svg>
              <svg class="preview-answer-layer" :viewBox="app.editorViewBox" preserveAspectRatio="none">
                <path
                  v-for="group in app.editorAnswerEdgeGroups"
                  :key="group.key"
                  :d="group.d"
                  :style="{ '--answer-color': group.color }"
                ></path>
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
                class="preview-node node"
                :style="node.style"
                :data-preview-node="node.key"
              >
                <span
                  v-if="node.point"
                  class="preview-dot dot"
                  :class="{ 'has-texture': app.hasPointTexture(node.point) }"
                  :style="app.getPointDotStyle(node.point)"
                >
                  <img
                    v-if="app.hasPointTexture(node.point)"
                    class="dot-texture"
                    :src="node.point.texture.src"
                    alt=""
                    draggable="false"
                    @error="app.handlePointTextureError(node.point)"
                  >
                  <span class="dot-label">{{ node.point.label }}</span>
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
      <section v-if="app.isLevelOutputVisible" class="level-output-panel" aria-label="生成的 map 和 answers JSON">
        <div class="level-output-header">
          <strong>生成的 map / answers JSON</strong>
          <button type="button" @click="app.copyEditorLevelOutput">复制 JSON</button>
        </div>
        <textarea class="level-output-textarea" :value="app.levelOutput" readonly spellcheck="false" aria-label="生成的 map 和 answers JSON 文本"></textarea>
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
