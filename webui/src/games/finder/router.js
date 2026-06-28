import {
  fetchPresenceStats,
  getDeveloperAuthHeaders,
  sendPresenceHeartbeat,
  setDeveloperToken,
  verifyDeveloperToken,
  withCacheBuster
} from "../../shared/api.js";

const PLAY_API_BASE = "/api/play/finder";
const EDITOR_API_BASE = "/api/editor/finder";

/**
 * 获取关卡目录。
 *
 * @returns {Promise<Array<object>>} 关卡目录项列表。
 */
export async function fetchLevelIndex() {
  const response = await fetch(withCacheBuster(`${PLAY_API_BASE}/levels/index`), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数寻关卡目录加载失败");
}

/**
 * 按 id 获取完整关卡。
 *
 * @param {string} levelId 关卡 id。
 * @returns {Promise<object>} 完整关卡数据。
 */
export async function fetchLevelDetail(levelId, sourcePath = "") {
  const url = sourcePath
    ? `${PLAY_API_BASE}/level?path=${encodeURIComponent(sourcePath)}`
    : `${PLAY_API_BASE}/levels/${encodeURIComponent(levelId)}`;
  const response = await fetch(withCacheBuster(url), {
    cache: "no-cache",
    headers: getDeveloperAuthHeaders()
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数寻关卡加载失败");
}


/**
 * 按 sourcePath 获取编辑器答案线路。
 *
 * @param {string} sourcePath 关卡来源路径。
 * @returns {Promise<object>} 答案数据。
 */
export async function fetchLevelAnswers(sourcePath = "") {
  if (!sourcePath) return { answers: [] };
  const response = await fetch(withCacheBuster(`${PLAY_API_BASE}/level/answers?path=${encodeURIComponent(sourcePath)}`), {
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
 * 浏览器代码不能直接写本地文件，所以保存只能走后端编辑器 API。
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
 * 调用后端生成器创建一张临时关卡。
 *
 * @param {object} payload 生成参数。
 * @returns {Promise<object>} 生成器返回的关卡和答案。
 */
export async function generateLevelRequest(payload) {
  const response = await fetch(`${EDITOR_API_BASE}/levels/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDeveloperAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (response.ok) return response.json();
  const errorPayload = await response.json().catch(() => ({}));
  throw new Error(errorPayload.message ?? "生成失败，请确认后端服务正在运行");
}

/**
 * 调用后端好解检查器验证编辑器答案。
 *
 * @param {object} payload 包含 map、answers 和 options 的校验请求。
 * @returns {Promise<object>} 检查结果。
 */
export async function checkLevelGoodRequest(payload) {
  const response = await fetch(`${EDITOR_API_BASE}/levels/check-good`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDeveloperAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (response.ok) return response.json();
  const errorPayload = await response.json().catch(() => ({}));
  throw new Error(errorPayload.message ?? "好解检查失败，请确认后端服务正在运行");
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

/** 返回关卡保存 API 地址。 */
function getLevelApiUrl() {
  return `${EDITOR_API_BASE}/levels`;
}

/** 返回关卡审核 API 地址列表。 */
function getLevelReviewApiUrls() {
  return [`${EDITOR_API_BASE}/levels/review`];
}

export { fetchPresenceStats, sendPresenceHeartbeat, setDeveloperToken, verifyDeveloperToken };
