export const computed = {
  pickerLevels() {
    return this.levelIndex.map((level) => ({
      ...level,
      isCompleted: Boolean(this.completedLevels[level.id]),
      metaText: this.completedLevels[level.id] ? "已完成" : `难度 ${level.difficulty}`
    }));
  },
  completionOptions() {
    return [
      { value: "all", label: "全部" },
      { value: "new", label: "未完成" },
      { value: "done", label: "已完成" }
    ];
  },
  timerText() {
    const totalSeconds = Math.floor(this.elapsedMs / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
};
