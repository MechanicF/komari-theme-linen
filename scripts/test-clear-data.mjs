import assert from "node:assert/strict";
import {
  readingState,
  resourceIssue,
  ratio,
  duration,
} from "../src/components/clear/data.ts";
const now = Date.parse("2026-11-21T02:00:00Z");
const sample = {
  online: true,
  updated_at: new Date(now).toISOString(),
  cpu: { usage: 25 },
  ram: { used: 30 },
  disk: { used: 50 },
};
assert.equal(readingState(undefined, false, true, now), "pending");
assert.equal(readingState(sample, true, false, now), "disconnected");
assert.equal(
  readingState({ ...sample, online: false }, true, true, now),
  "offline",
);
assert.equal(
  readingState(
    { ...sample, updated_at: new Date(now - 31000).toISOString() },
    true,
    true,
    now,
  ),
  "stale",
);
assert.equal(
  readingState(
    { ...sample, updated_at: new Date(now + 31000).toISOString() },
    true,
    true,
    now,
  ),
  "stale",
);
assert.equal(readingState(sample, true, true, now), "online");
assert.equal(ratio(NaN, 100), null);
assert.equal(ratio(0, 100), 0);
assert.equal(ratio(100, 0), null);
assert.equal(
  resourceIssue({ mem_total: 100, disk_total: 100 }, sample, "offline"),
  "",
);
assert.equal(
  resourceIssue(
    { mem_total: 100, disk_total: 100 },
    { ...sample, cpu: { usage: 90 } },
    "online",
  ),
  "cpu",
);
assert.equal(duration(NaN, false), "—");
assert.equal(duration(90000, true), "1d 1h");
console.log(
  "PASS: live readiness/connection/freshness, no offline duplication, ratio missing/zero and uptime",
);
