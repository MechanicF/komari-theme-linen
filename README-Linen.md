# Linen 暖白主题

基于 Komari Monitor 1.6.1 的 Linen v2.2 独立节点运行台。首页重新组织为可用率总览、待关注队列和可筛选的节点资源清单；保留 Komari 实时节点数据、详情路由、登录和设置入口。

## 本地构建

在项目根目录执行：

```sh
npm ci --no-audit --no-fund
npm run build
python3 scripts/package-theme.py
```

输出主题包为 `release/komari-theme-linen-2.2.0.zip`。压缩包根目录包含 `komari-theme.json`、`preview.png` 和构建目录 `dist/`。

## 安装到 Komari

在管理员后台打开“主题管理”，上传主题 ZIP，再预览并应用 **Linen 暖白**。升级已启用的同名主题可能立即改变线上页面，请先保留旧主题包并确认预览效果。

## 兼容性与实现

- 后端版本：Komari 1.6.1；构建基于官方 `komari-web` 的 1.6.1 tag。
- 保留 Komari 文档要求的 `<title>Komari Monitor</title>` 和默认描述模板，支持服务端自定义站点标题/描述及 head/body 注入。
- 首页为独立节点运行台：重新设计全局导航、运行总览、待关注队列及可筛选的节点库存；通过 Komari 1.6.1 公共节点/RPC2 实时上下文取值，不访问管理员 API。
- 官方主题文档：<https://komari-document.pages.dev/dev/theme>
