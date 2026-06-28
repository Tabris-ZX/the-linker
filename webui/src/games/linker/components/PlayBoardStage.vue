<template>
  <div
    v-if="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || app.currentLevel"
    class="board-wrap"
    :class="{
      'is-loading': app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || !app.currentLevel,
      'is-portrait-board': app.prefersPortraitBoard,
      'is-rotated-display': app.shouldRotateBoardDisplay
    }"
    :style="app.boardStyle"
    :aria-busy="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading ? 'true' : 'false'"
  >
    <GameBoard />
  </div>
</template>

<script>
import GameBoard from "../../../shared/components/GameBoard.vue";

export default {
  name: "PlayBoardStage",
  components: {
    GameBoard
  },
  inject: ["app"]
};
</script>
