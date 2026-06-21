<template>
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
      <WeaveSidePanel />
    </div>
    <div v-else-if="app.currentLevel" class="play-status" role="status" aria-live="polite">
      {{ app.weaveModeUnavailableText || "数寻暂不可用" }}
    </div>
    <GameBoard v-else />
  </div>
</template>

<script>
import GameBoard from "../GameBoard.vue";
import WeaveSidePanel from "./WeaveSidePanel.vue";

export default {
  name: "WeaveBoardStage",
  components: {
    GameBoard,
    WeaveSidePanel
  },
  inject: ["app"]
};
</script>
