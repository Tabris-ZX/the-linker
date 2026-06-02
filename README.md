# the linker

一个用 Vue 和 Vite 制作的连线解谜小游戏。

连接相同数字的点，避开被移除的边，并铺满需要经过的地图即可胜利。

## 功能

- 支持 GitHub Pages 静态部署
- 本地开发服务器下启用关卡编辑器
- 关卡使用 `data/levels` 下的 JSON 文件
- 支持配置主题、点对颜色和背景图片

## 本地运行

```bash
npm install
npm run dev
```

只有通过本地 Vite 服务器运行，并且 `/api/levels` 可用时，才会显示关卡编辑入口。

## 打包

```bash
npm run build
```

生产文件会生成到 `docs/`，方便直接用于 GitHub Pages。

## GitHub Pages

发布源选择仓库中的 `docs/` 目录即可。

静态部署时会自动隐藏关卡编辑器。需要新增关卡时，把 JSON 文件放进 `data/levels` 后重新打包。

## 配置

- `config/config.yaml`：主要路径、主题、背景
- `config/colors`：点对颜色
- `config/themes`：主题样式
- `data/levels`：可游玩的关卡
