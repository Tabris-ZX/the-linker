<template>
  <section class="home-view" aria-labelledby="home-title">
    <div class="home-wrap">
      <div class="home-heading">
        <span>The Puzzles</span>
        <h1 id="home-title">THER 游戏合集</h1>
        <p>宇宙冷漠...</p>
        <button type="button" class="home-primary-action" @click="$emit('open-library')">选择游戏</button>
      </div>

      <div class="home-game-grid" aria-label="游戏列表">
        <button
          v-for="game in games"
          :key="game.id"
          type="button"
          class="home-game-card"
          @click="$emit('select-game', game.id)"
        >
          <span class="home-game-mark" aria-hidden="true">{{ game.mark }}</span>
          <span class="home-game-copy">
            <small>{{ game.meta }}</small>
            <strong>{{ game.title }}</strong>
            <span>{{ game.description }}</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<script>
import { gameCatalog } from "./gameCatalog.js";

export default {
  name: "HomeView",
  emits: ["select-game", "open-library"],
  data() {
    return {
      games: gameCatalog
    };
  }
};
</script>
