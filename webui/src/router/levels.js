let developerToken = "";

/**
 * 获取关卡目录。
 *
 * @returns {Promise<Array<object>>} 关卡目录项列表。
 */
export async function fetchLevelIndex() {
  const response = await fetch(withCacheBuster("/api/levels/index"), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "关卡目录加载失败");
}

/**
 * 按 id 获取完整关卡。
 *
 * @param {string} levelId 关卡 id。
 * @returns {Promise<object>} 完整关卡数据。
 */
export async function fetchLevelDetail(levelId, sourcePath = "") {
  const url = sourcePath
    ? `/api/level?path=${encodeURIComponent(sourcePath)}`
    : `/api/levels/${encodeURIComponent(levelId)}`;
  const response = await fetch(withCacheBuster(url), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "关卡加载失败");
}


/**
 * 按 sourcePath 获取编辑器答案线路。
 *
 * @param {string} sourcePath 关卡来源路径。
 * @returns {Promise<object>} 答案数据。
 */
export async function fetchLevelAnswers(sourcePath = "") {
  if (!sourcePath) return { answers: [] };
  const response = await fetch(withCacheBuster(`/api/level/answers?path=${encodeURIComponent(sourcePath)}`), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "答案加载失败");
}

/**
 * 通过 FastAPI 后端保存关卡。
 *
 * 浏览器代码不能直接写本地文件，所以保存只能走后端 /api/levels。
 *
 * @param {object} level 要保存的关卡数据。
 * @param {{ mode?: "create" | "update" }} [options] 保存模式，默认新建。
 * @returns {Promise<object>} 服务端写入后的关卡数据。
 */
export async function saveLevelRequest(level, options = {}) {
  let lastError = {};

  const response = await fetch(getLevelApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDeveloperAuthHeaders()
    },
    body: JSON.stringify({
      ...level,
      saveMode: options.mode ?? "create"
    })
  });

  if (response.ok) {
    return response.json();
  }

  lastError = await response.json().catch(() => ({}));
  throw new Error(lastError.message ?? "保存失败，请确认后端服务正在运行");
}

/**
 * 将测试关卡移动到正式版或待删版目录。
 *
 * @param {object|string} level 关卡目录项、完整关卡或关卡 id。
 * @param {"include"|"reject"} action 处理动作。
 * @returns {Promise<object>} 移动后的关卡数据。
 */
export async function reviewLevelRequest(level, action) {
  let lastError = {};

  for (const apiUrl of getLevelReviewApiUrls()) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getDeveloperAuthHeaders()
      },
      body: JSON.stringify({
        levelId: typeof level === "string" ? level : level?.id,
        sourcePath: typeof level === "string" ? "" : level?.sourcePath,
        action
      })
    });

    if (response.ok) {
      return response.json();
    }

    lastError = await response.json().catch(() => ({}));
  }

  throw new Error(lastError.message ?? "处理失败，请确认后端服务正在运行");
}

function getLevelApiUrl() {
  return "/api/levels";
}

function getLevelReviewApiUrls() {
  return ["/api/levels/review"];
}

export async function verifyDeveloperToken(token) {
  const response = await fetch("/api/developer/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (response.ok) return true;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "开发者 token 无效");
}

export async function sendPresenceHeartbeat(clientId = "") {
  const response = await fetch("/api/stats/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "在线心跳失败");
}

export async function fetchPresenceStats() {
  const response = await fetch(withCacheBuster("/api/stats/presence"), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "在线人数获取失败");
}

export function getDeveloperToken() {
  return developerToken;
}

export function setDeveloperToken(token) {
  developerToken = token;
}

function getDeveloperAuthHeaders() {
  const token = getDeveloperToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}
