import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.LINEN_QA_URL || "http://127.0.0.1:4179";
const out = resolve(process.env.LINEN_QA_OUTPUT || "docs");
await mkdir(out, { recursive: true });
const GiB = 1024 ** 3;
const identities = [
  ["demo-tokyo", "Tokyo · Edge", "JP", "亚洲", 22],
  ["demo-singapore", "Singapore · Core", "🇸🇬", "亚洲", 91],
  ["demo-frankfurt", "Frankfurt · Relay", "ZZ", "欧洲", 0],
  ["demo-helsinki", "Helsinki · Archive", null, "欧洲", 14],
];
const nodes = Object.fromEntries(
  identities.map(([uuid, name, region, group]) => [
    uuid,
    {
      uuid,
      name,
      region,
      group,
      cpu_name: "AMD EPYC",
      cpu_cores: 4,
      arch: "amd64",
      os: "Debian 13",
      kernel_version: "6.12",
      virtualization: "kvm",
      gpu_name: "None",
      mem_total: 8 * GiB,
      disk_total: 80 * GiB,
      swap_total: 2 * GiB,
      weight: 0,
      tags: "",
      price: 0,
      billing_cycle: 0,
      expired_at: "",
      created_at: "",
      updated_at: "",
    },
  ]),
);
nodes["demo-tokyo"].traffic_limit = 200 * GiB;
nodes["demo-tokyo"].traffic_limit_type = "sum";
nodes["demo-tokyo"].expired_at = new Date(
  Date.now() + 3 * 86400000,
).toISOString();
nodes["demo-singapore"].expired_at = "0001-01-01T00:00:00Z";
nodes["demo-frankfurt"].expired_at = "";
nodes["demo-helsinki"].expired_at = new Date(
  Date.now() - 86400000,
).toISOString();
nodes["demo-tokyo"].expired_at = new Date(
  Date.now() + 3 * 86400000,
).toISOString();
nodes["demo-singapore"].expired_at = "0001-01-01T00:00:00Z";
nodes["demo-frankfurt"].expired_at = "";
nodes["demo-helsinki"].expired_at = new Date(
  Date.now() - 86400000,
).toISOString();
nodes["demo-singapore"].traffic_limit = 10 * GiB;
nodes["demo-singapore"].traffic_limit_type = "up";
nodes["demo-frankfurt"].traffic_limit = 0;
nodes["demo-helsinki"].traffic_limit = 200 * GiB;
nodes["demo-helsinki"].traffic_limit_type = "max";
nodes["demo-tokyo"].expired_at = new Date(
  Date.now() + 3 * 86400000,
).toISOString();
nodes["demo-singapore"].expired_at = "0001-01-01T00:00:00Z";
nodes["demo-frankfurt"].expired_at = "";
nodes["demo-helsinki"].expired_at = new Date(
  Date.now() - 86400000,
).toISOString();
const layoutNodes = Object.fromEntries(
  Object.entries(nodes).map(([uuid, node]) => {
    if (uuid === "demo-tokyo")
      return [
        uuid,
        {
          ...node,
          name: "A deliberately long infrastructure node name that must wrap without widening the card",
          region: "ZZ",
          group: "A deliberately long operations group name",
        },
      ];
    if (uuid === "demo-singapore")
      return [
        uuid,
        {
          ...node,
          name: "🇨🇦 Emoji flag node / long label for responsive card layout",
          region: "🇨🇦",
          group: "",
        },
      ];
    if (uuid === "demo-frankfurt")
      return [
        uuid,
        {
          ...node,
          name: "Frankfurt · disconnected Relay",
          region: null,
          group: "Operations / One",
        },
      ];
    return [
      uuid,
      {
        ...node,
        name: "Helsinki · Archive",
        region: "🇯🇵",
        group: "Operations / Two",
      },
    ];
  }),
);
let tokyoCPUOverride;
const makeLive = () => {
  const sourceNodes = scenario === "layout" ? layoutNodes : nodes;
  const live = Object.fromEntries(
    Object.keys(sourceNodes).map((uuid, i) => {
      const cpu =
        (uuid === "demo-tokyo" ? tokyoCPUOverride : undefined) ??
        identities.find(([id]) => id === uuid)?.[4] ??
        36;
      return [
        uuid,
        {
          client: uuid,
          online: uuid !== "demo-frankfurt",
          cpu:
            scenario === "missing" && uuid === "demo-singapore"
              ? undefined
              : cpu,
          ram: (i === 1 ? 7.3 : 2 + i / 2) * GiB,
          disk: (20 + i * 7) * GiB,
          load: 0.2 + i / 4,
          load5: 0.3,
          load15: 0.2,
          net_in:
            scenario === "missing" && uuid === "demo-singapore"
              ? undefined
              : scenario === "invalid-network"
                ? -1
                : 1540000 + i * 238000,
          net_out:
            scenario === "missing" && uuid === "demo-singapore"
              ? undefined
              : scenario === "invalid-network"
                ? "NaN"
                : 63000 + i * 10000,
          net_total_in:
            scenario === "missing" && uuid === "demo-singapore"
              ? undefined
              : scenario === "invalid-network"
                ? -1
                : 102 * GiB,
          net_total_out:
            scenario === "missing" && uuid === "demo-singapore"
              ? undefined
              : scenario === "invalid-network"
                ? "Infinity"
                : 12 * GiB,
          uptime: 86400 * 12 + 7200,
          connections: 45,
          connections_udp: 8,
          process: 122,
          time: new Date(
            Date.now() - (scenario === "stale" ? 60000 : 0),
          ).toISOString(),
        },
      ];
    }),
  );
  return live;
};
const publicInfo = {
  sitename: "Linen / 示例监控",
  description: "界面演示 · 样例数据",
  private_site: false,
  theme: "Linen",
  theme_settings: {
    mainContentWidth: 100,
    showPrioritySection: true,
    carrierTelecomTaskId: "1",
    carrierUnicomTaskId: "2",
    carrierMobileTaskId: "3",
    carrierTelecomTaskId: "1",
    carrierUnicomTaskId: "2",
    carrierMobileTaskId: "3",
  },
  custom_head: "",
  custom_body: "",
};
let scenario = "normal";
const methodCalls = [];
const resultFor = (req) => {
  methodCalls.push({
    method: req.method,
    hours: req.params?.hours,
    metricKeys: req.params?.metric_keys,
    start: req.params?.start,
    aggregation: req.params?.aggregation,
  });
  if (req.method === "common:getNodes")
    return scenario === "empty"
      ? {}
      : scenario === "layout"
        ? layoutNodes
        : nodes;
  if (req.method === "common:getNodesLatestStatus") return makeLive();
  if (req.method === "public:getPublicPingTasks")
    return [
      { id: 1, name: "上海电信", interval: 60 },
      { id: 2, name: "上海联通", interval: 60 },
      { id: 3, name: "上海移动", interval: 60, weight: -10 },
      { id: 4, name: "上海移动 IPv6", interval: 60 },
      { id: 5, name: "北京移动", interval: 60 },
    ].map((task) => ({ ...task, clients: Object.keys(nodes) }));
  if (
    req.method === "public:queryMetrics" &&
    req.params?.metric_keys?.includes("ping.latency_ms")
  ) {
    const end = Date.now();
    // The latest values preserve the homepage's 25 ms / 0 ms / timeout checks.
    const samples = {
      1: [25],
      2: [0],
      3: [15, 0, null, -1],
      4: [35, 0, null, 27],
      5: [43, 40, 42],
    };
    return {
      start: new Date(end - 24 * 60000).toISOString(),
      end: new Date(end).toISOString(),
      series: (req.params.entity_ids || [req.params.entity_id]).flatMap((id) =>
        Object.entries(samples).map(([taskId, values]) => ({
          entity_id: id,
          metric_key: "ping.latency_ms",
          tags: { task_id: taskId },
          interval_seconds: 60,
          points: values.map((value, index) => ({
            time: new Date(
              end - 30000 - (values.length - index - 1) * 60000,
            ).toISOString(),
            value,
          })),
        })),
      ),
    };
  }
  if (req.method.includes("Version")) return { version: "1.6.1", hash: "demo" };
  if (
    req.method === "public:queryMetrics" &&
    req.params?.metric_keys?.includes("traffic.up")
  ) {
    const start = Date.parse(req.params.start),
      ids = req.params.entity_ids || Object.keys(nodes);
    return {
      start: req.params.start,
      end: req.params.end,
      count: 2,
      series:
        scenario === "daily-empty"
          ? []
          : ids.flatMap((id) =>
              ["traffic.up", "traffic.down"].map((key) => ({
                entity_id: id,
                metric_key: key,
                interval_seconds: 60,
                count: 2,
                points: [0, 1].map((minute) => ({
                  time: new Date(start + minute * 60000).toISOString(),
                  value:
                    key === "traffic.up"
                      ? (minute ? 256 : 512) * 1024
                      : 1024 * 1024,
                  count: 100,
                })),
              })),
            ),
    };
  }
  if (req.method === "public:queryMetrics") {
    const end = Date.now(),
      start = end - (req.params.hours || 1) * 3600000;
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      count: 61,
      series: (req.params.metric_keys || []).map((key, j) => ({
        entity_id: req.params.entity_id,
        metric_key: key,
        interval_seconds: 60,
        count: 61,
        points: Array.from({ length: 61 }, (_, i) => ({
          time: new Date(start + ((end - start) * i) / 60).toISOString(),
          value:
            scenario === "sparse" && ![0, 30, 60].includes(i)
              ? null
              : i > 24 && i < 29
                ? null
                : key === "cpu.usage"
                  ? 22 + Math.sin(i / 5) * 8
                  : key === "memory.used"
                    ? (3 + Math.sin(i / 9) * 0.2) * GiB
                    : key === "disk.used"
                      ? 25 * GiB
                      : 300000 + Math.sin(i / 3 + j) * 100000,
        })),
      })),
    };
  }
  return [];
};
const respond = (req) =>
  scenario === "daily-error" &&
  req.method === "public:queryMetrics" &&
  req.params?.metric_keys?.includes("traffic.up")
    ? {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: "Daily statistics unavailable" },
      }
    : scenario === "permission-denied" && req.method === "common:getNodes"
      ? {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: 403, message: "Access denied" },
        }
      : scenario === "list-failure" && req.method === "common:getNodes"
        ? {
            jsonrpc: "2.0",
            id: req.id,
            error: {
              code: -32000,
              message: "Simulated node-list refresh failure",
            },
          }
        : scenario === "disconnected" &&
            req.method === "common:getNodesLatestStatus"
          ? {
              jsonrpc: "2.0",
              id: req.id,
              error: {
                code: -32000,
                message: "Simulated telemetry disconnect",
              },
            }
          : {
              jsonrpc: "2.0",
              id: req.id,
              result: resultFor(req),
            };
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const report = [];
try {
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem("appearance"))
      localStorage.setItem("appearance", JSON.stringify("light"));
    localStorage.setItem("language", "zh-CN");
    localStorage.setItem("i18nextLng", "zh-CN");
    localStorage.setItem("color", JSON.stringify("grass"));
  });
  await context.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/public")
      return route.fulfill({ json: { status: "success", data: publicInfo } });
    if (p === "/api/me") return route.fulfill({ json: { logged_in: false } });
    if (p === "/api/rpc2") {
      const req = route.request().postDataJSON();
      if (
        scenario === "pending" &&
        req?.method === "common:getNodesLatestStatus"
      )
        return;
      return route.fulfill({
        json: Array.isArray(req) ? req.map(respond) : respond(req),
      });
    }
    if (p.startsWith("/api/admin"))
      throw Error("Public theme requested privileged API: " + p);
    return route.fulfill({ json: { status: "success", data: [] } });
  });
  await context.routeWebSocket("**/api/rpc2", (ws) => {
    ws.onMessage((message) => {
      const req = JSON.parse(String(message));
      if (
        scenario === "pending" &&
        req.method === "common:getNodesLatestStatus"
      )
        return;
      ws.send(
        JSON.stringify(Array.isArray(req) ? req.map(respond) : respond(req)),
      );
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const waitFrame = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const checkWidth = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await waitFrame();
    const box = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(box.scrollWidth <= width + 2, JSON.stringify(box));
    return box;
  };
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".lc-node").nth(3).waitFor();
  assert.equal(await page.locator(".lc-node").count(), 4);
  assert.equal(await page.locator(".lc-resource").count(), 16);
  assert.match(
    await page.locator('[data-node="demo-tokyo"] .lc-quota').innerText(),
    /57.0%/,
  );
  assert.equal(
    await page.locator('[data-node="demo-frankfurt"] .lc-quota').count(),
    1,
  );
  assert.match(
    await page.locator('[data-node="demo-tokyo"] .lc-billing').innerText(),
    /剩余/,
  );
  assert.equal(
    await page.locator('[data-node="demo-singapore"] .lc-billing').count(),
    1,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-node="demo-tokyo"] .lc-carriers')
      ?.textContent.includes("25 ms"),
  );
  assert.match(
    await page.locator('[data-node="demo-tokyo"] .lc-carriers').innerText(),
    /25 ms/,
  );
  await page.getByRole("button", { name: /离线/ }).click();
  assert.equal(await page.locator(".lc-node").count(), 1);
  assert.equal(
    await page.locator(".lc-node").getAttribute("data-status"),
    "offline",
  );
  assert.ok(
    (await page.locator(".lc-resource strong").allTextContents()).every(
      (v) => v === "—",
    ),
  );
  await page.getByRole("button", { name: /待关注/ }).click();
  assert.equal(await page.locator(".lc-node").count(), 1);
  assert.match(await page.locator(".lc-node-name").innerText(), /Singapore/);
  await page.getByRole("button", { name: /全部/ }).click();
  await page.getByRole("searchbox").fill("Helsinki");
  assert.equal(await page.locator(".lc-node").count(), 1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByLabel("分组", { exact: true }).selectOption("欧洲");
  assert.equal(await page.locator(".lc-node").count(), 2);
  await page.getByLabel("分组", { exact: true }).selectOption("all");
  await page.getByLabel("排序", { exact: true }).selectOption("cpu");
  assert.match(
    await page.locator(".lc-node-name").first().innerText(),
    /Singapore/,
  );
  await page.getByLabel("排序", { exact: true }).selectOption("default");
  assert.match(
    await page.locator('[data-node="demo-frankfurt"] .lc-quota').innerText(),
    /∞ 无限额/,
  );
  assert.equal(
    await page
      .locator('[data-node="demo-frankfurt"] .lc-quota [role=progressbar]')
      .count(),
    0,
  );
  assert.equal(
    await page
      .locator('[data-node="demo-frankfurt"] .is-unlimited .is-filled')
      .count(),
    24,
  );
  for (const key of [
    "carrierTelecomTaskId",
    "carrierUnicomTaskId",
    "carrierMobileTaskId",
  ])
    publicInfo.theme_settings[key] = "";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".lc-carriers strong").length === 12 &&
      [...document.querySelectorAll(".lc-carriers strong")].every(
        (e) => e.textContent === "未配置",
      ),
  );
  publicInfo.theme_settings.carrierTelecomTaskId = "5";
  publicInfo.theme_settings.carrierUnicomTaskId = "2";
  publicInfo.theme_settings.carrierMobileTaskId = "3";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-node="demo-tokyo"] .lc-carriers')
      ?.textContent.includes("42 ms"),
  );
  publicInfo.theme_settings.carrierTelecomTaskId = "999";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .locator('[data-node="demo-tokyo"] .lc-carriers strong')
      .first()
      .innerText(),
    "未配置",
  );
  publicInfo.theme_settings.carrierTelecomTaskId = "1";
  await page.reload({ waitUntil: "networkidle" });
  report.push(
    "manual backend task IDs respected even with different carrier names; blank/invalid never auto-select; unlimited full bar",
  );
  for (const mode of ["卡片视图", "列表视图"]) {
    await page.getByRole("button", { name: mode, exact: true }).tap();
    for (const w of [320, 360, 390, 520, 768, 1024, 1440]) {
      await checkWidth(w);
      const heights = await page
        .locator(".lc-fleet .lc-node")
        .evaluateAll((items) =>
          items.map((e) => e.getBoundingClientRect().height),
        );
      assert.ok(
        Math.max(...heights) - Math.min(...heights) <= 1,
        JSON.stringify({ w, mode, heights }),
      );
      const overflow = await page
        .locator(
          ".lc-node-head,.lc-node-meta,.lc-network,.lc-quota,.lc-usage,.lc-carriers",
        )
        .evaluateAll((items) =>
          items
            .filter(
              (e) =>
                e.scrollHeight > e.clientHeight + 2 ||
                e.scrollWidth > e.clientWidth + 2,
            )
            .map((e) => e.className),
        );
      assert.deepEqual(overflow, [], JSON.stringify({ w, mode, overflow }));
    }
  }
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("button", { name: "列表视图", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "卡片视图", exact: true }).tap();
  await checkWidth(1440);
  await page.screenshot({ path: out + "/preview-desktop.png", fullPage: true });
  await checkWidth(390);
  await page.screenshot({
    path: out + "/preview-mobile-card.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "列表视图", exact: true }).tap();
  await page.screenshot({ path: out + "/preview-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "切换明暗" }).tap();
  await page.waitForSelector("html.dark");
  await checkWidth(1440);
  await page.screenshot({ path: out + "/preview-dark.png", fullPage: true });
  await page.getByRole("button", { name: "切换明暗" }).tap();
  report.push(
    "shared design in grid/list/dark; 320–1440px no horizontal overflow; touch view switch remembered",
  );
  const keys = [
    "showNodeRegion",
    "showNodeGroup",
    "showNodeOs",
    "showNodeCpu",
    "showNodeMemory",
    "showNodeDisk",
    "showNodeLoad",
    "showNodeNetwork",
    "showNodeTrafficProgress",
    "showNodeTrafficTotal",
    "showNodeTrafficToday",
    "showNodeExpiry",
    "showCarrierLatency",
  ];
  for (const key of keys) publicInfo.theme_settings[key] = false;
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".lc-node").count(), 4);
  assert.equal(
    await page
      .locator(
        ".lc-resources,.lc-quota,.lc-carriers,.lc-usage,.lc-flag,.lc-node-meta,.lc-rates",
      )
      .count(),
    0,
  );
  await checkWidth(320);
  for (const key of keys) delete publicInfo.theme_settings[key];
  await page.goto(base + "/instance/demo-tokyo", { waitUntil: "networkidle" });
  await page.locator(".lc-chart .recharts-wrapper").first().waitFor();
  assert.equal(await page.locator(".lc-chart").count(), 3);
  assert.equal(await page.locator(".lc-node-detail").count(), 1);
  assert.equal(await page.locator("h1").innerText(), "Tokyo · Edge");
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".lc-chart .recharts-wrapper").length === 3,
  );
  assert.ok(methodCalls.some((c) => c.hours === 6));
  await page.getByRole("button", { name: "节点菜单", exact: true }).click();
  await page.getByRole("link", { name: "历史趋势", exact: true }).click();
  assert.match(page.url(), /#lc-history$/);
  const startCalls = methodCalls.filter(
    (c) => c.method === "common:getNodesLatestStatus",
  ).length;
  await page.getByRole("button", { name: "刷新节点", exact: true }).click();
  assert.ok(
    methodCalls.filter((c) => c.method === "common:getNodesLatestStatus")
      .length > startCalls,
  );
  for (const w of [320, 390, 520, 768, 1440]) await checkWidth(w);
  await page
    .getByRole("combobox", { name: "运营商", exact: true })
    .selectOption("mobile");
  await page.getByRole("combobox", { name: "探测地区" }).selectOption("上海");
  assert.equal(await page.locator(".lc-route-row").count(), 2);
  assert.equal(await page.locator(".lc-lights i").count(), 48);
  assert.ok(
    await page.getByRole("button", { name: "测速", exact: true }).isDisabled(),
  );
  await page.setViewportSize({ width: 520, height: 1100 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: out + "/preview-detail.png", fullPage: true });
  report.push(
    "same node card on detail; 3 history charts and 6h query; menu/refresh; route samples and explicit missing speed tests",
  );
  scenario = "layout";
  publicInfo.sitename = "A very long public monitoring site name ".repeat(5);
  await page.goto(base, { waitUntil: "networkidle" });
  for (const w of [320, 390, 768, 1440]) await checkWidth(w);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByLabel("分组", { exact: true }).selectOption("");
  assert.equal(await page.locator(".lc-node").count(), 1);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  assert.equal(
    await page.getByLabel("Group", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.locator(".lc-node").count(), 1);
  await page.getByRole("button", { name: "中", exact: true }).click();
  await page.getByLabel("分组", { exact: true }).selectOption("all");
  publicInfo.sitename = "Linen / 示例监控";
  scenario = "missing";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .locator('[data-node="demo-singapore"] .lc-resource strong')
      .first()
      .innerText(),
    "—",
  );
  assert.doesNotMatch(
    await page.locator(".lc-fleet").innerText(),
    /NaN|Infinity/,
  );
  scenario = "daily-error";
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("统计更新失败", { exact: true }).first().waitFor();
  assert.equal(await page.locator(".lc-usage").count(), 4);
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  scenario = "list-failure";
  await page.getByRole("button", { name: "刷新读数", exact: true }).click();
  assert.equal(await page.locator(".lc-node").count(), 4);
  scenario = "permission-denied";
  await page.getByRole("button", { name: "刷新读数", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".lc-node").length === 0,
  );
  report.push(
    "long names/unknown flags; ungrouped filter survives language changes; missing counters; failed daily refresh; transient and permission failures",
  );
  scenario = "stale";
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".lc-node[data-status=stale]").count(), 3);
  assert.ok(
    (await page.locator(".lc-resource strong").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  scenario = "disconnected";
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".lc-node[data-status=disconnected]").length ===
      4,
  );
  assert.ok(
    (await page.locator(".lc-resource strong").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  report.push(
    "stale and disconnected snapshots never masquerade as current readings",
  );
  scenario = "empty";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".lc-node").count(), 0);
  assert.match(await page.locator(".lc-empty").innerText(), /没有符合/);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks: report,
        runtimeErrors: errors,
        screenshots: out,
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
