<template>
  <nav class="game-mode-rail" aria-label="游玩模式">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      class="game-mode-rail-item"
      :class="{ 'is-active': mode.isActive }"
      :disabled="mode.disabled"
      :aria-current="mode.isActive ? 'page' : undefined"
      :title="mode.hint"
      @click="$emit('selectGameMode', mode.action)"
    >
      <span class="game-mode-rail-icon" aria-hidden="true">{{ mode.icon }}</span>
      <span class="game-mode-rail-label">
        <strong>{{ mode.label }}</strong>
        <small>{{ mode.description }}</small>
      </span>
    </button>
  </nav>
</template>

<script>
export default {
  name: "GameModeRail",
  props: {
    activeView: {
      type: String,
      required: true
    },
    isDeveloperMode: {
      type: Boolean,
      default: false
    },
    canUseWeaveMode: {
      type: Boolean,
      default: false
    }
  },
  emits: ["selectGameMode"],
  computed: {
    modes() {
      const weaveDisabled = !this.canUseWeaveMode;
      return [
        {
          id: "play",
          action: "normal",
          icon: "链",
          label: "数链",
          description: "连接所有相同色点",
          hint: "数链",
          disabled: false,
          isActive: this.activeView !== "weave-total"
        },
        {
          id: "weave-total",
          action: "weave-total",
          icon: "寻",
          label: "数寻",
          description: this.isDeveloperMode ? "找出隐藏色点" : "前面的玩法以后再来探索吧~",
          hint: weaveDisabled ? "前面的玩法以后再来探索吧~" : "找出隐藏色点",
          disabled: weaveDisabled,
          isActive: this.activeView === "weave-total"
        }
      ];
    }
  }
};
</script>
