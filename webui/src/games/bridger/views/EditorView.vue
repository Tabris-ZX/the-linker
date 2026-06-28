<template>
  <section v-if="app.activeView === 'editor'" class="view view-editor bridge-editor-view is-active" aria-labelledby="bridge-editor-title">
    <BridgerEditor
      :level="app.currentLevel"
      :status-text="app.editorStatusText"
      @save="app.saveEditorLevel"
    />
  </section>
</template>

<script>
import BridgerEditor from "../components/BridgerEditor.vue";

export default {
  name: "BridgerEditorView",
  components: { BridgerEditor },
  inject: ["app"]
};
</script>
