<template>
      <AppNav
        v-model:active-view="activeView"
        v-model:selected-theme="selectedTheme"
        :view-tabs="visibleViewTabs"
        :theme-options="themeOptions"
        :timer-text="timerText"
        :levels="levels"
        :current-level-index="currentLevelIndex"
        @select-level="loadLevel"
        @reset-paths="resetPaths"
        @clear-paths="clearPaths"
      />

      <main class="app-shell">
        <section class="view view-challenge" :class="{ 'is-active': activeView === 'challenge' }" :hidden="activeView !== 'challenge'" aria-labelledby="game-title">
          <section class="game-panel">
            <div class="board-wrap">
              <div
                ref="boardRef"
                class="board"
                aria-label="the linker board"
                :style="boardStyle"
                @pointerdown="handleBoardPointerDown"
                @pointermove="handleBoardPointerMove"
                @pointerup="handleBoardPointerUp"
                @click.prevent
                @dblclick.prevent="handleBoardDoubleClick"
              >
                <svg class="edge-grid" :viewBox="boardViewBox" preserveAspectRatio="none">
                  <line v-for="line in gridLines" :key="line.key" v-bind="line.attrs"></line>
                </svg>
                <svg class="blocked-lines" :viewBox="boardViewBox" preserveAspectRatio="none">
                  <line v-for="edge in renderedRemovedEdges" :key="edge.key" v-bind="edge.attrs"></line>
                </svg>
                <svg class="edge-lines" :viewBox="boardViewBox" preserveAspectRatio="none">
                  <line
                    v-for="line in renderedPathLines"
                    :key="line.key"
                    v-bind="line.attrs"
                    :stroke="line.color"
                    :class="line.className"
                  ></line>
                </svg>
                <button
                  v-for="node in boardNodes"
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
              </div>
            </div>

            <div v-if="isWon" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
              <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
                <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
              </svg>
              <span>胜利！</span>
            </div>
          </section>
        </section>

        <section class="view view-creator" :class="{ 'is-active': activeView === 'creator' }" :hidden="activeView !== 'creator'" aria-labelledby="editor-title">
          <section class="editor-panel app-card">
            <h2 id="editor-title">关卡制作器</h2>
            <form class="creator-form" @submit.prevent="writeLevelTemplate">
              <label>
                格子类型
                <select v-model="creatorState.gridType">
                  <option value="square">方形</option>
                  <option value="hex" disabled>六边形（后续）</option>
                </select>
              </label>
              <label>
                宽度
                <input v-model.number="creatorState.width" type="number" min="3" max="12" @input="syncCreatorBounds">
              </label>
              <label>
                高度
                <input v-model.number="creatorState.height" type="number" min="3" max="12" @input="syncCreatorBounds">
              </label>
              <label>
                点对数量
                <input v-model.number="creatorPairCount" type="number" min="1" max="12" @input="syncCreatorPairCount">
              </label>
              <label>
                编辑模式
                <select v-model="creatorState.mode" @change="setCreatorModeHint">
                  <option value="edge">移边</option>
                  <option value="mark">加边</option>
                </select>
              </label>
              <button type="submit">生成 JSON</button>
              <button type="button" @click="saveCreatorLevel">保存关卡</button>
            </form>
            <p class="preview-hint">{{ previewHint }}</p>
            <section v-if="isLevelOutputVisible" class="level-output-panel" aria-label="生成的关卡 JSON">
              <div class="level-output-header">
                <strong>生成的 JSON</strong>
                <span>保存后会写入 data/levels</span>
              </div>
              <pre>{{ levelOutput }}</pre>
            </section>
            <div class="creator-workspace">
              <section class="preview-panel" aria-label="关卡预览">
                <div class="preview-board-wrap">
                  <div class="preview-board" :style="creatorPreviewStyle" @click="handleCreatorPreviewClick">
                    <svg class="preview-grid" :viewBox="creatorViewBox" preserveAspectRatio="none">
                      <line v-for="line in creatorGridLines" :key="line.key" v-bind="line.attrs"></line>
                    </svg>
                    <svg class="preview-blocked-layer" :viewBox="creatorViewBox" preserveAspectRatio="none">
                      <line v-for="edge in creatorRemovedEdges" :key="edge.key" v-bind="edge.attrs"></line>
                    </svg>
                    <svg class="preview-answer-layer" :viewBox="creatorViewBox" preserveAspectRatio="none">
                      <line
                        v-for="edge in creatorAnswerEdges"
                        :key="edge.key"
                        v-bind="edge.attrs"
                        :style="{ '--answer-color': edge.color }"
                      ></line>
                    </svg>
                    <svg class="preview-hit-layer" :viewBox="creatorViewBox" preserveAspectRatio="none">
                      <line
                        v-for="edge in creatorHitEdges"
                        :key="edge.key"
                        v-bind="edge.attrs"
                        :data-preview-edge="edge.key"
                      ></line>
                    </svg>
                    <button
                      v-for="node in creatorNodes"
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
                    v-for="pairId in creatorState.pairIds"
                    :key="pairId"
                    type="button"
                    class="pair-chip"
                    :class="{ 'is-active': pairId === creatorState.activePairId }"
                    :style="{ '--pair-color': pointDefinitions[pairId].color }"
                    @click="selectCreatorPair(pairId)"
                  >
                    {{ pointDefinitions[pairId].label }}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </section>
      </main>
</template>

<script>
import appOptions from './appOptions.js';
import '../config/themes/base.css';
import '../config/themes/creator.css';

export default appOptions;
</script>
