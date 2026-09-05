import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});
const { buildGasSupplierBillDraft } = jiti("./dev-bill.ts");

test("builds a test gas supplier bill from the latest prior valid bill", () => {
  const result = buildGasSupplierBillDraft({
    billDate: "2026-08-31",
    history: [
      {
        supplier_name: "Metrogas",
        invoice_date: "2026-07-31",
        amount: "480.00",
        created_at: "2026-07-31T12:00:00Z",
      },
      {
        supplier_name: "Metrogas",
        invoice_date: "2026-06-30",
        amount: "460.00",
        created_at: "2026-06-30T12:00:00Z",
      },
    ],
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data, {
    supplierName: "Metrogas",
    invoiceDate: "2026-08-31",
    amount: "480.00",
    notes: "Gas test bill",
  });
});

test("requires a historical gas bill basis", () => {
  const result = buildGasSupplierBillDraft({
    billDate: "2026-08-31",
    history: [],
  });

  assert.equal(result.data, null);
  assert.match(result.error ?? "", /Unable to derive a realistic Gas bill amount/);
});
