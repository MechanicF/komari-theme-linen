import assert from "node:assert/strict";
import {
  trafficQuota,
  trafficDayWindow,
  summarizeDailyTraffic,
} from "../src/components/linen/linenTraffic.ts";
const now = Date.parse("2026-11-19T16:10:00Z"),
  day = trafficDayWindow(now, "Asia/Shanghai");
assert.equal(new Date(day.start).toISOString(), "2026-11-19T16:00:00.000Z");
assert.equal(
  trafficDayWindow(day.start - 1, "Asia/Shanghai").start,
  day.start - 86400000,
);
assert.equal(
  new Date(trafficDayWindow(now, "UTC").start).toISOString(),
  "2026-11-19T00:00:00.000Z",
);
for (const [mode, used] of [
  ["up", 30],
  ["down", 70],
  ["sum", 100],
  ["min", 30],
  ["max", 70],
  [undefined, 70],
])
  assert.equal(trafficQuota(30, 70, 100, mode).used, used);
assert.equal(trafficQuota(30, 70, 0, "sum").percent, null);
assert.equal(trafficQuota(undefined, 70, 100, "sum").percent, null);
assert.equal(trafficQuota(30, undefined, 100, "up").percent, 30);
assert.equal(trafficQuota(0, 0, 100, "sum").percent, 0);
assert.equal(trafficQuota(120, 80, 100, "sum").percent, 200);
assert.equal(trafficQuota(120, 80, 100, "sum").bar, 100);
const series = (key, values) => ({
  entity_id: "one",
  metric_key: key,
  interval_seconds: 60,
  count: values.length,
  points: values.map(([offset, value, count]) => ({
    time: new Date(day.start + offset * 60000).toISOString(),
    value,
    count,
  })),
});
let records = summarizeDailyTraffic(
  [
    series("traffic.up", [
      [-1, 999],
      [0, 10, 50],
      [1, 20, 100],
    ]),
    series("traffic.down", [
      [0, 30, 40],
      [1, 40, 40],
    ]),
  ],
  ["one"],
  day.start,
  day.start + 60000,
);
assert.equal(records.one.up, 30);
assert.equal(records.one.down, 70);
assert.equal(records.one.total, 100);
assert.equal(records.one.partial, false);
records = summarizeDailyTraffic(
  [
    series("traffic.up", [
      [0, 0],
      [1, 0],
    ]),
    series("traffic.down", [
      [0, 0],
      [1, 0],
    ]),
  ],
  ["one"],
  day.start,
  day.start + 60000,
);
assert.equal(records.one.total, 0);
records = summarizeDailyTraffic(
  [
    series("traffic.up", [
      [0, 5],
      [1, null],
      [3, 8],
    ]),
  ],
  ["one"],
  day.start,
  day.start + 4 * 60000,
);
assert.equal(records.one.total, 13);
assert.equal(records.one.partial, true);
assert.equal(records.one.down, null);
records = summarizeDailyTraffic([], ["one"], day.start, now);
assert.equal(records.one.total, null);
records = summarizeDailyTraffic(
  [
    series("traffic.up", [
      [0, 10],
      [0, 10],
      [1, 20],
    ]),
  ],
  ["one"],
  day.start,
  day.start + 60000,
);
assert.equal(records.one.up, 30);
records = summarizeDailyTraffic(
  [series("traffic.up", [[0, 10]])],
  ["other"],
  day.start,
  now,
);
assert.equal(records.other.total, null);
assert.equal(records.one, undefined);
console.log(
  "PASS: UTC+8/UTC day boundaries, five quota modes, zero/missing/unlimited/overage, recorded-delta sums, gaps, deduplication and visible-node scope",
);
