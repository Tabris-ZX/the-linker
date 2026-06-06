# 如何新增关卡

项目里的每个关卡都是一个 JSON 对象。你可以在关卡编辑器里导入别人制作的 JSON，检查或调整地图，然后生成标准化后的 JSON 用于投稿或保存。

## 在编辑器里导入 JSON

1. 打开关卡编辑器。
2. 点击 **导入 JSON**。
3. 选择符合下方结构的 `.json` 文件。
4. 导入后的地图会作为“新关卡”载入，不会绑定原来的 `id`，保存时会按新建关卡处理。
5. 点击 **生成 JSON** 查看或复制整理后的结果。

## 关卡 JSON 结构

方形和直角三角形关卡使用 `width`、`height` 表示地图尺寸：

```json
{
  "id": "custom-5x5-3",
  "name": "自定义关卡",
  "difficulty": 2,
  "gridType": "square",
  "width": 5,
  "height": 5,
  "pairs": [
    {
      "id": "red",
      "label": "1",
      "color": "#ef4444",
      "points": [[0, 0], [4, 4]]
    }
  ],
  "removedEdges": ["1,1|1,2"],
  "answers": [
    { "edge": "0,0|1,0", "pairId": "red" }
  ]
}
```

正三角形关卡使用 `radius`，不使用 `width`、`height`：

```json
{
  "id": "custom-r3-3",
  "name": "三角形关卡",
  "difficulty": 3,
  "gridType": "equilateral-triangle",
  "radius": 3,
  "pairs": [],
  "removedEdges": [],
  "answers": []
}
```

字段说明：

- `id`：导入时可选。新建保存时接口会分配最终的 `level-xxx` id。
- `name`：关卡显示名称。为空时应用会自动生成默认名称。
- `difficulty`：难度，整数范围 `1-5`。
- `gridType`：地图类型，可选 `square`、`right-triangle`、`equilateral-triangle`。
- `width`、`height`：`square` 和 `right-triangle` 的地图尺寸，编辑器内限制为 `2-10`。
- `radius`：`equilateral-triangle` 的地图半径，编辑器内限制为 `1-6`。
- `pairs`：色点点对列表。每个点对需要 `id` 和 `points`。`label`、`color` 可省略，会由当前点对配色补齐。
- `removedEdges`：被移除的边，挑战时不可通行。边格式为 `"x1,y1|x2,y2"`。
- `answers`：答案线路。推荐格式为 `{ "edge": "x1,y1|x2,y2", "pairId": "red" }`。旧版字符串格式仍可读取，但新 JSON 应使用对象格式。

## 地图样式配置结构

挑战页和编辑器预览共用同一套地图样式。配置文件是 `config/styles/map.json`：

```json
{
  "mapStyle": {
    "dotScale": 0.5,
    "nodeScale": 0.3,
    "lineScale": 0.4,
    "gridLineScale": 0.07,
    "snapPointRadius": 0.3
  }
}
```

取值范围：

- `dotScale`：色点大小，范围 `0.3-0.7`。
- `nodeScale`：节点大小，范围 `0.04-0.5`。
- `lineScale`：连线宽度，范围 `0.1-0.5`。
- `gridLineScale`：格边宽度，范围 `0.02-0.2`。
- `snapPointRadius`：吸附强度，范围 `0.1-0.5`。
