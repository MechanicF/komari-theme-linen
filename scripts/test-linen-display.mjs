import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const source = await readFile(
  new URL("../src/components/linen/linenDisplay.ts", import.meta.url),
  "utf8",
);
const js = await transform(source, { format: "esm", loader: "ts" });
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js.code).toString("base64")
);
for (const key of Object.keys(mod.DISPLAY_DEFAULTS))
  assert.equal(
    mod.readDisplayOptions({})[key],
    true,
    key + " default should stay visible",
  );
for (const key of Object.keys(mod.DISPLAY_DEFAULTS))
  assert.equal(
    mod.readDisplayOptions({ [key]: false })[key],
    false,
    key + " can be hidden",
  );
assert.equal(
  mod.readDisplayOptions({ showCarrierLatency: "0" }).showCarrierLatency,
  false,
);
assert.equal(
  mod.readDisplayOptions({ showNodeExpiry: "true" }).showNodeExpiry,
  true,
);
console.log(
  "display defaults and independent switches passed",
  Object.keys(mod.DISPLAY_DEFAULTS).length,
);
