# 接口文档

这些接口由 FastAPI 后端提供。先运行：

```bash
uv run python -m server.main
```

## 鉴权

开发者接口需要 Bearer Token。Token 配置在 `config/config.yaml` 的 `server.su-token`。

```text
Authorization: Bearer <developer-token>
```

## GET /api/levels/index

读取关卡目录。目录只包含列表展示和筛选所需字段，不包含 `pairs`、`answers` 等完整关卡内容。后端会优先读取 `data/levels-index.json` 轻量索引；索引缺失或关卡文件签名变化时会自动重建。

未携带有效开发者 Token 时，只返回正式关卡。携带有效开发者 Token 时，会返回正式版、测试版和待删版关卡。

响应示例：

```json
[
  {
    "id": "level-001",
    "name": "Level 001",
    "difficulty": 1,
    "gridType": "square",
    "width": 5,
    "height": 5,
    "pairCount": 4,
    "sourcePath": "official/level-001.json",
    "sourceCategory": "official"
  }
]
```

## GET /api/levels/{levelId}

按 id 读取完整关卡。玩家或编辑器打开某关时再调用这个接口。

未授权用户只能读取正式关卡；开发者 Token 可读取测试版和待删版。

## GET /api/levels

兼容旧客户端的完整关卡列表接口，会返回关卡 JSON 内容。

携带 `offset`、`limit` 或 `id` 查询参数时返回分页对象。默认每次返回 8 关，服务端最大允许 10 关，前端会按需继续加载：

```json
{
  "levels": [],
  "total": 13,
  "offset": 0,
  "limit": 8
}
```

查询参数：

- `offset`：分页起点，从 `0` 开始。
- `limit`：每次返回数量，建议 `5-10`。
- `id`：返回包含指定关卡 id 的页，用于恢复上次游玩的关卡。

## POST /api/developer/verify

校验开发者 Token 是否有效。

请求头：

```text
Authorization: Bearer <developer-token>
```

成功响应：

```json
{ "ok": true }
```

## POST /api/levels

保存关卡。需要开发者 Token。

请求头：

```text
Content-Type: application/json
Authorization: Bearer <developer-token>
```

请求体示例：

```json
{
  "name": "自定义关卡",
  "difficulty": 2,
  "gridType": "square",
  "width": 5,
  "height": 5,
  "pairs": [],
  "removedEdges": [],
  "answers": [],
  "saveMode": "create"
}
```

`saveMode` 可选：

- `create`：新建关卡，写入 `data/levels/tests/level-xxx.json`，并自动分配下一个 id。
- `update`：更新已有 `level-xxx` 关卡。只允许更新已存在的关卡文件。

成功响应会返回保存后的关卡对象，并带上 `sourcePath`、`sourceCategory`。

## POST /api/levels/review

处理测试关卡，把它移动到正式版或待删版。需要开发者 Token。

请求头：

```text
Content-Type: application/json
Authorization: Bearer <developer-token>
```

请求体示例：

```json
{
  "levelId": "level-001",
  "action": "include"
}
```

`action` 可选：

- `include`：收录测试关卡，移动到 `official`。
- `reject`：不收录测试关卡，移动到 `deleted`。
