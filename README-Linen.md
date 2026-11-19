# Linen 暖白主题

为 Komari Monitor 1.6.1 制作的暖白极简主题。主题保留官方 1.6.1 前端的监控、节点详情、登录和路由功能，仅调整配色、留白、卡片与导航外观，并支持亮/暗模式和 Komari 的强调色切换。

## 本地构建

在项目根目录执行：

```sh
npm ci --no-audit --no-fund
npm run build
python3 scripts/package-theme.py
```

输出主题包为 `release/komari-theme-linen-1.0.0.zip`。压缩包根目录包含 `komari-theme.json`、`preview.svg` 和构建目录 `dist/`。

## 安装到 Komari

在管理员后台打开“主题管理”，上传主题 ZIP，再预览并手动应用 **Linen 暖白**。本次只生成主题包，没有安装或切换线上正在使用的 Zen。

## 兼容性与实现

- 后端版本：Komari 1.6.1；构建基于官方 `komari-web` 的 1.6.1 tag。
- 保留 Komari 文档要求的 `<title>Komari Monitor</title>` 和默认描述模板，支持服务端自定义站点标题/描述及 head/body 注入。
- CSS 使用官方稳定 `km-` 页面钩子；不覆盖后台数据、API、路由或认证逻辑。
- 官方主题文档：<https://komari-document.pages.dev/dev/theme>
