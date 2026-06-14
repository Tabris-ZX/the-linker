# The Linker

一个用 Vue、Vite 和 FastAPI 制作的连线解谜小游戏。玩家连接相同点对，避开被移除的边，并覆盖所有可通行节点即可胜利。

## 名字由来

- the witness
- the room
- the talos principle
- the looker
- ...

## 功能

- Vue 前端负责游玩、关卡选择、关卡编辑器和个性化配置。
- FastAPI 后端负责静态前端、关卡目录、关卡保存、审核、开发者验证和在线人数统计。
- 支持方形、直角三角形和正三角形地图。
- 支持双端连线：同色点对两端可以分别向外画，分支相遇后自动合并。
- 支持双击未完成路径节点回退，双击端点清空同色路径。
- 支持主题、地图尺寸视觉参数、点位配色、点位贴图、背景图和前端调试端口配置。
- 关卡答案和关卡本体分离存储，前端只加载必要目录信息，打开关卡时再加载详情。

## 本地运行

```bash
cd webui
npm install
npm run build
cd ..
uv sync
uv run python -m server.main
```

FastAPI 会按 `config/config.yaml` 中的 `server.backendPort` 启动，并直接服务 `webui/dist` 和 `/api/*`。Vite 只用于前端开发和构建，不再注册或响应后端接口。

前端开发端口由 `config/config.yaml` 的 `server.frontendDebugPort` 控制，也可以用环境变量覆盖：

```bash
cd webui
VITE_FRONTEND_PORT=5173 npm run dev
```

## 目录结构

- `webui/src`：前端源码。
- `webui/src/asserts/styles`：前端 CSS。
- `webui/public`：前端 public 资源，当前包含 `background.webp`、`icon.webp`，也可放点位贴图。
- `config/config.yaml`：运行配置、路径配置和端口配置。
- `config/settings/styles/map.json`：棋盘视觉参数。
- `config/settings/styles/themes.json`：主题 token。
- `config/settings/styles/points.json`：点位颜色和贴图配置。
- `data/levels`：关卡本体，按 `stable`、`alpha`、`removed` 分类。
- `data/answers`：编辑器答案线路，按同样分类存储。
- `data/levels-index.json`：轻量关卡目录索引，由后端生成，可删除后重建。
- `data/levels-hash.json`：关卡结构哈希索引，用于重复关卡检测。

## 地图存储设计

关卡本体只保存可公开加载的地图结构，不保存玩家路径，也不强制把答案嵌入关卡文件。一个关卡 JSON 示例：

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

字段说明：

- `id`：关卡 id。稳定关卡使用 `1001` 这类四位 id，测试关卡可使用 `1001-tmp`。
- `name`：显示名。
- `difficulty`：1 到 5 的难度。
- `gridType`：地图类型，当前支持 `square`、`right-triangle` 和 `equilateral-triangle`。
- `width` / `height`：方形和直角三角形地图尺寸。
- `radius`：正三角形地图尺寸；正三角形地图不需要 `width` / `height`。
- `pairs`：点对端点。`id` 对应点位样式配置中的编号，`points` 是两个端点坐标。
- `removedEdges`：被移除的边集合，用于制造缺口、墙和非矩形可通行区域。

答案线路独立存放在 `data/answers/<category>/<id>.json`：

```json
{
  "levelId": "1001",
  "answers": [
    { "edge": "0,0|1,0", "pairId": "1" }
  ]
}
```

这种分离有几个目的：

- 游玩态只依赖地图结构，玩家可以走出任意有效解，不必匹配隐藏答案。
- 关卡目录可以保持轻量，减少首屏传输。
- 编辑器仍能保存、回显和校验作者标记的答案线路。
- 后续可以调整答案、审核关卡或移动分类，而不污染地图本体。

## 关卡目录和审核流

关卡按三类目录组织：

- `data/levels/stable`：正式关卡，普通用户可见。
- `data/levels/alpha`：测试关卡，开发者模式可见。
- `data/levels/removed`：待删或不收录关卡，开发者模式可见。

对应答案放在 `data/answers/stable`、`data/answers/alpha`、`data/answers/removed`。

编辑器只对开发者开放。输入 `config/config.yaml` 中的 `server.su-token` 后，可以生成、保存、审核测试关卡，并在关卡选择窗口中把 alpha 关卡收录到 stable，或移动到 removed。

## 自由度和配置

### 地图自由度

地图并不局限于完整矩形：

- 方形地图用 `width` / `height` 控制尺寸。
- 正三角形地图用 `radius` 控制范围。
- `removedEdges` 可以移除任意边，用来做墙、缺口、窄通道或局部断开的结构。
- 点对数量由关卡 `pairs` 决定，显示样式由 `config/settings/styles/points.json` 决定。
- 胜利条件是所有点对连通，且所有可通行节点被有效路径覆盖。

### 地图视觉参数

`config/settings/styles/map.json` 控制棋盘显示比例：

- `dotScale`：端点大小。
- `nodeScale`：普通节点大小。
- `lineScale`：玩家连线粗细。
- `gridLineScale`：网格线粗细。
- `snapPointRadius`：指针吸附半径。

这些只影响前端显示和操作手感，不改变关卡数据。

### 点位配色和贴图

`config/settings/styles/points.json` 使用统一格式：

```json
{
  "默认": {
    "type": "color",
    "style": {
      "1": "#ef4444"
    }
  },
  "孤独摇滚": {
    "type": "image",
    "style": {
      "1": "#ff0000"
    }
  }
}
```

- `type: "color"`：直接使用 `style` 中的颜色。
- `type: "image"`：优先加载 `/points/<配置名>/<点 id>.webp`。
- 贴图只兼容 WebP。贴图缺失时回退为 `style` 中的颜色。
- 点位贴图建议放在 `webui/public/points/<配置名>/1.webp` 这种路径下。

### 主题和背景

- `config/settings/styles/themes.json` 定义主题 token，如 `paper`、`ink`、`line`、`accent`。
- `webui/public/background.webp` 是默认背景资源。
- `config/config.yaml` 的 `background.image` 填 `background` 时会加载 `/background.webp`，填 `no` 可关闭背景。
- `background.opacity` 和 `background.blur` 控制背景透明度和模糊。

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

## 数据传输设计

首屏加载只请求轻量目录索引。目录项包含关卡 id、名称、难度、分类和来源路径，不包含完整点对、答案线路或签名字段。打开某一关时才按需请求完整关卡。

这种设计减少了初始传输量，关卡数量增加时也不会把所有地图内容一次性发给前端。
