import { appConfig } from "./config.js";
import { cloneLevel, hydrateLevel, loadLevelFiles } from "./services/levels.js";
import { edgeKey, getAllGridEdges, isAdjacent, keyOf, pointsFromEdgeKey, positionToArray, samePoint } from "./utils/geometry.js";

const SNAP_POINT_RADIUS = 0.3;
const COMPLETED_LEVELS_STORAGE_KEY = "the-linker-completed-levels";

export const methods = {
    async detectLevelEditorAvailability() {
      this.canUseLevelEditor = import.meta.env.DEV;

      if (!this.canUseLevelEditor && this.activeView === "creator") {
        this.activeView = "challenge";
      }
    },

    async loadLevels() {
      // Refresh the in-memory level list from the local levels/ directory.
      this.isLevelsLoading = true;
      try {
        const fileLevels = await loadLevelFiles();
        const merged = new Map();

        fileLevels.forEach((item) => {
          const hydrated = hydrateLevel(item);
          merged.set(hydrated.id, hydrated);
        });

        this.levels = [...merged.values()];
      } finally {
        this.isLevelsLoading = false;
      }
    },

    loadLevel(index) {
      if (!Number.isInteger(index) || !this.levels[index]) return;
      this.currentLevelIndex = index;
      this.currentLevel = cloneLevel(hydrateLevel(this.levels[index]));
      this.isLevelPickerOpen = false;
      this.isPersonalBest = false;
      this.resetPaths();
    },

    toggleLevelPicker() {
      this.isLevelPickerOpen = !this.isLevelPickerOpen;
    },

    closeLevelPicker() {
      this.isLevelPickerOpen = false;
    },

    selectLevelFromPicker(index) {
      this.loadLevel(index);
    },

    loadCompletedLevels() {
      try {
        this.completedLevels = JSON.parse(window.localStorage.getItem(COMPLETED_LEVELS_STORAGE_KEY) || "{}");
      } catch {
        this.completedLevels = {};
      }
    },

    saveCompletedLevels() {
      window.localStorage.setItem(COMPLETED_LEVELS_STORAGE_KEY, JSON.stringify(this.completedLevels));
    },

    isLevelCompleted(levelId) {
      return Boolean(this.completedLevels[levelId]);
    },

    normalizeLevelDifficulty(value) {
      const difficulty = Number(value);
      if (!Number.isFinite(difficulty)) return 1;
      return Math.min(5, Math.max(1, Math.round(difficulty)));
    },

    formatElapsedTime(milliseconds) {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    },

    getLevelBestTimeText(levelId) {
      const record = this.completedLevels[levelId];
      if (!record) return "未完成";
      if (!record.bestMs) return "已完成";
      return `最佳 ${this.formatElapsedTime(record.bestMs)}`;
    },

    getCompletedLevelCount() {
      return Object.keys(this.completedLevels).length;
    },

    markCurrentLevelCompleted() {
      if (!this.currentLevel?.id) return;
      const levelId = this.currentLevel.id;
      const previousRecord = this.completedLevels[levelId] ?? {};
      const elapsedMs = this.timerElapsedMs;
      const isPersonalBest = !previousRecord.bestMs || elapsedMs < previousRecord.bestMs || (this.isPersonalBest && elapsedMs === previousRecord.bestMs);
      this.isPersonalBest = isPersonalBest;
      this.completedLevels = {
        ...this.completedLevels,
        [levelId]: {
          ...previousRecord,
          completedAt: previousRecord.completedAt ?? new Date().toISOString(),
          lastCompletedAt: new Date().toISOString(),
          lastMs: elapsedMs,
          bestMs: isPersonalBest ? elapsedMs : previousRecord.bestMs
        }
      };
      this.saveCompletedLevels();
    },

    buildVictoryShareText() {
      const levelName = this.currentLevel?.name || this.currentLevel?.id || "未选择";
      const levelId = this.currentLevel?.id ? `（${this.currentLevel.id}）` : "";
      const elapsedText = this.formatElapsedTime(this.timerElapsedMs);
      const completedCount = this.getCompletedLevelCount();
      const gameUrl = window.location.href;

      return [
        `游戏链接：${gameUrl}`,
        `通关关卡：${levelName}${levelId}`,
        `用时：${elapsedText}`,
        `总通关关卡：${completedCount}`
      ].join("\n");
    },

    async shareVictory() {
      if (!this.isWon) return;
      const text = this.buildVictoryShareText();

      try {
        await this.copyTextToClipboard(text);
        this.shareStatusText = "已复制";
      } catch {
        this.shareStatusText = "复制失败";
      }
    },

    async copyTextToClipboard(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        const copied = document.execCommand("copy");
        if (!copied) throw new Error("Copy command failed");
      } finally {
        document.body.removeChild(textarea);
      }
    },

    applyTheme(themeId) {
      const theme = this.themes[themeId] ?? this.themes[appConfig.theme.default];
      const tokenMap = {
        paper: "--paper",
        ink: "--ink",
        muted: "--muted",
        line: "--line",
        gridLine: "--grid-line",
        accent: "--accent",
        accentStrong: "--accent-strong",
        danger: "--danger",
        success: "--success"
      };

      document.documentElement.dataset.theme = theme.id;
      Object.entries(theme.tokens).forEach(([tokenName, tokenValue]) => {
        document.documentElement.style.setProperty(tokenMap[tokenName], tokenValue);
      });
    },

    async applyBackgroundConfig() {
      const background = appConfig.background;
      document.documentElement.style.setProperty("--background-opacity", String(background.opacity));
      document.documentElement.style.setProperty("--background-blur", background.blur);

      const images = background.images?.length ? background.images : [background.image].filter(Boolean);
      if (!images.length) {
        document.documentElement.style.setProperty("--background-image", "none");
        return;
      }

      const image = await this.findAvailableBackgroundImage(images);
      if (!image) {
        document.documentElement.style.setProperty("--background-image", "none");
        console.warn(`Background image not found: ${images.join(", ")}. Put it under the background/ directory.`);
        return;
      }

      const imagePath = new URL(image, window.location.href).href;
      document.documentElement.style.setProperty("--background-image", `url("${imagePath}")`);
    },

    async findAvailableBackgroundImage(images) {
      for (const image of images) {
        if (await this.canLoadImage(image)) return image;
      }
      return "";
    },

    canLoadImage(image) {
      return new Promise((resolve) => {
        const tester = new Image();
        tester.onload = () => resolve(true);
        tester.onerror = () => resolve(false);
        tester.src = new URL(image, window.location.href).href;
      });
    },

    resetPaths() {
      if (!this.currentLevel) return;
      // Reset each pair to its first endpoint, matching the normal puzzle start state.
      const paths = {};
      this.currentLevel.pairs.forEach((pair) => {
        paths[pair.id] = [pair.points[0]];
      });
      this.paths = paths;
      this.activePair = null;
      this.isDrawing = false;
      this.pointerMoved = false;
      this.pointerPreview = null;
      this.resetGameTimer();
      this.isWon = false;
      this.isPersonalBest = false;
      this.shareStatusText = "分享";
    },

    clearPaths() {
      if (!this.currentLevel) return;
      const paths = {};
      this.currentLevel.pairs.forEach((pair) => {
        paths[pair.id] = [];
      });
      this.paths = paths;
      this.activePair = null;
      this.isDrawing = false;
      this.pointerMoved = false;
      this.pointerPreview = null;
      this.isWon = false;
      this.isPersonalBest = false;
      this.shareStatusText = "分享";
    },

    handleBoardPointerDown(event) {
      if (!this.currentLevel) return;
      this.startGameTimer();
      const position = this.positionFromEvent(event);
      if (!position) return;

      if (event.detail > 1) {
        this.stopDrawing();
        return;
      }

      const startInfo = this.getPathStartInfo(position);
      if (!startInfo) {
        return;
      }

      this.startPath(startInfo.pairId, position, startInfo.mode);
      event.currentTarget.setPointerCapture(event.pointerId);
      this.pointerMoved = false;
      event.preventDefault();
    },

    handleBoardPointerMove(event) {
      if (!this.isDrawing || !this.activePair) return;
      this.pointerPreview = this.pointerPositionFromEvent(event);

      const position = this.nearestPositionFromEvent(event);
      if (!position) return;
      this.pointerMoved = true;
      this.addStep(position);
    },

    handleBoardPointerUp(event) {
      const pairToPause = this.activePair;
      const finalPosition = this.nearestPositionFromEvent(event);

      if (this.isDrawing && this.activePair && finalPosition) {
        this.addStep(finalPosition);
      }

      if (pairToPause) {
        this.pausePath(pairToPause, this.pointerMoved);
      }

      this.pointerMoved = false;
      this.pointerPreview = null;
      this.releasePointer(event);
    },

    handleBoardDoubleClick(event) {
      if (!this.currentLevel) return;
      const position = this.positionFromEvent(event);
      if (!position) return;

      const pairId = this.endpoints[keyOf(position.x, position.y)];
      if (!pairId) return;
      this.clearPairPath(pairId);
    },

    startPath(pairId, position, mode = "endpoint") {
      this.activePair = pairId;
      this.isDrawing = true;
      this.pointerPreview = null;
      this.isWon = false;
      this.isPersonalBest = false;

      const currentPath = this.paths[pairId] ?? [];
      if (mode === "path-end") {
        this.paths[pairId] = this.orientPathForEnd(currentPath, position);
      } else {
        const pair = this.getPair(pairId);
        const endpointIndex = pair.points.findIndex(([x, y]) => x === position.x && y === position.y);
        if (endpointIndex === -1) return;

        if (currentPath.some(([x, y]) => x === position.x && y === position.y)) {
          this.paths[pairId] = this.trimPathForEndpointStart(currentPath, position);
        } else {
          this.paths[pairId] = [positionToArray(position)];
        }
      }
    },

    addStep(position) {
      // Commit one snapped grid point into the active path after validating collisions.
      const path = this.paths[this.activePair] ?? [];
      const last = path[path.length - 1];
      if (!last) {
        this.paths[this.activePair] = [positionToArray(position)];
        return true;
      }

      const next = positionToArray(position);
      if (samePoint(last, next)) return true;

      const previousIndex = path.findIndex((point) => samePoint(point, next));
      if (previousIndex >= 0) {
        if (previousIndex === path.length - 2) {
          this.paths[this.activePair] = path.slice(0, previousIndex + 1);
          return true;
        }

        return false;
      }

      if (this.hasPairReachedBothEndpoints(this.activePair, path)) {
        return false;
      }

      if (!isAdjacent(last, next)) {
        const routed = this.addStepsToward(next);
        if (routed) return true;
        return false;
      }

      if (this.getEdgeOccupant(last, next)) {
        return false;
      }

      if (this.isLevelEdgeRemoved(edgeKey(last, next))) {
        return false;
      }

      const endpointOwner = this.endpoints[keyOf(next[0], next[1])];
      if (endpointOwner && endpointOwner !== this.activePair) {
        return false;
      }

      const nodeOccupant = this.getNodeOccupant(next);
      if (nodeOccupant && nodeOccupant !== this.activePair) {
        return false;
      }

      if (endpointOwner === this.activePair && this.isEndpointAlreadyLinked(this.activePair, next)) {
        return false;
      }

      const pair = this.getPair(this.activePair);
      const isOwnEndpoint = pair.points.some((point) => samePoint(point, next));
      const alreadyReachedEnd = path.some((point) => pair.points.some((endpoint) => samePoint(endpoint, point))) && path.length > 1;

      this.paths[this.activePair] = [...path, next];
      if (isOwnEndpoint && alreadyReachedEnd && !samePoint(path[0], next)) {
        this.evaluateBoard();
        this.isDrawing = false;
        this.activePair = null;
        return true;
      }

      this.evaluateBoard();
      return true;
    },

    addStepsToward(target) {
      const path = this.paths[this.activePair] ?? [];
      let current = path[path.length - 1];
      if (!current) return false;

      const dx = target[0] - current[0];
      const dy = target[1] - current[1];
      if (dx !== 0 && dy !== 0) {
        const firstTarget = Math.abs(dx) >= Math.abs(dy) ? [target[0], current[1]] : [current[0], target[1]];
        return this.addStepsToward(firstTarget);
      }

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let moved = false;

      while (!samePoint(current, target)) {
        const next = [current[0] + stepX, current[1] + stepY];
        if (!this.addStep({ x: next[0], y: next[1] })) return moved;
        moved = true;
        const updatedPath = this.paths[this.activePair] ?? [];
        current = updatedPath[updatedPath.length - 1];
        if (!this.activePair || !current) return moved;
      }

      return moved;
    },

    evaluateBoard() {
      // Win only when every pair is connected and the required answer/board coverage is filled.
      if (!this.areAllPathsStructurallyValid()) {
        this.isWon = false;
        this.shareStatusText = "分享";
        return;
      }

      const allConnected = this.currentLevel.pairs.every((pair) => this.isPairConnected(pair));
      const allFilled = this.isBoardFilled();
      this.isWon = allConnected && allFilled;
      if (!this.isWon) {
        this.shareStatusText = "分享";
      }
      if (this.isWon) {
        this.stopGameTimer();
        this.markCurrentLevelCompleted();
      }
    },

    positionFromEvent(event) {
      const point = this.nearestPositionFromEvent(event);
      if (!point) return null;
      return point;
    },

    nearestPositionFromEvent(event) {
      const point = this.pointerPositionFromEvent(event);
      if (!point) return null;
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x > this.currentLevel.width || y > this.currentLevel.height) return null;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance > SNAP_POINT_RADIUS) return null;
      return { x, y };
    },

    pointerPositionFromEvent(event) {
      const rect = this.$refs.boardRef.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * this.currentLevel.width;
      const y = ((event.clientY - rect.top) / rect.height) * this.currentLevel.height;
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      return { x, y };
    },

    getPathStartInfo(position) {
      const endpointPairId = this.endpoints[keyOf(position.x, position.y)];
      if (endpointPairId && this.canStartFromEndpoint(endpointPairId, position)) {
        return { pairId: endpointPairId, mode: "endpoint" };
      }

      for (const [pairId, path] of Object.entries(this.paths)) {
        if (path.length === 0 || this.hasPairReachedBothEndpoints(pairId, path)) continue;
        const last = path[path.length - 1];
        if (samePoint(last, positionToArray(position))) {
          return { pairId, mode: "path-end" };
        }
      }

      return null;
    },

    orientPathForEnd(path, position) {
      const point = positionToArray(position);
      if (path.length === 0) return [point];
      if (samePoint(path[path.length - 1], point)) return path;
      return [point];
    },

    trimPathForEndpointStart(path, position) {
      const point = positionToArray(position);
      const index = path.findIndex((item) => samePoint(item, point));
      if (index <= 0) return [point];
      if (index === path.length - 1) return path;
      return path.slice(0, index + 1);
    },

    canStartFromEndpoint(pairId, position) {
      const path = this.paths[pairId] ?? [];
      if (path.length === 0) return true;

      const point = positionToArray(position);
      if (!path.some((item) => samePoint(item, point))) return true;

      return samePoint(path[path.length - 1], point) && this.getPathDegree(path, point) <= 1;
    },

    clearPairPath(pairId) {
      const path = this.paths[pairId] ?? [];
      if (path.length === 0) {
        return;
      }

      this.paths[pairId] = [];
      this.activePair = null;
      this.isDrawing = false;
      this.isWon = false;
      this.shareStatusText = "分享";
    },

    pausePath(pairId, hasMoved) {
      const path = this.paths[pairId] ?? [];
      this.isDrawing = false;
      this.activePair = null;

      if (this.hasPairReachedBothEndpoints(pairId, path)) {
        this.evaluateBoard();
        return;
      }

      if (!hasMoved) {
        return;
      }
    },

    stopDrawing() {
      this.isDrawing = false;
      this.activePair = null;
      this.pointerMoved = false;
      this.pointerPreview = null;
    },

    startGameTimer() {
      if (this.timerStartedAt !== null) return;
      this.timerStartedAt = Date.now();
      this.timerElapsedMs = 0;
      this.timerIntervalId = window.setInterval(() => {
        this.updateGameTimer();
      }, 250);
    },

    updateGameTimer() {
      if (this.timerStartedAt === null) return;
      this.timerElapsedMs = Date.now() - this.timerStartedAt;
    },

    stopGameTimer() {
      if (this.timerIntervalId !== null) {
        window.clearInterval(this.timerIntervalId);
        this.timerIntervalId = null;
      }
      this.updateGameTimer();
    },

    resetGameTimer() {
      if (this.timerIntervalId !== null) {
        window.clearInterval(this.timerIntervalId);
      }
      this.timerStartedAt = null;
      this.timerElapsedMs = 0;
      this.timerIntervalId = null;
    },

    releasePointer(event) {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },

    getPair(pairId) {
      return this.currentLevel?.pairs.find((pair) => pair.id === pairId) ?? null;
    },

    getEdgeOccupant(from, to) {
      const edge = edgeKey(from, to);
      for (const [pairId, path] of Object.entries(this.paths)) {
        for (let index = 1; index < path.length; index += 1) {
          if (edgeKey(path[index - 1], path[index]) === edge) return pairId;
        }
      }
      return null;
    },

    getNodeOccupant(point) {
      const nodeKey = keyOf(point[0], point[1]);
      for (const [pairId, path] of Object.entries(this.paths)) {
        if (path.some(([x, y]) => keyOf(x, y) === nodeKey)) return pairId;
      }
      return null;
    },

    isLevelEdgeRemoved(edge) {
      return new Set(this.currentLevel?.removedEdges ?? []).has(edge);
    },

    isEndpointAlreadyLinked(pairId, point) {
      const path = this.paths[pairId] ?? [];
      return this.getPathDegree(path, point) > 0;
    },

    getPathDegree(path, point) {
      const index = path.findIndex((item) => samePoint(item, point));
      if (index < 0) return 0;
      return [path[index - 1], path[index + 1]].filter(Boolean).length;
    },

    hasPairReachedBothEndpoints(pairId, path) {
      const pair = this.getPair(pairId);
      return pair.points.every((endpoint) => path.some((point) => samePoint(point, endpoint)));
    },

    isPairConnected(pair) {
      const path = this.paths[pair.id] ?? [];
      if (path.length < 2) return false;
      const first = path[0];
      const last = path[path.length - 1];
      return (
        (samePoint(first, pair.points[0]) && samePoint(last, pair.points[1])) ||
        (samePoint(first, pair.points[1]) && samePoint(last, pair.points[0]))
      );
    },

    areAllPathsStructurallyValid() {
      return this.areAllNodesExclusive()
        && Object.entries(this.paths).every(([pairId, path]) => this.isPathStructurallyValid(pairId, path));
    },

    areAllNodesExclusive() {
      const occupiedNodes = new Map();
      for (const [pairId, path] of Object.entries(this.paths)) {
        for (const point of path) {
          const nodeKey = keyOf(point[0], point[1]);
          const occupant = occupiedNodes.get(nodeKey);
          if (occupant && occupant !== pairId) return false;
          occupiedNodes.set(nodeKey, pairId);
        }
      }
      return true;
    },

    isPathStructurallyValid(pairId, path) {
      const seen = new Set();
      for (let index = 0; index < path.length; index += 1) {
        const point = path[index];
        const key = keyOf(point[0], point[1]);
        if (seen.has(key)) return false;
        seen.add(key);

        const neighbors = [path[index - 1], path[index + 1]].filter(Boolean);
        if (neighbors.some((neighbor) => !isAdjacent(point, neighbor))) return false;

        const isEndpoint = this.endpoints[key] === pairId;
        if (isEndpoint && neighbors.length > 1) return false;
        if (!isEndpoint && neighbors.length > 2) return false;
      }
      return true;
    },

    isBoardFilled() {
      const answerEdges = this.getAnswerEdges();
      if (answerEdges.size > 0) {
        const filledEdges = this.getFilledEdges();
        return [...answerEdges].every((edge) => filledEdges.has(edge));
      }

      const filledNodes = this.getFilledNodes();
      return this.getRequiredNodes().every((node) => filledNodes.has(node));
    },

    getAnswerEdges() {
      const edges = new Set();
      (this.currentLevel.answers ?? []).forEach((answer) => {
        if (typeof answer === "string") {
          edges.add(answer);
          return;
        }
        if (answer?.edge) edges.add(answer.edge);
      });
      return edges;
    },

    getFilledEdges() {
      const edges = new Set();
      Object.values(this.paths).forEach((path) => {
        for (let index = 1; index < path.length; index += 1) {
          edges.add(edgeKey(path[index - 1], path[index]));
        }
      });
      return edges;
    },

    getFilledNodes() {
      const nodes = new Set();
      Object.values(this.paths).forEach((path) => {
        path.forEach(([x, y]) => nodes.add(keyOf(x, y)));
      });
      return nodes;
    },

    getRequiredNodes() {
      const removedEdges = new Set(this.currentLevel.removedEdges ?? []);
      const nodesWithOpenEdge = new Set();
      getAllGridEdges(this.currentLevel.width, this.currentLevel.height).forEach((edge) => {
        if (removedEdges.has(edge)) return;
        const points = pointsFromEdgeKey(edge);
        if (!points) return;
        points.forEach(([x, y]) => nodesWithOpenEdge.add(keyOf(x, y)));
      });
      return [...nodesWithOpenEdge];
    },

    getExtendableEnds() {
      const ends = new Set();
      Object.entries(this.paths).forEach(([pairId, path]) => {
        if (path.length === 0 || this.hasPairReachedBothEndpoints(pairId, path)) return;
        const [x, y] = path[path.length - 1];
        ends.add(keyOf(x, y));
      });
      return ends;
    },

    isActiveNode(x, y) {
      if (!this.activePair) return false;
      const path = this.paths[this.activePair] ?? [];
      const last = path[path.length - 1];
      return Boolean(last && last[0] === x && last[1] === y);
    },

    getActiveTargetKey() {
      if (!this.activePair) return "";
      const pair = this.getPair(this.activePair);
      const path = this.paths[this.activePair] ?? [];
      const start = path[0];
      if (!pair || !start) return "";

      const target = pair.points.find((point) => !samePoint(point, start));
      return target ? keyOf(target[0], target[1]) : "";
    },

};
