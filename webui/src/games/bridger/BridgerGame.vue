<template>
  <div class="bridge-game">
    <GameToolbar
      title="数桥"
      @back="$emit('back-home')"
    />

    <PlayView />
    <EditorView />
  </div>
</template>

<script>
import bridgerOptions from "./app.js";
import GameToolbar from "../../shared/components/GameToolbar.vue";
import PlayView from "./views/PlayView.vue";
import EditorView from "./views/EditorView.vue";

export default {
  name: "BridgerGame",
  ...bridgerOptions,
  props: {
    developerToken: {
      type: String,
      default: ""
    },
    isDeveloperMode: {
      type: Boolean,
      default: false
    },
    startInEditor: {
      type: Boolean,
      default: false
    }
  },
  emits: ["back-home", "status-change"],
  components: {
    ...bridgerOptions.components,
    GameToolbar,
    PlayView,
    EditorView
  }
};
</script>
