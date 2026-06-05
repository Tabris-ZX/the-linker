/**
 * 获取完整关卡列表。
 *
 * 通过 Vite 本地接口读取配置里的关卡目录。
 *
 * @returns {Promise<Array<object>>} 关卡原始数据列表。
 */
export async function fetchLevelFiles() {
  for (const apiUrl of getLevelApiUrls()) {
    try {
      const response = await fetch(apiUrl, { cache: "no-cache" });
      if (response.ok) return response.json();
    } catch {
      // Ignore unavailable local API; the page remains usable with an empty list.
    }
  }
  return [];
}

/**
 * 通过 Vite 开发服务器接口保存关卡。
 *
 * 浏览器代码不能直接写本地文件，所以保存只能走开发环境里的 /api/levels。
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
        "Content-Type": "application/json"
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

  throw new Error(lastError.message ?? "保存失败，请确认正在通过 npm run dev 启动项目");
}

/**
 * 将测试关卡移动到正式版或待删除版目录。
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ levelId, action })
    });

    if (response.ok) {
      return response.json();
    }

    lastError = await response.json().catch(() => ({}));
  }

  throw new Error(lastError.message ?? "处理失败，请确认正在通过 npm run dev 启动项目");
}

function getLevelApiUrls() {
  return ["/api/levels"];
}

function getLevelReviewApiUrls() {
  return ["/api/levels/review"];
}
