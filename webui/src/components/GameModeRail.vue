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
          icon: "连",
          label: "标准连接",
          description: "连接同色端点",
          hint: "标准连接",
          disabled: false,
          isActive: this.activeView !== "weave-total"
        },
        {
          id: "weave-total",
          action: "weave-total",
          icon: "织",
          label: "织链：色点总数",
          description: this.isDeveloperMode ? "提交隐藏色点" : "开发中",
          hint: weaveDisabled ? "织链模式暂不可用" : "织链：色点总数",
          disabled: weaveDisabled,
          isActive: this.activeView === "weave-total"
        }
      ];
    }
  }
};
</script>
