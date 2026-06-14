# 如何新增关卡

编辑器会生成一个包含 `map` 和 `answers` 的 JSON 对象。`map` 是玩家加载的地图数据，`answers` 是编辑器和审核使用的答案数据。

## 在编辑器里导入 JSON

1. 打开关卡编辑器。
2. 点击 **导入 JSON**。
3. 选择符合下方结构的 `.json` 文件。
4. 导入后的地图会作为“新关卡”载入，不会绑定原来的 `id`，保存时会按新建关卡处理。
5. 点击 **生成 JSON** 查看或复制整理后的 `map` / `answers` 结果。

## 关卡 JSON 结构

方形和直角三角形关卡的 `map` 使用 `width`、`height` 表示地图尺寸：

```json
{
  "map": {
    "id": "custom-5x5-3",
    "name": "自定义关卡",
    "difficulty": 2,
    "gridType": "square",
    "width": 5,
    "height": 5,
    "pairs": [
      {
        "id": "1",
        "points": [[0, 0], [4, 4]]
      }
    ],
    "removedEdges": ["1,1|1,2"]
  },
  "answers": {
    "levelId": "custom-5x5-3",
    "answers": [
      { "edge": "0,0|1,0", "pairId": "1" }
    ]
  }
}
```

正三角形关卡的 `map` 使用 `radius`，不使用 `width`、`height`。

字段说明：

- `map.id`：导入时可选。新建保存时接口会分配最终的 `level-xxx` id。
- `map.name`：关卡显示名称。为空时应用会自动生成默认名称。
- `map.difficulty`：难度，整数范围 `1-5`。
- `map.gridType`：地图类型，可选 `square`、`right-triangle`、`equilateral-triangle`。
- `map.width`、`map.height`：`square` 和 `right-triangle` 的地图尺寸，编辑器内限制为 `1-17`。
- `map.radius`：`equilateral-triangle` 的地图半径，编辑器内限制为 `1-6`。
- `map.pairs`：色点点对列表。每个点对只需要 `id` 和 `points`；`id` 使用字符串数字，例如 `"1"`、`"2"`。颜色和标签由点对配色配置按 `id` 推导。
- `map.removedEdges`：被移除的边，挑战时不可通行。边格式为 `"x1,y1|x2,y2"`。
- `answers.levelId`：答案对应的关卡 id。
- `answers.answers`：答案线路，仅用于编辑器和审核，格式为 `{ "edge": "x1,y1|x2,y2", "pairId": "1" }`。后端保存时会写到 `data/answers/<category>/level-xxx.json`，不会写入玩家加载的关卡 JSON。

## 地图样式配置结构

挑战页和编辑器预览共用同一套地图样式。配置文件是 `config/settings/styles/map.json`：

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

- `dotScale`：色点大小，范围 `0.3-0.8`。
- `nodeScale`：节点大小，范围 `0.04-0.5`。
- `lineScale`：连线宽度，范围 `0.1-0.8`。
- `gridLineScale`：格边宽度，范围 `0.02-0.2`。
- `snapPointRadius`：吸附强度，范围 `0.1-0.5`。
