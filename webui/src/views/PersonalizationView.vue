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
    <section class="layout-controls" aria-label="布局设置">
      <h3>布局</h3>
      <label>
        导航位置
        <select v-model="app.navLayout" aria-label="导航位置">
          <option value="top">顶部导航栏</option>
          <option value="sidebar">左侧边栏</option>
        </select>
      </label>
    </section>
    <section class="map-style-controls" aria-label="地图样式">
      <h3>地图样式</h3>
      <label>
        地图缩放
        <span>{{ app.mapStyle.boardScale.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.boardScale" type="range" min="0.6" max="1.4" step="0.01">
        <input v-model.number="app.mapStyle.boardScale" type="number" min="0.6" max="1.4" step="0.01">
      </label>
      <label>
        点对大小
        <span>{{ app.mapStyle.dotScale.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.dotScale" type="range" min="0.3" max="0.8" step="0.01">
        <input v-model.number="app.mapStyle.dotScale" type="number" min="0.3" max="0.8" step="0.01">
      </label>
      <label>
        节点大小
        <span>{{ app.mapStyle.nodeScale.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.nodeScale" type="range" min="0.04" max="0.5" step="0.01">
        <input v-model.number="app.mapStyle.nodeScale" type="number" min="0.04" max="0.5" step="0.01">
      </label>
      <label>
        连线宽度
        <span>{{ app.mapStyle.lineScale.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.lineScale" type="range" min="0.1" max="0.8" step="0.01">
        <input v-model.number="app.mapStyle.lineScale" type="number" min="0.1" max="0.8" step="0.01">
      </label>
      <label>
        格边宽度
        <span>{{ app.mapStyle.gridLineScale.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.gridLineScale" type="range" min="0.02" max="0.2" step="0.01">
        <input v-model.number="app.mapStyle.gridLineScale" type="number" min="0.02" max="0.2" step="0.01">
      </label>
      <label>
        吸附强度
        <span>{{ app.mapStyle.snapPointRadius.toFixed(2) }}</span>
        <input v-model.number="app.mapStyle.snapPointRadius" type="range" min="0.1" max="0.5" step="0.01">
        <input v-model.number="app.mapStyle.snapPointRadius" type="number" min="0.1" max="0.5" step="0.01">
      </label>
    </section>
    <button type="button" class="personalization-copy-button" @click="app.copyMapStyleJson">
      复制 JSON
    </button>
    <pre class="personalization-json">{{ app.mapStyleJson }}</pre>
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
