# Linen · 节点运行台

![Linen v2 桌面首页](preview.png)

Linen 2.0 是面向 Komari Monitor 1.6.1 的独立监控主题。首页与节点详情使用新组件和新布局，按“整体状态 → 待关注节点 → 资源清单 → 历史趋势”组织信息。

## 展示

以上及下方图片来自真实浏览器渲染，使用固定的**演示节点与模拟指标**，不含线上机器资料。

### 节点详情

![节点详情：实时资源、历史曲线和硬件资料](docs/preview-detail.png)

<details>
<summary>暗色模式与手机布局</summary>

![暗色首页](docs/preview-dark.png)

<img src="docs/preview-mobile.png" alt="手机节点运行台" width="390" />

</details>

## 功能

- 独立导航、当前在线率、在线节点 CPU/内存汇总与待关注队列。
- 按状态和分组筛选，搜索节点/地区/系统，按资源占用排序，列表/网格视图切换。
- 独立详情页：当前 CPU、内存、磁盘、网速、运行时间、硬件资料。
- CPU、内存、磁盘及上下行历史曲线，支持 1/6/24 小时时段与刷新，缺失样本保留断点。
- 区分首次加载、离线、断连和超过 30 秒的过期采样；无有效样本时显示 —，不把缓存值当当前读数。
- 亮暗模式、可切换强调色、中文/英文与响应式布局。

当前在线率是当前状态快照，并非历史 SLA。待关注项由可见节点与资源阈值计算，不代替 Komari 后台告警。

## 安装与升级

1. [下载 Linen 2.0.0 主题包](release/komari-theme-linen-2.0.0.zip)。请下载 ZIP 文件本身，不要上传 GitHub 的源码压缩包。
2. 登录 Komari 后台，进入“主题管理”，上传或更新 Linen。
3. 对新安装主题选择“设为当前主题”，然后刷新首页。

**升级提示：**主题标识仍为 Linen。若你已经启用了旧版 Linen，更新同名主题文件可能立即改变线上页面。先保留 [1.0.0 主题包](release/komari-theme-linen-1.0.0.zip) 作为回滚副本。主题更新不需要升级 Komari 服务端或 Agent。

### 刷新与回滚

- 更新后刷新首页；若仍看到旧界面，尝试强制刷新。已安装的 PWA 可关闭所有站点窗口后重新打开。
- 回滚时，在“主题管理”中上传先前保留的同名 Linen 主题包。当前主题为 Linen 时，恢复文件后即可使用旧界面。
- 自行从宿主机维护主题目录时，先备份整个旧目录，在同一文件系统中准备并校验新目录，再原子替换；不要直接覆盖运行中的零散资源文件。

## 从源码构建

要求 Node.js 22 或更新版本、npm 和 Python 3。

```sh
npm ci --no-audit --no-fund
npm run build
python3 scripts/package-theme.py
```

输出为 release/komari-theme-linen-2.0.0.zip。主题包只包含根目录清单、PNG 预览及 dist/ 资源；不含源码和 node_modules。完整前端构建占用较多内存，低内存主机请优先下载预构建包。

## 浏览器验证

```sh
npm install --no-save --package-lock=false playwright
npx playwright install --with-deps chromium
# 终端一：仅启动本机预览
npm run dev -- --host 127.0.0.1 --port 4179 --strictPort
# 终端二：拦截 API，使用演示数据验证，不会修改后端
node scripts/qa-linen-browser.mjs
```

测试覆盖筛选、搜索、排序、列表/网格、详情跳转、历史时段、明暗模式、390px/1440px 页面宽度、首载、空清单、断连和过期样本，并生成 docs/ 中的实际截图。

## 实现与兼容

- 独立首页：src/components/linen/LinenDashboard.tsx 与对应 CSS。
- 独立详情：src/components/linen/LinenInstance.tsx 与对应 CSS。
- 基于官方 komari-web 1.6.1 的数据上下文和 RPC2 客户端；首页读取公共节点数据，历史图通过 public:queryMetrics 查询。
- 管理后台与终端仍由 Komari 内置界面提供，主题不绕过管理员认证。
- 保留服务器标题/描述占位符以及自定义 head/body 注入。
- 后台主题设置提供桌面/手机背景、内容宽度与自定义页脚。其他旧版首页专用设置已移除。
- [官方主题文档](https://komari-document.pages.dev/dev/theme) · [上游前端 1.6.1](https://github.com/komari-monitor/komari-web/tree/1.6.1)
