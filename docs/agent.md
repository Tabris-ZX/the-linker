# Agent 协作与项目结构规范

## 一定要记住，严格遵守

本项目由 4 个角色协作。所有 agent 在动手前先确认自己负责的边界，跨边界改动必须说明原因，并保持前后端结构一致。

## 1. 架构师

- 负责整体系统设计和技术选型。
- 定义模块划分、接口规范和数据流向。
- 统筹前后端及测试协作，确保方案可行、可扩展。
- 把控非功能性需求，包括性能、安全、可维护性。
- 目录重构时优先收敛现有结构，不做无关重写。

## 2. 前端

- 负责用户界面 UI 的开发和交互逻辑实现。
- 调用后端 API，进行数据展示和状态管理。
- 关注用户体验、响应式设计与浏览器兼容性。
- 与后端和测试配合，联调接口并修复界面问题。
- 前端新增代码必须放在对应游戏或 shared 目录下，不把跨游戏能力塞进单个游戏目录。

## 3. 后端

- 负责核心业务逻辑、数据处理和存储设计。
- 开发稳健的 API 服务，保证可用性和性能。
- 管理数据库、缓存、消息队列等基础设施。
- 实施安全策略、日志监控，协作完成接口对接。
- 后端新增游戏必须使用统一的 games/shared/utils 分层。

## 4. 测试

- 进行功能测试。
- 保障交付质量，输出测试报告和改进建议。
- 测试端口默认使用 5173；如果被占用，先确认监听进程是否为 Vite/Node 开发服务，优先复用现有服务，不随意杀进程。
- 结构调整后至少验证后端导入、前端测试和前端构建。

## 项目大结构

前后端都按 `games/shared/utils` 的思路组织：

- `games`：具体游戏的业务能力。每个游戏只放自己的路由、服务、仓储、视图、组件和样式。
- `shared`：跨游戏共享的业务能力、组件、样式或 shell 层能力。
- `utils`：无业务语义的通用工具函数，例如路径、安全、HTTP、几何或对象工具。

不要把跨游戏能力放进某个游戏目录里，除非这是明确的复用关系，并且调用方文档或代码注释能看出来。

## 后端目录规范

后端游戏目录默认使用单文件分层，避免小模块过度套目录：

```text
server/games/<game>/
  routers.py
  services.py
  repositories.py
  models.py
```

- `routers.py`：FastAPI 路由和请求鉴权入口，只做请求解析、权限检查和调用服务。
- `services.py`：业务逻辑、数据编排、校验、保存流程。
- `repositories.py`：数据库、文件系统或外部存储访问。
- `models.py`：该游戏后端使用的数据类型定义。
- `server/shared/`：跨游戏 API 或业务能力，例如统计、开发者 token 验证。
- `server/utils/`：无业务语义的通用工具，例如 `http.py`、`security.py`、`paths.py`。

后端游戏目录优先保持单文件分层。确实需要辅助模块时，只能作为该游戏私有实现放在当前游戏根目录，不能建 `routers/`、`services/`、`repositories/` 这类功能目录，也不能被其它游戏 import。新增后端游戏时，必须在 `routers.py` 中导出 `play_router`；如果有编辑器接口，再导出 `editor_router`。

## 前端目录规范

前端游戏目录中，`games/<game>/` 视为该游戏私有实现。除 `views/`、`components/`、`styles/` 外，其它能力使用游戏根目录下的单文件，不再用功能文件夹包裹：

```text
webui/src/games/<game>/
  views/
    PlayView.vue
    EditorView.vue
  components/
  styles/
    styles.css
    mobile.css   # 仅在该游戏确实需要独立移动端适配时存在
  router.js
  services.js
  app.js
  editor.js
  config.js
  utils.js
```

- `router.js`：前端 API 请求封装。
- `services.js`：前端数据装配、转换、状态辅助逻辑。
- `views/`：页面级视图，每个游戏必须包含游玩页 `PlayView.vue` 和编辑器页 `EditorView.vue`。
- `components/`：游戏内组件。
- `styles/`：只放该游戏游玩页和编辑器页独有样式；如果需要移动端独特样式，放 `mobile.css`。
- `app.js`：游戏应用级状态和入口配置。
- `editor.js`：编辑器专用逻辑。
- `config.js`：游戏配置和静态配置读取。
- `utils.js`：游戏内纯工具函数。
- `webui/src/shared/`：跨游戏组件、shell、基础样式和共享前端能力。
- `webui/src/utils/`：无业务语义的纯工具函数。

游戏目录之间不能直接互相引用。需要复用的棋盘、关卡选择、地图编辑器能力迁到 `webui/src/shared/` 或 `webui/src/utils/`。Finder 和 Linker 可以使用相同地图规则，但运行时必须使用各自的 API、状态、存储、视图和后端模块；只有地图组件、规则工具等跨游戏能力可以放到 shared/utils 后复用。

## 迁移规则

- 优先在现有结构基础上收敛，不做无关重构。
- 移动文件后必须同步所有导入路径。
- 包目录必须提供必要的 `__init__.py` 导出，避免入口导入变复杂。
- 不回滚用户已有改动；遇到未提交变更时，只改和任务相关的文件。
- 公共能力只有被两个及以上游戏实际使用时，才迁移到 `shared` 或 `utils`。
- 三个游戏的运行时数据必须独立；Finder、Linker、Bridger 不允许读写彼此的数据库、文件目录或私有模块。
- SQLite 写入不自动复制备份数据库；如需备份，调用保留的手动备份函数或单独脚本完成。

## Icon 更新排查

当前 favicon 来源是 `webui/index.html` 中的 `/icon.webp`，对应资源文件是 `webui/public/icon.webp`。

如果已经替换了 `webui/public/icon.webp` 但浏览器标签页图标没有变化，最常见原因是浏览器对 favicon 做了强缓存。优先按以下顺序排查：

1. 直接访问 `http://localhost:5173/icon.webp`，确认实际返回的图片是否已更新。
2. 强刷页面，或清除当前站点缓存。
3. 使用无痕窗口验证是否是浏览器缓存。
4. 如果需要代码层规避缓存，可以把 favicon 改成 `/icon.webp?v=20260623`，或换成新的文件名并同步 `index.html`。

本项目默认不为 icon 增加 cache-busting 参数，除非明确要求修改代码。
