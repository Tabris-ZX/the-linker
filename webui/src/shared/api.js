let developerToken = "";

export function getDeveloperToken() {
  return developerToken;
}

export function setDeveloperToken(token) {
  developerToken = token;
}

export function getDeveloperAuthHeaders() {
  const token = getDeveloperToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
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
