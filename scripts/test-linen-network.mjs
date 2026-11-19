import assert from "node:assert/strict";
import { summarizeNetwork } from "../src/components/linen/linenNetwork.ts";
const sample = (online, up, down, totalUp, totalDown) => ({
  online,
  record: { network: { up, down, totalUp, totalDown } },
});
const x = summarizeNetwork([
  sample(true, 10, 20, 100, 200),
  sample(false, 900, 800, 300, 400),
]);
assert.equal(x.speedUp, 10);
assert.equal(x.speedDown, 20);
assert.equal(x.totalBytes, 1000);
assert.equal(x.totalUp, 400);
assert.equal(x.totalDown, 600);
assert.equal(x.counterNodes, 2);
assert.equal(x.rateNodes, 1);
const missing = summarizeNetwork([sample(true, NaN, undefined, -1, Infinity)]);
assert.equal(missing.speedUp, null);
assert.equal(missing.speedDown, null);
assert.equal(missing.totalBytes, null);
assert.equal(missing.ratePartial, true);
assert.equal(missing.counterPartial, true);
const zero = summarizeNetwork([sample(true, 0, 0, 0, 0)]);
assert.equal(zero.speedUp, 0);
assert.equal(zero.totalBytes, 0);
const stale = summarizeNetwork([sample(false, 10, 20, 100, 200)]);
assert.equal(stale.speedDown, null);
assert.equal(stale.totalBytes, 300);
const none = summarizeNetwork([]);
assert.equal(none.speedDown, null);
assert.equal(none.totalBytes, null);
const unknown = summarizeNetwork([
  { ...sample(true, 10, 20, 100, 200), sampleKnown: true },
  { online: false, sampleKnown: false },
]);
assert.equal(unknown.speedUp, 10);
assert.equal(unknown.unknownNodes, 1);
assert.equal(unknown.ratePartial, true);
console.log(
  "PASS: fresh online rate scope, offline counters retained, missing/invalid data, legitimate zero, empty inventory",
);
