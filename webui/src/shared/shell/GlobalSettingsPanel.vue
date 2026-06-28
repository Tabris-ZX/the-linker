<template>
  <section class="personalization-panel app-card" aria-labelledby="global-settings-title">
    <div class="personalization-header">
      <h2 id="global-settings-title">设置</h2>
      <button type="button" class="close-button" aria-label="关闭设置" @click="$emit('close')">
        关闭
      </button>
    </div>
    <div class="personalization-select-row">
      <label>
        主题
        <select :value="settings.theme" aria-label="主题切换" @change="$emit('update-setting', 'theme', $event.target.value)">
          <option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
        </select>
      </label>
      <label>
        配色
        <select :value="settings.palette" aria-label="点对配色" @change="$emit('update-setting', 'palette', $event.target.value)">
          <option v-for="palette in paletteOptions" :key="palette.id" :value="palette.id">{{ palette.label }}</option>
        </select>
      </label>
    </div>
    <section class="game-controls" aria-label="游戏设置">
      <h3>游戏</h3>
      <div class="setting-toggle-row">
        <span>辅助模式</span>
        <button
          type="button"
          class="setting-toggle-button"
          :class="{ 'is-enabled': settings.assistMode }"
          role="switch"
          :aria-checked="String(settings.assistMode)"
          @click="$emit('update-setting', 'assistMode', !settings.assistMode)"
        >
          {{ settings.assistMode ? "开" : "关" }}
        </button>
      </div>
      <div class="setting-toggle-row">
        <span>关联闪烁</span>
        <button
          type="button"
          class="setting-toggle-button"
          :class="{ 'is-enabled': settings.linkedBlink }"
          role="switch"
          :aria-checked="String(settings.linkedBlink)"
          @click="$emit('update-setting', 'linkedBlink', !settings.linkedBlink)"
        >
          {{ settings.linkedBlink ? "开" : "关" }}
        </button>
      </div>
    </section>
    <section class="style-controls" aria-label="样式设置">
      <h3>样式</h3>
      <label>
        地图缩放
        <input :value="mapStyle.boardScale" type="number" min="0.6" max="1.4" step="0.01" @change="updateMapStyle('boardScale', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'boardScale')">
      </label>
      <label>
        点对大小
        <input :value="mapStyle.dotScale" type="number" min="0.3" max="0.8" step="0.01" @change="updateMapStyle('dotScale', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'dotScale')">
      </label>
      <label>
        节点大小
        <input :value="mapStyle.nodeScale" type="number" min="0.04" max="0.5" step="0.01" @change="updateMapStyle('nodeScale', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'nodeScale')">
      </label>
      <label>
        连线宽度
        <input :value="mapStyle.lineScale" type="number" min="0.1" max="0.8" step="0.01" @change="updateMapStyle('lineScale', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'lineScale')">
      </label>
      <label>
        格边宽度
        <input :value="mapStyle.gridLineScale" type="number" min="0.02" max="0.2" step="0.01" @change="updateMapStyle('gridLineScale', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'gridLineScale')">
      </label>
      <label>
        吸附容差
        <input :value="mapStyle.snapPointTolerance" type="number" min="0.1" max="0.5" step="0.01" @change="updateMapStyle('snapPointTolerance', $event.target.value)" @wheel.prevent="handleNumberWheel($event, 'snapPointTolerance')">
      </label>
    </section>
    <div class="personalization-data-actions">
      <button type="button" class="personalization-reset-settings-button" @click="$emit('reset-settings')">
        恢复默认设置
      </button>
    </div>
  </section>
</template>

<script>
export default {
  name: "GlobalSettingsPanel",
  props: {
    mapStyle: {
      type: Object,
      required: true
    },
    settings: {
      type: Object,
      required: true
    },
    themeOptions: {
      type: Array,
      required: true
    },
    paletteOptions: {
      type: Array,
      required: true
    }
  },
  emits: ["close", "update-map-style", "update-setting", "reset-settings"],
  methods: {
    updateMapStyle(field, value) {
      this.$emit("update-map-style", field, value);
    },
    handleNumberWheel(event, field) {
      const input = event.currentTarget;
      const step = Number(input.step) || 0.01;
      const min = Number(input.min);
      const max = Number(input.max);
      const current = Number(this.mapStyle[field]);
      if (!Number.isFinite(current)) return;
      const direction = event.deltaY < 0 ? 1 : -1;
      let next = current + (direction * step);
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      this.updateMapStyle(field, Number(next.toFixed(4)));
    }
  }
};
</script>
