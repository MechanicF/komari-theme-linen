import assert from "node:assert/strict";
import { getNodeExpiry } from "../src/components/linen/linenExpiry.ts";
const now = Date.parse("2026-11-20T12:00:00Z");
for (const value of [
  "",
  null,
  "0001-01-01T00:00:00Z",
  "1970-01-01T00:00:00Z",
  "2026-02-30",
  "2026-13-01",
  "2026-00-10",
  "invalid",
])
  assert.equal(getNodeExpiry(value, now), null);
assert.deepEqual(getNodeExpiry("2026-11-21T00:00:00Z", now), {
  date: "2026-11-21",
  days: 1,
  state: "soon",
});
assert.equal(getNodeExpiry("2026-11-20", now).state, "expired");
assert.equal(getNodeExpiry("2026-12-20", now).state, "active");
console.log("expiry edge cases passed");
