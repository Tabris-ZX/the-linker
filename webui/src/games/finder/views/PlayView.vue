<template>
  <section class="view view-play view-finder" :class="{ 'is-active': app.isFinderModeEnabled }" :hidden="!app.isFinderModeEnabled" aria-labelledby="finder-title">
    <h1 id="finder-title" class="sr-only">{{ app.finderModeTitle }}</h1>
    <section class="game-panel">
      <LevelPickerPanel />
      <div v-if="!app.isInitialLevelLoading && !app.isLevelsLoading && !app.isLevelDetailLoading && !app.currentLevel" class="play-status" role="status" aria-live="polite">
        {{ app.developerStatusText || "暂无关卡" }}
      </div>
      <FinderBoardStage />
      <GameWatermark />

      <div v-if="app.isWon && !app.isVictoryDismissed" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功!</span>
            <strong>用时 {{ app.victoryTimeText }}</strong>
            <small v-if="app.finderPenaltyMs > 0">原始 {{ app.timerText }} · 罚时 {{ app.finderPenaltyText }}</small>
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
import LevelPickerPanel from "../../../shared/components/LevelPickerPanel.vue";
import GameWatermark from "../../../shared/components/GameWatermark.vue";
import FinderBoardStage from "../components/FinderBoardStage.vue";

export default {
  name: "FinderPlayView",
  components: {
    GameWatermark,
    LevelPickerPanel,
    FinderBoardStage
  },
  inject: ["app"],
  watch: {
    "app.activeView": {
      immediate: true,
      async handler(view) {
        if (view !== "finder") return;
        if (this.app.isInitialLevelLoading || this.app.isLevelsLoading || this.app.isLevelDetailLoading) return;
        await this.app.toggleFinderMode(true);
        if (!this.app.canUseFinderMode || this.app.finderStatusText !== "已进入数寻模式") {
          this.app.activeView = "finder";
        }
      }
    }
  }
};
</script>
