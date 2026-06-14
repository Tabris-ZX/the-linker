<template>
  <section class="personalization-panel app-card" aria-labelledby="personalization-title">
    <div class="personalization-header">
      <h2 id="personalization-title">设置</h2>
      <button type="button" class="close-button" aria-label="关闭个性化" @click="app.closePersonalization">
        关闭
      </button>
    </div>
    <div class="personalization-select-row">
      <label>
        主题
        <select :value="app.selectedTheme" aria-label="主题切换" @change="app.selectedTheme = $event.target.value">
          <option v-for="theme in app.themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
        </select>
      </label>
      <label>
        配色
        <select :value="app.selectedPalette" aria-label="点对配色" @change="app.selectedPalette = $event.target.value">
          <option v-for="palette in app.pointPaletteOptions" :key="palette.id" :value="palette.id">{{ palette.label }}</option>
        </select>
      </label>
    </div>
    <section class="game-controls" aria-label="游戏设置">
      <h3>游戏</h3>
      <label class="assist-mode-toggle">
        辅助模式
        <button
          type="button"
          class="setting-toggle-button"
          :class="{ 'is-enabled': app.isHintModeEnabled }"
          role="switch"
          :aria-checked="String(app.isHintModeEnabled)"
          @click="app.setAssistMode(!app.isHintModeEnabled)"
        >
          {{ app.isHintModeEnabled ? "开" : "关" }}
        </button>
      </label>
      <label>
        关联闪烁
        <button
          type="button"
          class="setting-toggle-button"
          :class="{ 'is-enabled': app.isLinkedBlinkEnabled }"
          role="switch"
          :aria-checked="String(app.isLinkedBlinkEnabled)"
          @click="app.setLinkedBlinkMode(!app.isLinkedBlinkEnabled)"
        >
          {{ app.isLinkedBlinkEnabled ? "开" : "关" }}
        </button>
      </label>
    </section>
    <section class="style-controls" aria-label="样式设置">
      <h3>样式</h3>
      <label>
        导航位置
        <select v-model="app.navLayout" aria-label="导航位置">
          <option value="top">顶部</option>
          <option value="sidebar">侧边</option>
        </select>
      </label>
      <label>
        地图缩放
        <input v-model.number="app.mapStyle.boardScale" type="number" min="0.6" max="1.4" step="0.01" @change="app.normalizeMapStyleField('boardScale')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'boardScale')">
      </label>
      <label>
        点对大小
        <input v-model.number="app.mapStyle.dotScale" type="number" min="0.3" max="0.8" step="0.01" @change="app.normalizeMapStyleField('dotScale')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'dotScale')">
      </label>
      <label>
        节点大小
        <input v-model.number="app.mapStyle.nodeScale" type="number" min="0.04" max="0.5" step="0.01" @change="app.normalizeMapStyleField('nodeScale')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'nodeScale')">
      </label>
      <label>
        连线宽度
        <input v-model.number="app.mapStyle.lineScale" type="number" min="0.1" max="0.8" step="0.01" @change="app.normalizeMapStyleField('lineScale')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'lineScale')">
      </label>
      <label>
        格边宽度
        <input v-model.number="app.mapStyle.gridLineScale" type="number" min="0.02" max="0.2" step="0.01" @change="app.normalizeMapStyleField('gridLineScale')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'gridLineScale')">
      </label>
      <label>
        吸附强度
        <input v-model.number="app.mapStyle.snapPointRadius" type="number" min="0.1" max="0.5" step="0.01" @change="app.normalizeMapStyleField('snapPointRadius')" @wheel.prevent="app.handleMapStyleNumberWheel($event, 'snapPointRadius')">
      </label>
    </section>
    <div class="personalization-data-actions">
      <button type="button" class="personalization-clear-data-button" @click="app.requestClearGameData">
        清空数据
      </button>
      <button type="button" class="personalization-reset-settings-button" v-on:click="app.restoreDefaultPersonalization">
        恢复默认设置
      </button>
      <div v-if="app.isClearDataConfirming" class="personalization-confirm-actions">
        <button type="button" class="personalization-confirm-button" @click="app.clearGameData">
          确定
        </button>
        <button type="button" class="personalization-cancel-button" @click="app.cancelClearGameData">
          取消
        </button>
      </div>
      <span v-if="app.clearDataStatusText">{{ app.clearDataStatusText }}</span>
    </div>
  </section>
</template>

<script>
export default {
  name: "PersonalizationView",
  inject: ["app"]
};
</script>
