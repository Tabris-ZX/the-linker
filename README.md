# The Linker

一个用 Vue 和 Vite 制作的连线解谜小游戏。

连接相同数字的点，避开被移除的边，并铺满需要经过的地图即可胜利。

## 名字由来

the witness
the room
the talos principle
the looker
...

## 功能

- 前端内容由 `webui` 构建
- Python FastAPI 后端提供接口、静态前端、背景资源和关卡文件管理
- 关卡使用 `data/levels` 下的 JSON 文件
- 支持配置主题、点对颜色和背景图片

## 本地运行

```bash
cd webui
npm install
npm run build
cd ..
uv sync
uv run python -m server.main
```

FastAPI 会按 `config/config.yaml` 中的 `server.backendPort` 启动，并直接服务 `webui/dist`、`/api/levels`、`/api/levels/review`、`/api/developer/verify` 和 `/background/*`。Vite 只用于前端开发和构建，不再注册或响应后端接口。

## 配置

- `config/config.yaml`：主要路径、主题、背景
- `config/styles`：地图样式、点对颜色、主题和 CSS
- `data/levels/official`：正式关卡
- `data/levels/tests`：测试关卡
- `data/levels/deleted`：待删关卡

## 关卡目录

关卡支持放在 `data/levels` 的子目录里。当前约定：

- 正式关卡放在 `data/levels/official`
- 关卡编辑器和算法生成的新关卡默认放在 `data/levels/tests`
- 测试后不收录的关卡放在 `data/levels/deleted`

普通用户只看到正式关卡，但可以打开关卡编辑器新建关卡并生成 JSON；生成后可复制 JSON 并通过右上角 GitHub 链接提交 issue 投稿。点击左上角“开发者模式”并输入 `config/config.yaml` 里的 `server.su-token` 后，可以看到测试版和待删版，并保存或审核关卡；测试版关卡可在关卡选择窗口中“收录”到正式版，或“不收录”移动到待删版。开发者模式只在当前页面会话内生效，刷新或重新打开页面后需要重新输入 token。

## 关卡去重哈希

项目用 `data/levels-hash.json` 记录每个关卡的结构哈希，新建关卡保存时会先计算哈希并拒绝重复关卡。

重复判定规则：

- 地图类型和尺寸必须一致。
- 被移除的边集合一致。
- 点对只比较端点位置，不比较颜色、标签或点对 id。
- 每一对的两个端点内部无顺序要求，所有点对之间也无顺序要求。
- 地图旋转后结构一致也算重复；镜像翻转不算旋转重复。

哈希计算流程：

1. 枚举关卡的所有合法旋转形态。
2. 对每个形态生成稳定的 canonical JSON：包含 `gridType`、尺寸、排序后的 `removedEdges`、排序后的点对端点集合。
3. 取字典序最小的 canonical JSON。
4. 使用 SHA-256 生成最终哈希。

本地重建索引：

```bash
node scripts/rebuild-level-hashes.mjs
```

该脚本会扫描 `data/levels/*.json`，重写 `data/levels-hash.json`，并在发现已有重复组时输出关卡 id。
