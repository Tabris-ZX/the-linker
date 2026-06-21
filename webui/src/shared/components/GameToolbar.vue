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
    }
  },
  emits: ["back"]
};
</script>
