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
nodes["demo-singapore"].traffic_limit = 10 * GiB;
nodes["demo-singapore"].traffic_limit_type = "up";
nodes["demo-frankfurt"].traffic_limit = 0;
nodes["demo-helsinki"].traffic_limit = 200 * GiB;
nodes["demo-helsinki"].traffic_limit_type = "max";
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
const makeLive = () => {
  const sourceNodes = scenario === "layout" ? layoutNodes : nodes;
  const live = Object.fromEntries(
    Object.keys(sourceNodes).map((uuid, i) => {
      const cpu = identities.find(([id]) => id === uuid)?.[4] ?? 36;
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
  theme_settings: { mainContentWidth: 100, showPrioritySection: true },
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
  await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator(".linen-node-row").nth(3).waitFor();
  assert.equal(await page.locator(".linen-node-row").count(), 4);
  assert.match(await page.locator(".linen-health-ring").innerText(), /75/);
  assert.equal(await page.locator(".linen-attention").count(), 1);
  assert.equal(
    await page
      .locator(".linen-network-overview article.linen-network-stat")
      .count(),
    3,
  );
  assert.equal(
    await page.locator('[data-metric="speed-down"]').innerText(),
    "5.31 MB/s",
  );
  assert.equal(
    await page.locator('[data-metric="speed-up"]').innerText(),
    "223.6 KB/s",
  );
  assert.equal(
    await page.locator('[data-metric="total-down"]').innerText(),
    "408.00 GB",
  );
  assert.equal(
    await page.locator('[data-metric="total-up"]').innerText(),
    "48.00 GB",
  );
  assert.equal(
    await page.locator('[data-metric="total-transfer"]').innerText(),
    "456.00 GB",
  );
  assert.match(
    await page
      .locator("[data-network=live] .linen-network-stat__note")
      .innerText(),
    /3\/4/,
  );
  assert.match(
    await page
      .locator("[data-network=counters] .linen-network-stat__note")
      .innerText(),
    /含离线节点最后上报值/,
  );
  report.push(
    "3 network stats: fresh online rates, offline last-reported counters, total transfer",
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-node-traffic="today"] strong')
        ?.textContent === "2.75 MB",
  );
  const tokyo = page.locator(".linen-node-row", { hasText: "Tokyo" });
  const singapore = page.locator(".linen-node-row", { hasText: "Singapore" });
  const frankfurt = page.locator(".linen-node-row", { hasText: "Frankfurt" });
  assert.equal(
    await tokyo
      .locator('[data-node-traffic="quota"] [role="progressbar"]')
      .getAttribute("aria-valuenow"),
    "57",
  );
  assert.match(
    await singapore.locator('[data-node-traffic="quota"]').innerText(),
    /120.0%/,
  );
  assert.equal(
    await singapore
      .locator('[role="progressbar"]')
      .getAttribute("aria-valuenow"),
    "100",
  );
  assert.equal(await frankfurt.locator('[role="progressbar"]').count(), 0);
  assert.equal(
    await frankfurt.locator('[data-node-traffic="quota"]').count(),
    0,
  );
  assert.equal(
    await frankfurt.locator('[data-node-traffic="cumulative"]').count(),
    1,
  );
  assert.equal(
    await frankfurt.locator('[data-node-traffic="today"]').count(),
    1,
  );
  assert.equal(
    await tokyo.locator('[data-node-traffic="cumulative"]>strong').innerText(),
    "114.00 GB",
  );
  assert.ok(
    methodCalls.some(
      (call) =>
        call.metricKeys?.includes("traffic.up") &&
        call.aggregation === "sum" &&
        new Date(call.start).getUTCHours() === 16,
    ),
  );
  publicInfo.theme_settings.trafficDayTimezone = "UTC";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-node-traffic="today"]')
      ?.textContent.includes("(UTC)"),
  );
  assert.equal(
    new Date(
      methodCalls.filter((c) => c.metricKeys?.includes("traffic.up")).at(-1)
        .start,
    ).getUTCHours(),
    0,
  );
  delete publicInfo.theme_settings.trafficDayTimezone;
  scenario = "daily-empty";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .locator('[data-node-traffic="today"]>strong')
      .first()
      .innerText(),
    "—",
  );
  scenario = "daily-error";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-node-traffic="today"]')
      ?.textContent.includes("暂无法获取"),
  );
  assert.equal(
    await page
      .locator('[data-node-traffic="today"]>strong')
      .first()
      .innerText(),
    "—",
  );
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-node-traffic="today"] strong')
        ?.textContent === "2.75 MB",
  );
  report.push(
    "node quota sum/up/max, no-limit and overage; cumulative bytes; UTC+8/UTC daily stored increments; empty/error not zero",
  );
  await page.getByRole("button", { name: /^离线/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  assert.match(await page.locator(".linen-node-row").innerText(), /Frankfurt/);
  const offlineMeters = await page
    .locator(".linen-node-row .linen-metric__value")
    .allTextContents();
  assert.deepEqual(offlineMeters, ["—", "—", "—"]);
  await page.getByRole("button", { name: /^待关注/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  assert.match(await page.locator(".linen-node-row").innerText(), /Singapore/);
  assert.doesNotMatch(
    await page.locator(".linen-attention").innerText(),
    /Frankfurt/,
  );
  await page.getByRole("button", { name: /^全部节点/ }).click();
  await page.getByRole("searchbox").fill("Helsinki");
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.locator(".linen-group-tabs button", { hasText: "亚洲" }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 2);
  await page
    .locator(".linen-group-tabs button", { hasText: "全部分组" })
    .click();
  await page.getByRole("combobox").selectOption("cpu");
  assert.match(
    await page.locator(".linen-node-row").first().innerText(),
    /Singapore/,
  );
  await page.getByRole("combobox").selectOption("priority");
  await page.getByRole("button", { name: "卡片视图", exact: true }).click();
  assert.equal(await page.locator(".linen-node-list.is-grid").count(), 1);
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  publicInfo.theme_settings.showPrioritySection = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".linen-node-row").nth(3).waitFor();
  assert.equal(await page.locator(".linen-attention").count(), 0);
  assert.equal(await page.locator(".linen-workspace.is-fullwidth").count(), 1);
  await page.getByRole("button", { name: /^离线/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.getByRole("button", { name: /^全部节点/ }).click();
  publicInfo.theme_settings.showPrioritySection = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".linen-node-row").nth(3).waitFor();
  assert.equal(await page.locator(".linen-attention").count(), 1);
  assert.equal(await page.locator(".linen-workspace.is-fullwidth").count(), 0);
  // Card visibility is independent from status classification and must reflow.
  const cardKeys = [
    "showOverviewOnline",
    "showOverviewCpu",
    "showOverviewMemory",
    "showOverviewAttention",
    "showNetworkBandwidth",
    "showNetworkCounters",
    "showNetworkTotal",
    "showNodeRegion",
    "showNodeGroup",
    "showNodeOs",
    "showNodeCpu",
    "showNodeMemory",
    "showNodeDisk",
    "showNodeNetwork",
    "showNodeUptime",
    "showNodeLoad",
    "showNodeTrafficProgress",
    "showNodeTrafficTotal",
    "showNodeTrafficToday",
  ];
  Object.assign(
    publicInfo.theme_settings,
    Object.fromEntries(cardKeys.map((key) => [key, false])),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".linen-node-row");
  assert.equal(
    await page.locator(".linen-overview, .linen-network-overview").count(),
    0,
  );
  assert.equal(
    await page
      .locator(
        ".linen-node-row__metrics, .linen-node-row__traffic, .linen-node-avatar, .linen-node-meta, .linen-node-row__footer > span, .linen-node-traffic",
      )
      .count(),
    0,
  );
  assert.equal(await page.locator(".linen-node-title").count(), 4);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
      "hidden card fields must not overflow at " + width,
    );
  }
  await page.getByRole("button", { name: /^待关注/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  assert.match(await page.locator(".linen-node-row").innerText(), /Singapore/);
  await page.getByRole("button", { name: /^全部节点/ }).click();
  publicInfo.theme_settings.showOverviewCpu = true;
  publicInfo.theme_settings.showNetworkTotal = true;
  publicInfo.theme_settings.showNodeCpu = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".linen-node-row");
  assert.equal(await page.locator(".linen-overview article").count(), 1);
  assert.equal(
    await page.locator(".linen-network-overview article").count(),
    1,
  );
  assert.equal(
    await page.locator(".linen-node-row__metrics .linen-metric__value").count(),
    4,
  );
  assert.equal(
    await page.locator(".linen-node-meta, .linen-node-avatar").count(),
    0,
  );
  for (const key of cardKeys) delete publicInfo.theme_settings[key];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".linen-node-row");
  assert.equal(await page.locator(".linen-overview article").count(), 4);
  assert.equal(
    await page.locator(".linen-network-overview article").count(),
    3,
  );
  assert.equal(
    await page.locator(".linen-node-row__metrics .linen-metric__value").count(),
    12,
  );

  report.push(
    "19 card content toggles: all hidden, CPU-only and defaults; offline excluded from attention",
  );
  scenario = "list-failure";
  await page.locator(".linen-refresh").click();
  await page.locator(".linen-error").waitFor();
  assert.equal(await page.locator(".linen-node-row").count(), 4);
  scenario = "permission-denied";
  await page.locator(".linen-refresh").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".linen-node-row").length === 0,
  );
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".linen-node-row").count(), 4);
  report.push(
    "permission denial clears cached inventory; transient failures retain it",
  );
  scenario = "missing";
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".linen-node-row").nth(3).waitFor();
  const missingSingapore = page.locator(".linen-node-row", {
    hasText: "Singapore",
  });
  assert.equal(
    (
      await missingSingapore.locator(".linen-metric__value").allTextContents()
    )[0],
    "—",
  );
  assert.match(
    await page
      .locator("[data-network=live] .linen-network-stat__note")
      .innerText(),
    /2\/4/,
  );
  assert.doesNotMatch(
    await page.locator(".linen-network-overview").innerText(),
    /NaN|Infinity/,
  );
  assert.doesNotMatch(
    await page.locator("[data-network=counters]").innerText(),
    /NaN|Infinity/,
  );
  scenario = "invalid-network";
  await page.reload({ waitUntil: "networkidle" });
  const invalidNetwork = await page
    .locator(".linen-network-overview [data-metric]")
    .allTextContents();
  assert.ok(
    invalidNetwork.every((value) => value === "—"),
    invalidNetwork.join(" | "),
  );
  assert.doesNotMatch(
    await page.locator(".linen-network-overview").innerText(),
    /NaN|Infinity/,
  );
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  report.push(
    "missing CPU/network fields and negative/non-finite network values render —, never NaN/Infinity",
  );
  report.push(
    "priority section true/false and full-width workspace; filters and stale inventory on failed refresh",
  );
  report.push(
    "status, group, search, CPU sort, list/grid, offline missing readings",
  );
  const metrics = async () => {
    await page.waitForTimeout(50);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflows: [...document.querySelectorAll("main,article,nav,section")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
        .map((e) => e.className)
        .slice(0, 12),
    }));
  };
  const avatarOverflows = async (selector) =>
    page.locator(selector + " img").evaluateAll((images) =>
      images.flatMap((image) => {
        const avatar = image.parentElement;
        if (!avatar) return ["missing avatar parent"];
        const imageRect = image.getBoundingClientRect();
        const avatarRect = avatar.getBoundingClientRect();
        return imageRect.left < avatarRect.left - 1 ||
          imageRect.right > avatarRect.right + 1 ||
          imageRect.top < avatarRect.top - 1 ||
          imageRect.bottom > avatarRect.bottom + 1
          ? [{ image: imageRect.toJSON(), avatar: avatarRect.toJSON() }]
          : [];
      }),
    );
  scenario = "layout";
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".linen-node-row").count(), 4);
  assert.match(
    (await page.locator(".linen-node-row").allTextContents()).join(" "),
    /deliberately long/,
  );
  assert.ok(
    (await page.locator('.linen-node-avatar img[src*="/UN.svg"]').count()) >= 1,
  );
  assert.ok(
    (await page.locator('.linen-node-avatar img[src*="/CA.svg"]').count()) >= 1,
  );
  await page
    .locator(".linen-group-tabs button", {
      hasText: "A deliberately long operations group name",
    })
    .click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.locator(".km-theme-switch").click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.locator(".km-color-switch").click();
  await page.getByRole("menuitem", { name: "蓝色", exact: true }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.locator(".km-theme-switch").click();
  await page.getByRole("menuitem", { name: "浅色" }).click();
  await page.locator(".km-color-switch").click();
  await page.getByRole("menuitem", { name: "草绿色" }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page
    .locator(".linen-group-tabs button", { hasText: "全部分组" })
    .click();
  await page.locator(".linen-group-tabs button", { hasText: "未分组" }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  await page.locator(".km-language-switch").click();
  await page.getByRole("menuitem", { name: /English/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  assert.equal(
    await page.locator(".linen-group-tabs .is-active").innerText(),
    "Ungrouped",
  );
  await page.locator(".km-language-switch").click();
  await page.getByRole("menuitem").filter({ hasText: "中文" }).first().click();
  await page
    .locator(".linen-group-tabs button", { hasText: "全部分组" })
    .click();
  publicInfo.sitename = "Long monitoring site name / ".repeat(7);
  await page.locator(".linen-refresh").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".linen-nav__brand-copy strong")
      ?.textContent?.startsWith("Long monitoring"),
  );
  report.push(
    "ungrouped filter survives English switch; long site/group/node names",
  );
  const widths = [320, 360, 390, 768, 1024, 1440];
  for (const mode of ["列表视图", "卡片视图"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await metrics();
      const trafficVisible = await page
        .locator(".linen-node-row__traffic")
        .evaluateAll((items) =>
          items.every(
            (item) =>
              getComputedStyle(item).display !== "none" &&
              item.getBoundingClientRect().width > 0,
          ),
        );
      assert.ok(
        trafficVisible,
        "node transfer rates hidden at " + width + "px / " + mode,
      );
      assert.ok(layout.scrollWidth <= width + 2, JSON.stringify(layout));
      assert.ok(
        await page.locator(".linen-network-overview").isVisible(),
        `network overview hidden at ${width}px / ${mode}`,
      );
      assert.equal(
        (await avatarOverflows(".linen-node-avatar")).length,
        0,
        `node flag overflows at ${width}px / ${mode}`,
      );
    }
  }
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  scenario = "normal";
  publicInfo.sitename = "Linen / 示例监控";
  await page.reload({ waitUntil: "networkidle" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await metrics();
  assert.ok(desktop.scrollWidth <= desktop.width + 2, JSON.stringify(desktop));
  await page.screenshot({ path: out + "/preview-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await metrics();
  assert.ok(mobile.scrollWidth <= mobile.width + 2, JSON.stringify(mobile));
  assert.ok(await page.locator(".linen-nav__admin").isVisible());
  const mobileViewStyle = () =>
    page
      .locator(".linen-node-row")
      .first()
      .evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          height: el.getBoundingClientRect().height,
          padding: c.padding,
          radius: c.borderRadius,
          grid: !!el.closest(".is-grid"),
          detailsVisible: [
            ...el.querySelectorAll(".linen-metric__detail"),
          ].some((e) => getComputedStyle(e).display !== "none"),
        };
      });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "列表视图", exact: true }).tap();
    await metrics();
    const compact = await mobileViewStyle();
    await page.getByRole("button", { name: "卡片视图", exact: true }).tap();
    await metrics();
    const cards = await mobileViewStyle();
    assert.equal(compact.grid, false);
    assert.equal(cards.grid, true);
    assert.equal(compact.detailsVisible, false);
    assert.equal(cards.detailsVisible, true);
    assert.ok(
      cards.height > compact.height + 15,
      JSON.stringify({ width, compact, cards }),
    );
    assert.notEqual(compact.padding, cards.padding);
    assert.notEqual(compact.radius, cards.radius);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: out + "/preview-mobile-card.png",
    fullPage: true,
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("button", { name: "卡片视图", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator(".linen-node-list.is-grid").count(), 1);
  await page.getByRole("button", { name: "列表视图", exact: true }).tap();
  await metrics();
  assert.equal(await page.locator(".linen-node-list.is-grid").count(), 0);
  report.push(
    "phone touch toggles visibly compact list/detailed cards at 320/390/430px; grid persists after reload",
  );
  await page.screenshot({ path: out + "/preview-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() =>
    localStorage.setItem("appearance", JSON.stringify("dark")),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("html.dark");
  await page.screenshot({ path: out + "/preview-dark.png", fullPage: true });
  report.push("desktop/mobile fit; mobile login visible; dark mode");
  scenario = "normal";
  publicInfo.sitename = "Linen / 示例监控";
  await page.evaluate(() =>
    localStorage.setItem("appearance", JSON.stringify("light")),
  );
  await page.goto(base + "/instance/demo-tokyo", { waitUntil: "networkidle" });
  await page.locator(".linen-instance-chart__plot").first().waitFor();
  assert.equal(await page.locator(".linen-instance-chart__plot").count(), 4);
  assert.match(await page.locator("h1").innerText(), /Tokyo/);
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".linen-instance-chart__plot").length === 4,
  );
  assert.ok(
    methodCalls.some(
      (c) => c.method === "public:queryMetrics" && c.hours === 6,
    ),
  );
  const detail = await metrics();
  assert.ok(detail.scrollWidth <= detail.width + 2, JSON.stringify(detail));
  await page.screenshot({ path: out + "/preview-detail.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const detailMobile = await metrics();
  assert.ok(
    detailMobile.scrollWidth <= detailMobile.width + 2,
    JSON.stringify(detailMobile),
  );
  assert.equal(
    (await avatarOverflows(".linen-instance-avatar")).length,
    0,
    "instance flag overflows at 390px",
  );
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const detailLayout = await metrics();
    assert.ok(
      detailLayout.scrollWidth <= width + 2,
      JSON.stringify(detailLayout),
    );
    assert.equal(
      (await avatarOverflows(".linen-instance-avatar")).length,
      0,
      "instance flag overflows",
    );
  }
  report.push(
    "independent detail route; four historical charts; 6h selector; mobile fit; instance avatar bounds",
  );
  await page.goto(base + "/instance/demo-frankfurt", {
    waitUntil: "networkidle",
  });
  assert.match(
    await page.locator(".linen-instance-status").innerText(),
    /离线/,
  );
  assert.equal(
    await page.locator('.linen-instance-avatar img[src*="/UN.svg"]').count(),
    1,
  );
  assert.equal(
    await page.locator(".linen-instance-stat>strong").first().innerText(),
    "—",
  );
  scenario = "sparse";
  await page.goto(base + "/instance/demo-tokyo", { waitUntil: "networkidle" });
  await page.locator(".linen-instance-chart__plot").first().waitFor();
  assert.equal(
    await page
      .locator(".linen-instance-chart__plot")
      .first()
      .locator("circle.recharts-line-dot")
      .count(),
    3,
  );
  report.push(
    "three isolated history samples remain visible as dots with gaps",
  );
  scenario = "stale";
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".linen-status-pill.is-pending").length === 3,
  );
  assert.match(await page.locator(".linen-health-ring").innerText(), /—/);
  assert.ok(
    (await page.locator(".linen-metric__value").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  scenario = "normal";
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".linen-status-pill.is-online").length === 3,
  );
  scenario = "disconnected";
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".linen-status-pill.is-pending").length === 4,
    { timeout: 15000 },
  );
  assert.match(await page.locator(".linen-health-ring").innerText(), /—/);
  assert.ok(
    (await page.locator(".linen-metric__value").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  report.push(
    "stale timestamps and failed live refresh invalidate cached current readings",
  );
  scenario = "pending";
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.querySelector(".linen-health-ring")?.innerText.includes("—"),
  );
  assert.equal(await page.locator(".linen-concern").count(), 0);
  report.push("first-sample pending is not reported as offline or healthy");
  scenario = "empty";
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".linen-list-state").waitFor();
  assert.equal(await page.locator(".linen-node-row").count(), 0);
  report.push("empty inventory handled");
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks: report,
        desktop,
        mobile,
        detail,
        detailMobile,
        errors,
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
