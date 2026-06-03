<template>
      <AppNav
        v-model:active-view="activeView"
        :view-tabs="visibleViewTabs"
        :timer-text="timerText"
        :current-level-label="currentLevelLabel"
        :can-reset-level="Boolean(currentLevel) && !isLevelsLoading"
        :favicon-url="faviconUrl"
        @toggle-level-picker="toggleLevelPicker"
        @reset-paths="resetPaths"
        @toggle-personalization="togglePersonalization"
      />

      <main class="app-shell">
        <section v-if="isPersonalizationOpen" class="personalization-panel app-card" aria-labelledby="personalization-title">
          <div class="personalization-header">
            <h2 id="personalization-title">个性化</h2>
            <button type="button" class="close-button" aria-label="关闭个性化" @click="closePersonalization">关闭</button>
          </div>
          <div class="personalization-select-row">
            <label>
              主题
              <select :value="selectedTheme" aria-label="主题切换" @change="selectedTheme = $event.target.value">
                <option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
              </select>
            </label>
            <label>
              点对配色
              <select :value="selectedPalette" aria-label="点对配色" @change="selectedPalette = $event.target.value">
                <option v-for="palette in pointPaletteOptions" :key="palette.id" :value="palette.id">{{ palette.label }}</option>
              </select>
            </label>
          </div>
          <label>
            点对大小
            <span>{{ mapStyle.dotScale.toFixed(2) }}</span>
            <input v-model.number="mapStyle.dotScale" type="range" min="0.2" max="0.5" step="0.01">
            <input v-model.number="mapStyle.dotScale" type="number" min="0.2" max="0.5" step="0.01">
          </label>
          <label>
            节点大小
            <span>{{ mapStyle.nodeScale.toFixed(2) }}</span>
            <input v-model.number="mapStyle.nodeScale" type="range" min="0.04" max="0.5" step="0.01">
            <input v-model.number="mapStyle.nodeScale" type="number" min="0.04" max="0.5" step="0.01">
          </label>
          <label>
            连线宽度
            <span>{{ mapStyle.lineScale.toFixed(2) }}</span>
            <input v-model.number="mapStyle.lineScale" type="range" min="0.1" max="0.5" step="0.01">
            <input v-model.number="mapStyle.lineScale" type="number" min="0.1" max="0.5" step="0.01">
          </label>
          <label>
            格边宽度
            <span>{{ mapStyle.gridLineScale.toFixed(2) }}</span>
            <input v-model.number="mapStyle.gridLineScale" type="range" min="0.02" max="0.2" step="0.01">
            <input v-model.number="mapStyle.gridLineScale" type="number" min="0.02" max="0.2" step="0.01">
          </label>
          <label>
            吸附强度
            <span>{{ mapStyle.snapPointRadius.toFixed(2) }}</span>
            <input v-model.number="mapStyle.snapPointRadius" type="range" min="0.1" max="0.5" step="0.01">
            <input v-model.number="mapStyle.snapPointRadius" type="number" min="0.1" max="0.5" step="0.01">
          </label>
          <button type="button" class="personalization-copy-button" @click="copyMapStyleJson">
            复制 JSON
          </button>
          <pre class="personalization-json">{{ mapStyleJson }}</pre>
        </section>

        <section class="view view-challenge" :class="{ 'is-active': activeView === 'challenge' }" :hidden="activeView !== 'challenge'" aria-labelledby="game-title">
          <section class="game-panel">
            <section v-if="isLevelPickerOpen" class="level-picker-panel app-card" aria-label="关卡选择">
              <div class="level-picker-header">
                <strong>关卡选择</strong>
                <button type="button" class="close-button" aria-label="关闭关卡选择" @click="closeLevelPicker">关闭</button>
              </div>
              <div class="level-picker-filters">
                <label>
                  难度
                  <select v-model="levelDifficultyFilter">
                    <option value="all">全部</option>
                    <option v-for="difficulty in levelDifficulties" :key="difficulty" :value="String(difficulty)">
                      {{ difficulty }}
                    </option>
                  </select>
                </label>
                <label>
                  状态
                  <select v-model="levelCompletionFilter">
                    <option value="all">全部</option>
                    <option value="new">未完成</option>
                    <option value="done">已完成</option>
                  </select>
                </label>
              </div>
              <div class="level-group-list">
                <section v-for="group in groupedFilteredLevels" :key="group.difficulty" class="level-group">
                  <h2>难度 {{ group.difficulty }}</h2>
                  <div class="level-card-grid">
                    <button
                      v-for="item in group.levels"
                      :key="item.level.id"
                      type="button"
                      class="level-card"
                      :class="{ 'is-active': item.index === currentLevelIndex, 'is-completed': isLevelCompleted(item.level.id) }"
                      @click="selectLevelFromPicker(item.index)"
                    >
                      <strong>{{ item.level.name || item.level.id }}</strong>
                      <span>{{ item.level.id }} · 难度 {{ normalizeLevelDifficulty(item.level.difficulty) }}</span>
                      <small>{{ getLevelBestTimeText(item.level.id) }}</small>
                    </button>
                  </div>
                </section>
              </div>
            </section>
            <div v-if="isLevelsLoading" class="challenge-status" role="status" aria-live="polite">
              加载中
            </div>
            <div v-else-if="!currentLevel" class="challenge-status" role="status" aria-live="polite">
              暂无关卡
            </div>
            <div v-else class="board-wrap">
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

            <div v-if="isWon && !isVictoryDismissed" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
              <div class="victory-main">
                <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
                  <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
                </svg>
                <div class="victory-copy">
                  <span>通关成功</span>
                  <strong>用时 {{ victoryTimeText }}</strong>
                </div>
                <strong v-if="isPersonalBest" class="victory-pb">PB</strong>
              </div>
              <div class="victory-actions">
                <button type="button" class="victory-share-button" @click="shareVictory">
                  {{ shareStatusText }}
                </button>
                <button type="button" class="close-button" aria-label="关闭通关提示" @click="closeVictoryMark">关闭</button>
              </div>
            </div>
          </section>
        </section>

        <section class="view view-creator" :class="{ 'is-active': activeView === 'creator' }" :hidden="activeView !== 'creator'" aria-labelledby="editor-title">
          <section class="editor-panel app-card">
            <h2 id="editor-title">关卡编辑器</h2>
            <form class="creator-form" @submit.prevent="writeLevelTemplate">
              <label class="creator-name-field">
                名称
                <input v-model.trim="creatorState.name" type="text" placeholder="默认名字" @input="syncCreatorName">
              </label>
              <label>
                格子类型
                <select v-model="creatorState.gridType">
                  <option value="square">方形</option>
                  <option value="hex" disabled>六边形（后续）</option>
                </select>
              </label>
              <label>
                宽度
                <input v-model.number="creatorState.width" type="number" min="2" max="12" @input="syncCreatorBounds">
              </label>
              <label>
                高度
                <input v-model.number="creatorState.height" type="number" min="2" max="12" @input="syncCreatorBounds">
              </label>
              <label>
                点对数量
                <input v-model.number="creatorPairCount" type="number" min="1" max="12" @input="syncCreatorPairCount">
              </label>
              <label>
                难度
                <input v-model.number="creatorState.difficulty" type="number" min="1" max="5" @input="syncCreatorDifficulty">
              </label>
              <label>
                编辑模式
                <select v-model="creatorState.mode" @change="setCreatorModeHint">
                  <option value="mark">标记模式</option>
                  <option value="edge">移除模式</option>
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
                    :style="{ '--pair-color': pointDefinitions[pairId]?.color ?? 'var(--accent)' }"
                    @click="selectCreatorPair(pairId)"
                  >
                    {{ pointDefinitions[pairId]?.label ?? pairId }}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </section>
      </main>
</template>

<script>
import appOptions from './app/options.js';
import '../config/styles/base.css';
import '../config/styles/challenge.css';
import '../config/styles/creator.css';

export default appOptions;
</script>
