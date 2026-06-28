<template>
  <section v-if="app.activeView === 'bridger'" class="view view-play bridge-play-view is-active" aria-label="数桥">
    <section class="bridge-panel">
      <BridgerBoardStage
        :level="app.currentLevel"
        :state="app.bridgerState"
        :selected-island-id="app.selectedIslandId"
        @select-island="app.selectIsland"
        @cycle-bridge="app.cycleBridge"
        @clear-selection="app.selectedIslandId = ''"
      />
      <LevelGridPicker
        :is-open="app.isLevelPanelOpen"
        title="数桥关卡"
        :levels="app.pickerLevels"
        :active-level-id="app.currentLevel.id"
        :difficulty-filter="app.levelDifficultyFilter"
        :completion-filter="app.levelCompletionFilter"
        :completion-options="app.completionOptions"
        @close="app.isLevelPanelOpen = false"
        @select-level="app.selectLevel"
        @update:difficultyFilter="app.levelDifficultyFilter = $event"
        @update:completionFilter="app.levelCompletionFilter = $event"
      />
      <GameWatermark />

      <div v-if="app.isWon" class="victory-mark bridge-victory" role="status" aria-live="polite" aria-label="数桥通关">
        <div class="victory-main">
          <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M18 8h28v9h9v7c0 10-6 17-15 18-2 3-4 5-7 6v6h11v6H20v-6h11v-6c-3-1-5-3-7-6-9-1-15-8-15-18v-7h9V8Zm0 15h-5v1c0 6 3 10 8 12-2-4-3-8-3-13Zm28 0c0 5-1 9-3 13 5-2 8-6 8-12v-1h-5Z"></path>
          </svg>
          <div class="victory-copy">
            <span>通关成功</span>
            <strong>用时 {{ app.timerText }}</strong>
          </div>
        </div>
        <div class="victory-actions">
          <button type="button" class="victory-share-button" @click="app.nextLevel">下一关</button>
          <button type="button" class="close-button" @click="app.isWon = false">关闭</button>
        </div>
      </div>
    </section>
  </section>
</template>

<script>
import GameWatermark from "../../../shared/components/GameWatermark.vue";
import BridgerBoardStage from "../components/BridgerBoardStage.vue";
import LevelGridPicker from "../../../shared/components/LevelGridPicker.vue";

export default {
  name: "BridgerPlayView",
  components: {
    BridgerBoardStage,
    GameWatermark,
    LevelGridPicker
  },
  inject: ["app"]
};
</script>
