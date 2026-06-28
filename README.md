# The

一个用 Vue, Vite 和 FastAPI 制作的连线解谜小游戏. 玩家连接相同点对, 避开被移除的边, 并覆盖所有可通行节点即可胜利.

## 功能

- Vue 前端负责游玩, 关卡选择, 关卡编辑器和个性化配置.
- FastAPI 后端负责 API, 关卡目录, 关卡保存, 审核, 开发者验证和在线人数统计.
- 支持方形, 直角三角形和正三角形地图.
- 支持双端连线, 同色点对两端可以分别向外画, 分支相遇后自动合并.
- 支持双击未完成路径节点回退, 双击端点清空同色路径.
- 支持主题, 棋盘视觉参数, 点位配色, 点位贴图, 背景图和前端调试端口配置.
- 关卡本体和答案线路分离存储, 前端先加载轻量目录, 打开关卡时再加载详情.

## 本地运行

```bash
cd webui
npm install
npm run build
cd ..
uv sync
uv run python -m server.main
```

FastAPI 按 `config/config.yaml` 中的 `server.backendPort` 启动, 主要提供 `/api/*`. 生产环境前端静态文件交给 nginx. Vite 只用于前端开发和构建.

如果前端出现 `/api/...` 404, 先确认 `server.backendPort` 上运行的是当前代码的后端:

```bash
python3 scripts/check-api.py
```

前端开发端口由 `config/config.yaml` 的 `server.frontendDebugPort` 控制, 也可以用环境变量覆盖:

```bash
cd webui
VITE_FRONTEND_PORT=5173 npm run dev
```

## 目录结构

- `webui/src`: 前端源码.
- `webui/public`: 前端 public 资源, 包含背景图, 图标和点位贴图.
- `server/games`: 各游戏后端能力，默认使用 `routers.py`、`services.py`、`repositories.py`、`models.py` 单文件分层；游戏目录之间不互相引用。
- `server/shared`: 跨游戏 API 或业务能力，例如开发者校验和在线统计。
- `server/utils`: 无业务语义的后端通用工具，例如 HTTP、路径和安全辅助。
- `config/config.yaml`: 运行配置, 路径配置和端口配置.
- `config/settings/styles/map.json`: 棋盘视觉参数.
- `config/settings/styles/themes.json`: 主题 token.
- `config/settings/styles/points.json`: 点位颜色和贴图配置.
- `data/levels`: 文件存储模式下的关卡本体.
- `data/answers`: 文件存储模式下的答案线路.
- `data/db/linker.db`: Linker 的 SQLite 数据库.
- `data/db/finder.db`: Finder 的 SQLite 数据库，运行时不依赖 Linker 数据库或私有模块.
- `data/db/bridger.db`: Bridger 的 SQLite 数据库.

## 地图数据

关卡本体只保存公开地图结构, 不保存玩家路径, 也不强制把答案嵌入关卡文件. 示例:

```json
{
  "id": "1001",
  "name": "Lv 1001",
  "difficulty": 1,
  "gridType": "square",
  "width": 4,
  "height": 4,
  "pairs": [
    { "id": "1", "points": [[0, 0], [4, 0]] },
    { "id": "2", "points": [[0, 1], [4, 1]] }
  ],
  "removedEdges": []
}
```

字段说明:

- `id`: 关卡 id. 正式关卡使用 `1001` 这类四位 id, 测试关卡可使用 `1001-tmp`.
- `name`: 显示名.
- `difficulty`: 1 到 5 的难度.
- `gridType`: 地图类型, 支持 `square`, `right-triangle` 和 `equilateral-triangle`.
- `width` / `height`: 地图尺寸. 正三角形地图也只使用这两个字段, 不存在 `radius`.
- `pairs`: 点对端点. `id` 对应点位样式配置中的编号, `points` 是两个端点坐标.
- `removedEdges`: 被移除的边集合, 用于制造缺口, 墙和非矩形结构.

答案线路独立存储. 文件模式下位于 `data/answers/<category>/<id>.json`:

```json
{
  "levelId": "1001",
  "answers": [
    { "edge": "0,0|1,0", "pairId": "1" }
  ]
}
```

## 正三角形地图

正三角形地图由正三角形铺成的六边形网格表示, 六边形上下两边保持水平.

- `width`: 六边形上顶边的长度.
- `height`: 经过中心的上下边高度线顺时针旋转 30 度后的整数长度, 该方向刚好与正三角形边重合.
- 编辑器和生成器限制 `width <= 12`, `height <= 8`, 并保持 `width > height`.
- 生成, 编辑, 校验, 渲染和导入导出都只读取 `width` / `height`.

## 存储和审核

关卡按三类分类:

- `stable`: 正式关卡, 普通用户可见.
- `alpha`: 测试关卡, 开发者模式可见.
- `removed`: 待删或不收录关卡, 开发者模式可见.

编辑器只对开发者开放. 输入 `config/config.yaml` 中的 `server.su-token` 后, 可以生成, 保存, 审核测试关卡, 并把 alpha 关卡收录到 stable 或移动到 removed.

存储方式由 `config/config.yaml` 的 `storage.method` 控制:

- `file`: 使用 `data/levels` 和 `data/answers`.
- `sqlite`: 使用各游戏独立 SQLite 数据库，例如 Linker 使用 `data/db/linker.db`，Finder 使用 `data/db/finder.db`，Bridger 使用 `data/db/bridger.db`。写入时不再自动同步备份库；需要备份时调用保留的手动备份函数或单独脚本。

## 配置

`config/settings/styles/map.json` 控制棋盘显示和操作手感:

- `boardScale`: 棋盘整体缩放.
- `dotScale`: 端点大小.
- `nodeScale`: 普通节点大小.
- `lineScale`: 玩家连线粗细.
- `gridLineScale`: 网格线粗细.
- `snapPointTolerance`: 指针吸附容差.

`config/settings/styles/points.json` 控制点位颜色和贴图. `type: "color"` 直接使用颜色, `type: "image"` 优先加载 `/points/<配置名>/<点 id>.webp`, 缺失时回退到颜色.

`config/settings/styles/themes.json` 定义主题 token, 如 `paper`, `ink`, `line`, `accent`.

背景图放在 `webui/public`. `config/config.yaml` 的 `background.image` 填 `background` 时加载 `/background.webp`, 填 `no` 可关闭背景.

## 去重哈希

项目用结构哈希拒绝重复关卡. 重复判定只看地图类型, 尺寸, 被移除的边和点对端点位置, 不看点对颜色, 标签或 id.

哈希流程:

1. 枚举关卡支持的等价旋转形态.
2. 生成稳定 canonical JSON, 包含 `gridType`, 尺寸, 排序后的 `removedEdges` 和排序后的点对端点集合.
3. 取字典序最小的 canonical JSON.
4. 使用 SHA-256 生成最终哈希.

## 数据加载

首屏只请求轻量目录索引. 目录项包含关卡 id, 名称, 难度, 分类和来源路径, 不包含完整点对和答案线路. 打开某一关时才请求完整关卡.
