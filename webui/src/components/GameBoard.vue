<template>
  <div
    ref="boardRef"
    class="board"
    :class="{ 'is-portrait-board': app.prefersPortraitBoard, 'is-rotated-display': app.shouldRotateBoardDisplay }"
    aria-label="the linker board"
    :style="app.boardStyle"
    @pointerdown="app.handleBoardPointerDown"
    @pointermove="app.handleBoardPointerMove"
    @pointerup="app.handleBoardPointerUp"
    @pointercancel="app.handleBoardPointerCancel"
    @click.prevent
    @dblclick.prevent="app.handleBoardDoubleClick"
  >
    <div v-if="app.isInitialLevelLoading || app.isLevelsLoading || app.isLevelDetailLoading" class="board-loading" role="status" aria-live="polite">加载中...</div>
    <svg v-if="app.currentLevel" class="edge-grid" :viewBox="app.boardViewBox" preserveAspectRatio="none">
      <path v-if="app.gridPathD" :d="app.gridPathD"></path>
    </svg>
    <svg v-if="app.currentLevel" class="edge-lines" :viewBox="app.boardViewBox" preserveAspectRatio="none">
      <template v-for="group in app.renderedPathGroups" :key="group.key">
        <path
          :d="group.d"
          :stroke="group.color"
          :class="group.className"
        ></path>
        <path
          v-if="group.isHintCorrect"
          :d="group.d"
          class="hint-chain-link"
        ></path>
      </template>
      <path
        v-if="app.pointerPreviewLine"
        :d="app.pointerPreviewLine.d"
        :stroke="app.pointerPreviewLine.color"
        class="preview-line"
      ></path>
    </svg>
    <template v-if="app.currentLevel">
      <button
        v-for="node in app.boardNodes"
        :key="node.key"
        type="button"
        class="node"
        :class="node.classes"
        :style="node.style"
        :aria-label="`交点 ${node.x + 1}, ${node.y + 1}`"
      >
        <span
          v-if="node.endpoint"
          class="dot"
          :class="{ 'has-texture': app.hasPointTexture(node.endpoint) }"
          :style="app.getPointDotStyle(node.endpoint)"
        >
          <img
            v-if="app.hasPointTexture(node.endpoint)"
            class="dot-texture"
            :src="node.endpoint.texture.src"
            alt=""
            draggable="false"
            @error="app.handlePointTextureError(node.endpoint)"
          >
          <span class="dot-label" :class="{ 'is-wide': String(node.endpoint.label).length > 1 }">{{ node.endpoint.label }}</span>
        </span>
        <span
          v-else-if="node.weaveMark"
          class="dot weave-mark-dot"
          :style="app.getPointDotStyle(node.weaveMark)"
        >
          <span class="dot-label" :class="{ 'is-wide': String(node.weaveMark.label).length > 1 }">{{ node.weaveMark.label }}</span>
        </span>
      </button>
    </template>
  </div>
</template>

<script>
export default {
  name: "GameBoard",
  inject: ["app"]
};
</script>
