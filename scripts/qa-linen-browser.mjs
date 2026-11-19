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
  ["demo-singapore", "Singapore · Core", "SG", "亚洲", 91],
  ["demo-frankfurt", "Frankfurt · Relay", "DE", "欧洲", 0],
  ["demo-helsinki", "Helsinki · Archive", "FI", "欧洲", 14],
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
const makeLive = () =>
  Object.fromEntries(
    identities.map(([uuid, , , , cpu], i) => [
      uuid,
      {
        client: uuid,
        online: i !== 2,
        cpu,
        ram: (i === 1 ? 7.3 : 2 + i / 2) * GiB,
        disk: (20 + i * 7) * GiB,
        load: 0.2 + i / 4,
        load5: 0.3,
        load15: 0.2,
        net_in: 1540000 + i * 238000,
        net_out: 63000 + i * 10000,
        net_total_in: 102 * GiB,
        net_total_out: 12 * GiB,
        uptime: 86400 * 12 + 7200,
        connections: 45,
        connections_udp: 8,
        process: 122,
        time: new Date(
          Date.now() - (scenario === "stale" ? 60000 : 0),
        ).toISOString(),
      },
    ]),
  );
const publicInfo = {
  sitename: "Linen / 示例监控",
  description: "界面演示 · 样例数据",
  private_site: false,
  theme: "Linen",
  theme_settings: { mainContentWidth: 100 },
  custom_head: "",
  custom_body: "",
};
let scenario = "normal";
const methodCalls = [];
const resultFor = (req) => {
  methodCalls.push({ method: req.method, hours: req.params?.hours });
  if (req.method === "common:getNodes")
    return scenario === "empty" ? {} : nodes;
  if (req.method === "common:getNodesLatestStatus") return makeLive();
  if (req.method.includes("Version")) return { version: "1.6.1", hash: "demo" };
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
            i > 24 && i < 29
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
  scenario === "disconnected" && req.method === "common:getNodesLatestStatus"
    ? {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: "Simulated telemetry disconnect" },
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
  report.push("4 nodes; 75% instantaneous online rate");
  await page.getByRole("button", { name: /^离线/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 1);
  assert.match(await page.locator(".linen-node-row").innerText(), /Frankfurt/);
  const offlineMeters = await page
    .locator(".linen-node-row .linen-metric__value")
    .allTextContents();
  assert.deepEqual(offlineMeters, ["—", "—", "—"]);
  await page.getByRole("button", { name: /^待关注/ }).click();
  assert.equal(await page.locator(".linen-node-row").count(), 2);
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
  report.push(
    "status, group, search, CPU sort, list/grid, offline missing readings",
  );
  const metrics = async () => {
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
  const desktop = await metrics();
  assert.ok(desktop.scrollWidth <= desktop.width + 2, JSON.stringify(desktop));
  await page.screenshot({ path: out + "/preview-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await metrics();
  assert.ok(mobile.scrollWidth <= mobile.width + 2, JSON.stringify(mobile));
  assert.ok(await page.locator(".linen-nav__admin").isVisible());
  await page.screenshot({ path: out + "/preview-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() =>
    localStorage.setItem("appearance", JSON.stringify("dark")),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("html.dark");
  await page.screenshot({ path: out + "/preview-dark.png", fullPage: true });
  report.push("desktop/mobile fit; mobile login visible; dark mode");
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
  report.push(
    "independent detail route; four historical charts; 6h selector; mobile fit",
  );
  await page.goto(base + "/instance/demo-frankfurt", {
    waitUntil: "networkidle",
  });
  assert.match(
    await page.locator(".linen-instance-status").innerText(),
    /离线/,
  );
  assert.equal(
    await page.locator(".linen-instance-stat>strong").first().innerText(),
    "—",
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
