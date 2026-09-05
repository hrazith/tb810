import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { buildMissingGasReadingDrafts } = jiti("./dev-completion.ts");

test("builds drafts only for missing gas readings", () => {
  const units = [
    { id: "u1", unit_number: "101", unit_type_code: "condo", has_gas_service: true },
    { id: "u2", unit_number: "102", unit_type_code: "condo", has_gas_service: true },
    { id: "u3", unit_number: "103", unit_type_code: "condo", has_gas_service: true },
  ];
  const readings = [
    { unit_id: "u1", reading_month: "2026-08-01", current_reading: 100, previous_reading: 90, consumption: 10 },
    { unit_id: "u2", reading_month: "2026-07-01", current_reading: 220, previous_reading: 200, consumption: 20 },
    { unit_id: "u3", reading_month: "2026-08-01", current_reading: 305, previous_reading: 300, consumption: 5 },
  ];

  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units,
    readings,
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].unitId, "u2");
  assert.equal(drafts[0].readingMonth, "2026-08-01");
  assert.equal(drafts[0].readingDate, "2026-08-31");
  assert.equal(drafts[0].previousReading, 220);
  assert.equal(drafts[0].currentReading, 240);
  assert.equal(drafts[0].consumption, 20);
  assert.deepEqual(readings, [
    { unit_id: "u1", reading_month: "2026-08-01", current_reading: 100, previous_reading: 90, consumption: 10 },
    { unit_id: "u2", reading_month: "2026-07-01", current_reading: 220, previous_reading: 200, consumption: 20 },
    { unit_id: "u3", reading_month: "2026-08-01", current_reading: 305, previous_reading: 300, consumption: 5 },
  ]);
});

test("returns no drafts when gas readings are already complete", () => {
  const units = [
    { id: "u1", unit_number: "101", unit_type_code: "condo", has_gas_service: true },
    { id: "u2", unit_number: "102", unit_type_code: "condo", has_gas_service: true },
  ];
  const readings = [
    { unit_id: "u1", reading_month: "2026-08-01", current_reading: 100, previous_reading: 90, consumption: 10 },
    { unit_id: "u2", reading_month: "2026-08-01", current_reading: 240, previous_reading: 220, consumption: 20 },
  ];

  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units,
    readings,
  });

  assert.equal(drafts.length, 0);
});
