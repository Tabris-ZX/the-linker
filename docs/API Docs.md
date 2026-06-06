# 接口文档

这些接口由 Vite 开发服务器提供。先运行：

```bash
npm run dev
```

## 鉴权

开发者接口需要 Bearer Token。Token 配置在 `config/config.yaml` 的 `server.dev-token` 或 `server.devToken`。

```text
Authorization: Bearer <developer-token>
```

## GET /api/levels

读取配置目录里的关卡 JSON。

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
    "pairs": [],
    "removedEdges": [],
    "answers": [],
    "sourcePath": "official/level-001.json",
    "sourceCategory": "official"
  }
]
```

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