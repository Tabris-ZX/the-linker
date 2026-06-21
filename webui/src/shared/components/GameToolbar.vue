<template>
  <header class="game-local-toolbar" :aria-label="`${title}工具栏`">
    <button type="button" @click="$emit('back')">返回</button>
    <strong class="toolbar-game-title">{{ title }}</strong>
  </header>
</template>

<script>
export default {
  name: "GameToolbar",
  props: {
    title: {
      type: String,
      required: true
    },
    timerText: { type: String, default: "" },
    levelLabel: { type: String, default: "" },
    canReset: { type: Boolean, default: true },
    showEditor: { type: Boolean, default: false },
    isEditorActive: { type: Boolean, default: false }
  },
  emits: ["back", "toggle-levels", "reset", "open-editor"]
};
</script>
