<template>
  <div
    v-if="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || app.currentLevel"
    class="board-wrap finder-workspace"
    :class="{ 'is-loading': app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading || !app.currentLevel }"
    :aria-busy="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading ? 'true' : 'false'"
  >
    <div v-if="app.currentLevel && app.canUseFinderMode" class="finder-main-panel">
      <div class="finder-board-shell" :style="app.boardStyle">
        <div class="finder-corner"></div>
        <div class="finder-top-clues" aria-label="列线索">
          <div
            v-for="column in app.finderClueColumns"
            :key="`column-${column.index}`"
            class="finder-clue-cell"
          >
            <span class="finder-clue-items">
              <em class="finder-clue-item finder-total-clue" :class="`is-${column.total.status}`">
                {{ column.total.remaining }}
              </em>
            </span>
          </div>
        </div>
        <div class="finder-left-clues" aria-label="行线索">
          <div
            v-for="row in app.finderClueRows"
            :key="`row-${row.index}`"
            class="finder-clue-cell"
          >
            <span class="finder-clue-items">
              <em class="finder-clue-item finder-total-clue" :class="`is-${row.total.status}`">
                {{ row.total.remaining }}
              </em>
            </span>
          </div>
        </div>
        <GameBoard />
      </div>
      <FinderSidePanel />
    </div>
    <div v-else-if="app.currentLevel" class="play-status" role="status" aria-live="polite">
      {{ app.finderModeUnavailableText || "数寻暂不可用" }}
    </div>
    <GameBoard v-else />
  </div>
</template>

<script>
import GameBoard from "../../../shared/components/GameBoard.vue";
import FinderSidePanel from "./FinderSidePanel.vue";

export default {
  name: "FinderBoardStage",
  components: {
    GameBoard,
    FinderSidePanel
  },
  inject: ["app"]
};
</script>
