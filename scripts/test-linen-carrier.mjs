import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const path = new URL(
  "../src/components/linen/linenCarrierLatency.ts",
  import.meta.url,
);
const source = await readFile(path, "utf8");
const js = await transform(source, { format: "esm", loader: "ts" });
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js.code).toString("base64")
);
assert.equal(mod.identifyCarrier("中国电信 TCP"), "telecom");
assert.equal(mod.identifyCarrier("China Unicom"), "unicom");
assert.equal(mod.identifyCarrier("中国移动"), "mobile");
assert.equal(mod.identifyCarrier("Other"), null);
assert.deepEqual(
  mod.carrierTaskIds({ carrierLatencyTaskIds: { telecom: 7 } }, [
    { id: 7, name: "Custom" },
    { id: 8, name: "联通" },
  ]),
  { telecom: "7" },
);
const tasks = [
  { id: 1, name: "电信" },
  { id: 2, name: "联通" },
  { id: 3, name: "移动" },
];
const series = [
  {
    entity_id: "node-a",
    tags: { task_id: "1" },
    points: [{ time: new Date(100000).toISOString(), value: 22.6 }],
  },
  {
    entity_id: "node-a",
    tags: { task_id: "2" },
    points: [{ time: new Date(100000 - 240000).toISOString(), value: 31 }],
  },
];
const records = mod.deriveCarrierLatency(
  tasks,
  series,
  ["node-a", "node-b"],
  100000,
  180000,
  {
    carrierTelecomTaskId: "1",
    carrierUnicomTaskId: "2",
    carrierMobileTaskId: "3",
  },
);
assert.equal(records["node-a"][0].state, "fresh");
assert.equal(records["node-a"][0].value, 22.6);
assert.equal(records["node-a"][1].state, "stale");
assert.equal(records["node-a"][2].state, "missing");
assert.equal(records["node-b"][0].state, "missing");
const row = (id, value) => ({
  entity_id: "node-a",
  tags: { task_id: String(id) },
  points: [{ time: new Date(100000).toISOString(), value }],
});
const latest = mod.deriveCarrierLatency(
  tasks,
  [row(1, -1), row(2, null), row(3, 0)],
  ["node-a"],
  100000,
  180000,
  {
    carrierTelecomTaskId: "1",
    carrierUnicomTaskId: "2",
    carrierMobileTaskId: "3",
  },
);
assert.deepEqual(
  latest["node-a"].map((r) => r.state),
  ["timeout", "missing", "fresh"],
);
assert.equal(latest["node-a"][2].value, 0);
assert.equal(
  mod.deriveCarrierLatency(
    [{ id: 7, name: "custom" }],
    [row(7, 12)],
    ["node-a"],
    100000,
    180000,
    { carrierTelecomTaskId: "7" },
  )["node-a"][0].value,
  12,
);
assert.deepEqual(mod.carrierTaskIds({}, tasks), {});
assert.deepEqual(
  mod.carrierTaskIds(
    { carrierTelecomTaskId: "", carrierLatencyTaskIds: { telecom: 1 } },
    tasks,
  ),
  {},
);
assert.deepEqual(
  mod.carrierTaskIds({ carrierTelecomTaskId: "999" }, tasks),
  {},
);
assert.equal(
  mod.deriveCarrierLatency(tasks, series, ["node-a"], 100000)["node-a"][0]
    .state,
  "unconfigured",
);
console.log(
  "carrier latency pure tests passed; task selection explicit and no automatic fallback",
);
