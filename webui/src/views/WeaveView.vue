<template>
  <section class="view view-play view-weave" :class="{ 'is-active': app.isWeaveModeEnabled }" :hidden="!app.isWeaveModeEnabled" aria-labelledby="weave-title">
    <h1 id="weave-title" class="sr-only">{{ app.weaveModeTitle }}</h1>
    <section class="game-panel">
      <LevelPickerPanel />
      <div v-if="!app.isInitialLevelLoading && !app.isLevelsLoading && !app.isLevelDetailLoading && !app.currentLevel" class="play-status" role="status" aria-live="polite">
        {{ app.developerStatusText || "暂无关卡" }}
      </div>
      <div
        v-if="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || app.currentLevel"
        class="board-wrap weave-workspace"
        :class="{ 'is-loading': app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || !app.currentLevel }"
        :aria-busy="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading ? 'true' : 'false'"
      >
        <div v-if="app.currentLevel && app.canUseWeaveMode" class="weave-main-panel">
          <div class="weave-board-shell" :style="app.boardStyle">
            <div class="weave-corner"></div>
            <div class="weave-top-clues" aria-label="列线索">
              <div
                v-for="column in app.weaveClueColumns"
                :key="`column-${column.index}`"
                class="weave-clue-cell"
              >
                <span class="weave-clue-items">
                  <em class="weave-clue-item weave-total-clue" :class="`is-${column.total.status}`">
                    {{ column.total.remaining }}
                  </em>
                </span>
              </div>
            </div>
            <div class="weave-left-clues" aria-label="行线索">
              <div
                v-for="row in app.weaveClueRows"
                :key="`row-${row.index}`"
                class="weave-clue-cell"
              >
                <span class="weave-clue-items">
                  <em class="weave-clue-item weave-total-clue" :class="`is-${row.total.status}`">
                    {{ row.total.remaining }}
                  </em>
                </span>
              </div>
            </div>
            <GameBoard />
          </div>
          <aside class="weave-side-panel" aria-label="织链工具">
            <fieldset class="weave-panel-section">
              <legend>模式状态</legend>
              <div class="weave-console-title">
                <small>WEAVE</small>
                <strong>色点总数</strong>
              </div>
              <div class="weave-console-stats" aria-label="织链进度">
                <span>已标记</span>
                <strong>{{ app.weaveMarkedEndpointCount }} / {{ app.weaveHiddenEndpointCount }}</strong>
              </div>
              <p v-if="app.weaveStatusText" class="weave-status-text">{{ app.weaveStatusText }}</p>
            </fieldset>

            <fieldset class="weave-panel-section">
              <legend>色点备选</legend>
              <div class="weave-tool-row" aria-label="选择隐藏端点 id">
                <button
                  v-for="pair in app.weavePairOptions"
                  :key="pair.id"
                  type="button"
                  class="weave-pair-chip"
                  :class="{ 'is-active': app.weaveActivePairId === pair.id }"
                  :style="{ '--pair-color': pair.color }"
                  @click="app.selectWeavePair(pair.id)"
                >
                  {{ pair.label }}
                </button>
              </div>
            </fieldset>

            <fieldset class="weave-panel-section">
              <legend>提交</legend>
              <div class="weave-submit-row">
                <button type="button" :disabled="app.isWeaveAnswerLoading" @click="app.submitWeaveEndpoints">
                  {{ app.isWeaveAnswerLoading ? "检查中" : "提交" }}
                </button>
                <button type="button" @click="app.toggleWeaveMode(false)">
                  退出
                </button>
              </div>
              <div class="weave-console-stats" aria-label="织链计分">
                <span>罚时</span>
                <strong>{{ app.weavePenaltyText }}</strong>
              </div>
            </fieldset>

            <fieldset class="weave-panel-section weave-feedback-section">
              <legend>反馈</legend>
              <div v-if="app.weaveEndpointFeedback.length" class="weave-feedback" aria-live="polite">
                <strong>{{ app.weaveSubmitSummary }}</strong>
                <p
                  v-for="item in app.weaveEndpointFeedback"
                  :key="`${item.nodeKey}-${item.pairId}`"
                  :class="{ 'is-correct': item.isCorrect, 'is-wrong': !item.isCorrect }"
                >
                  {{ item.nodeKey }} · {{ item.pairId }} · {{ item.isCorrect ? "正确" : "错误" }}
                </p>
              </div>
              <p v-else class="weave-status-text">尚未提交</p>
            </fieldset>
          </aside>
        </div>
        <div v-else-if="app.currentLevel" class="play-status" role="status" aria-live="polite">
          {{ app.weaveModeUnavailableText || "织链模式暂不可用" }}
        </div>
        <GameBoard v-else />
      </div>
      <div class="game-watermark" aria-hidden="true">v1.0.1@Tabris_ZX</div>

      <div v-if="app.isWon && !app.isVictoryDismissed" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功!</span>
            <strong>用时 {{ app.victoryTimeText }}</strong>
            <small v-if="app.weavePenaltyMs > 0">原始 {{ app.timerText }} · 罚时 {{ app.weavePenaltyText }}</small>
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
import GameBoard from "../components/GameBoard.vue";
import LevelPickerPanel from "../components/LevelPickerPanel.vue";

export default {
  name: "WeaveView",
  components: {
    GameBoard,
    LevelPickerPanel
  },
  inject: ["app"],
  watch: {
    "app.activeView": {
      immediate: true,
      async handler(view) {
        if (view !== "weave-total") return;
        await this.app.toggleWeaveMode(true);
        if (!this.app.canUseWeaveMode || this.app.weaveStatusText !== "已进入织链模式") {
          this.app.activeView = "play";
        }
      }
    }
  }
};
</script>
