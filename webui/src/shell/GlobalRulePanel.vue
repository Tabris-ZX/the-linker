<template>
  <section class="rule-panel app-card" aria-labelledby="global-rule-title">
    <div class="rule-header">
      <h2 id="global-rule-title">玩法</h2>
      <button type="button" class="close-button" aria-label="关闭玩法" @click="$emit('close')">
        关闭
      </button>
    </div>
    <div class="rule-content">
      <h3>{{ title }}</h3>
      <p v-for="line in lines" :key="line">{{ line }}</p>
    </div>
  </section>
</template>

<script>
export default {
  name: "GlobalRulePanel",
  props: {
    title: {
      type: String,
      required: true
    },
    lines: {
      type: Array,
      required: true
    }
  },
  emits: ["close"]
};
</script>
