<template>
  <section class="view view-play" :class="{ 'is-active': app.activeView === 'play' }" :hidden="app.activeView !== 'play'" aria-labelledby="game-title">
    <h1 id="game-title" class="sr-only">The Linker 关卡游玩</h1>
    <section class="game-panel">
      <LevelPickerPanel />
      <div v-if="!app.isInitialLevelLoading && !app.isLevelsLoading && !app.isLevelDetailLoading && !app.currentLevel" class="play-status" role="status" aria-live="polite">
        {{ app.developerStatusText || "暂无关卡" }}
      </div>
      <PlayBoardStage />
      <div class="game-watermark" aria-hidden="true">v0.2.2@Tabris_ZX</div>

      <div v-if="app.isWon && !app.isVictoryDismissed" class="victory-mark" role="status" aria-live="polite" aria-label="胜利">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功!</span>
            <strong>用时 {{ app.victoryTimeText }}</strong>
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
import LevelPickerPanel from "../components/LevelPickerPanel.vue";
import PlayBoardStage from "../components/play/PlayBoardStage.vue";

export default {
  name: "PlayView",
  components: {
    LevelPickerPanel,
    PlayBoardStage
  },
  inject: ["app"]
};
</script>
