<template>
  <div class="bridge-stage">
    <BridgerBoard
      :level="level"
      :state="state"
      :selected-island-id="selectedIslandId"
      @select-island="$emit('select-island', $event)"
      @cycle-bridge="forwardCycleBridge"
      @clear-selection="$emit('clear-selection')"
    />
  </div>
</template>

<script>
import BridgerBoard from "./BridgerBoard.vue";

export default {
  name: "BridgerBoardStage",
  components: {
    BridgerBoard
  },
  props: {
    level: {
      type: Object,
      required: true
    },
    state: {
      type: Object,
      required: true
    },
    selectedIslandId: {
      type: String,
      default: ""
    }
  },
  emits: ["select-island", "cycle-bridge", "clear-selection"],
  methods: {
    forwardCycleBridge(leftId, rightId) {
      this.$emit("cycle-bridge", leftId, rightId);
    }
  }
};
</script>
