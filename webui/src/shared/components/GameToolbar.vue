<template>
  <header class="game-local-toolbar" :aria-label="`${title}工具栏`">
    <button class="game-back-button" type="button" aria-label="返回首页" @click="$emit('back')">
      <span class="game-back-icon" aria-hidden="true">&lt;</span>
      <span>返回</span>
    </button>
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
    }
  },
  emits: ["back"]
};
</script>
