import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { classifyOwnershipRow } = jiti("./classification.ts");

test("ownership responsibility follows the billing-month boundary", () => {
  const current = classifyOwnershipRow(
    {
      start_date: "2026-08-01",
      end_date: null,
    },
    "2026-08",
  );

  const scheduled = classifyOwnershipRow(
    {
      start_date: "2026-09-01",
      end_date: null,
    },
    "2026-08",
  );

  const past = classifyOwnershipRow(
    {
      start_date: "2026-07-01",
      end_date: "2026-07-31",
    },
    "2026-08",
  );

  assert.equal(current, "current");
  assert.equal(scheduled, "scheduled");
  assert.equal(past, "past");
});
