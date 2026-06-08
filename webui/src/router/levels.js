let developerToken = "";

/**
 * 获取完整关卡列表。
 *
 * 通过 FastAPI 后端读取配置里的关卡目录。
 *
 * @returns {Promise<Array<object>>} 关卡原始数据列表。
 */
export async function fetchLevelFiles(options = {}) {
  for (const apiUrl of getLevelApiUrls(options)) {
    try {
      const response = await fetch(apiUrl, {
        cache: "no-cache",
        headers: getDeveloperAuthHeaders()
      });
      if (response.ok) return response.json();
    } catch {
      // Ignore unavailable local API; the page remains usable with an empty list.
    }
  }
  return options.page ? { levels: [], total: 0, offset: 0, limit: options.limit ?? 10 } : [];
}

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

  for (const apiUrl of getLevelApiUrls()) {
    const response = await fetch(apiUrl, {
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
  }

  throw new Error(lastError.message ?? "保存失败，请确认后端服务正在运行");
}

/**
 * 将测试关卡移动到正式版或待删版目录。
 *
 * @param {string} levelId 关卡 id。
 * @param {"include"|"reject"} action 处理动作。
 * @returns {Promise<object>} 移动后的关卡数据。
 */
export async function reviewLevelRequest(levelId, action) {
  let lastError = {};

  for (const apiUrl of getLevelReviewApiUrls()) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getDeveloperAuthHeaders()
      },
      body: JSON.stringify({ levelId, action })
    });

    if (response.ok) {
      return response.json();
    }

    lastError = await response.json().catch(() => ({}));
  }

  throw new Error(lastError.message ?? "处理失败，请确认后端服务正在运行");
}

function getLevelApiUrls(options = {}) {
  const url = new URL("/api/levels", window.location.origin);
  if (options.page) {
    url.searchParams.set("offset", String(options.offset ?? 0));
    url.searchParams.set("limit", String(options.limit ?? 10));
  }
  if (options.id) {
    url.searchParams.set("id", String(options.id));
    url.searchParams.set("limit", String(options.limit ?? 10));
  }
  url.searchParams.set("_", String(Date.now()));
  return [url.pathname + url.search];
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
