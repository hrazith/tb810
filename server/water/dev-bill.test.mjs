import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});
const { buildCommonWaterBillDraft } = jiti("./dev-bill.ts");

test("builds a test Sedapal bill from the latest prior valid bill", () => {
  const result = buildCommonWaterBillDraft({
    billDate: "2026-08-31",
    history: [
      {
        amount: "82.50",
        bill_date: "2026-07-31",
        current_reading: "124.000",
        previous_reading: "100.000",
        total_consumption: "24.000",
        created_at: "2026-07-31T12:00:00Z",
      },
      {
        amount: "91.25",
        bill_date: "2026-06-30",
        current_reading: "100.000",
        previous_reading: "74.000",
        total_consumption: "26.000",
        created_at: "2026-06-30T12:00:00Z",
      },
    ],
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data, {
    amount: "82.50",
    billDate: "2026-08-31",
    currentReading: 148,
    previousReading: 124,
    description: "Sedapal test bill",
  });
});

test("requires a historical Sedapal bill basis", () => {
  const result = buildCommonWaterBillDraft({
    billDate: "2026-08-31",
    history: [],
  });

  assert.equal(result.data, null);
  assert.match(result.error ?? "", /Unable to derive a realistic Sedapal bill amount|reading baseline/);
});
