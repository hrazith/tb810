import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { MONTHLY_OBLIGATION_PROVIDER_KEYS } = jiti("./provider-keys.ts");

test("monthly obligation provider factory exposes all canonical components", () => {
  assert.deepEqual(MONTHLY_OBLIGATION_PROVIDER_KEYS, [
    "fixed_assessment",
    "metered_water",
    "common_water",
    "gas",
    "other_charge",
  ]);
});
