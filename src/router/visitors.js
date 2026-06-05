/**
 * 记录一次网页访问。
 *
 * 浏览器端无法直接写入本地文件；开发环境通过 Vite 的 /api/visitors 接口写入
 * data/visitors/record.json，接口不可用时安静跳过。
 *
 * @returns {Promise<object|null>} 最新访客记录；失败时返回 null。
 */
export async function recordVisitorRequest() {
  for (const apiUrl of getVisitorApiUrls()) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        cache: "no-cache"
      });
      if (response.ok) return response.json();
    } catch {
      // 没有写文件接口时忽略即可。
    }
  }
  return null;
}

/**
 * 获取访客记录接口候选地址。
 *
 * @returns {string[]} 去重后的接口地址列表。
 */
function getVisitorApiUrls() {
  return ["/api/visitors"];
}
