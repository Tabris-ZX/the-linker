import { getDeveloperAuthHeaders, withCacheBuster } from "../../shared/api.js";

const PLAY_API_BASE = "/api/play/bridger";
const EDITOR_API_BASE = "/api/editor/bridger";

export async function fetchBridgerLevelIndex() {
  const response = await fetch(withCacheBuster(`${PLAY_API_BASE}/levels/index`), { cache: "no-cache" });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数桥关卡目录加载失败");
}

export async function fetchBridgerLevelDetail(levelId) {
  const response = await fetch(withCacheBuster(`${PLAY_API_BASE}/levels/${encodeURIComponent(levelId)}`), { cache: "no-cache" });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数桥关卡加载失败");
}

export async function saveBridgerLevelRequest(level, token, options = {}) {
  const response = await fetch(`${EDITOR_API_BASE}/levels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : getDeveloperAuthHeaders())
    },
    body: JSON.stringify({
      ...level,
      saveMode: options.mode ?? "create"
    })
  });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数桥关卡保存失败");
}
