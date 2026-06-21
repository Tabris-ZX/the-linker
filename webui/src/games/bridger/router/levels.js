export async function fetchBridgeLevelIndex() {
  const response = await fetch(withCacheBuster("/api/bridger/levels/index"), { cache: "no-cache" });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数桥关卡目录加载失败");
}

export async function fetchBridgeLevelDetail(levelId) {
  const response = await fetch(withCacheBuster(`/api/bridger/levels/${encodeURIComponent(levelId)}`), { cache: "no-cache" });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message ?? "数桥关卡加载失败");
}

export async function saveBridgeLevelRequest(level, token, options = {}) {
  const response = await fetch("/api/bridger/levels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
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

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}
