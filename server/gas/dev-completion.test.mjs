import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { buildMissingGasReadingDrafts, gasReadingDateForSourceMonth } = jiti("./dev-completion.ts");

test("dates generated readings at the source month boundary", () => {
  assert.equal(gasReadingDateForSourceMonth("2026-09"), "2026-09-30");
  assert.equal(gasReadingDateForSourceMonth("2026-10"), "2026-10-31");
});

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

test("fills a bounded zero-consumption gap from the next reading boundary", () => {
  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units: [{ id: "u1", unit_number: "306", unit_type_code: "condo", has_gas_service: true }],
    readings: [
      { unit_id: "u1", reading_month: "2026-07-01", current_reading: 0, previous_reading: null, consumption: 0 },
      { unit_id: "u1", reading_month: "2026-09-01", current_reading: 8.817, previous_reading: 0, consumption: 8.817 },
    ],
  });

  assert.deepEqual(drafts[0], {
    unitId: "u1",
    unitNumber: "306",
    readingMonth: "2026-08-01",
    readingDate: "2026-08-31",
    previousReading: 0,
    currentReading: 0,
    consumption: 0,
  });
});

test("fills a bounded positive gap from the next reading boundary", () => {
  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units: [{ id: "u1", unit_number: "101", unit_type_code: "condo", has_gas_service: true }],
    readings: [
      { unit_id: "u1", reading_month: "2026-07-01", current_reading: 10, previous_reading: null, consumption: 10 },
      { unit_id: "u1", reading_month: "2026-09-01", current_reading: 15, previous_reading: 12, consumption: 3 },
    ],
  });

  assert.equal(drafts[0].previousReading, 10);
  assert.equal(drafts[0].currentReading, 12);
  assert.equal(drafts[0].consumption, 2);
});

test("refuses a bounded gap that would move meter continuity backwards", () => {
  assert.throws(() => buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units: [{ id: "u1", unit_number: "101", unit_type_code: "condo", has_gas_service: true }],
    readings: [
      { unit_id: "u1", reading_month: "2026-07-01", current_reading: 12, previous_reading: null, consumption: 12 },
      { unit_id: "u1", reading_month: "2026-09-01", current_reading: 15, previous_reading: 10, consumption: 5 },
    ],
  }), /meter continuity moves backwards/);
});

test("preserves forward fallback generation when no following reading exists", () => {
  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units: [{ id: "u1", unit_number: "101", unit_type_code: "condo", has_gas_service: true }],
    readings: [
      { unit_id: "u1", reading_month: "2026-07-01", current_reading: 10, previous_reading: null, consumption: 0 },
    ],
  });

  assert.equal(drafts[0].previousReading, 10);
  assert.equal(drafts[0].currentReading, 10.001);
  assert.equal(drafts[0].consumption, 0.001);
});

test("fills the August 2026 gaps for Units 306 and 804 without adding consumption", () => {
  const drafts = buildMissingGasReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units: [
      { id: "u306", unit_number: "306", unit_type_code: "condo", has_gas_service: true },
      { id: "u804", unit_number: "804", unit_type_code: "condo", has_gas_service: true },
    ],
    readings: [
      { unit_id: "u306", reading_month: "2026-07-01", current_reading: 0, previous_reading: null, consumption: 0 },
      { unit_id: "u306", reading_month: "2026-09-01", current_reading: 8.817, previous_reading: 0, consumption: 8.817 },
      { unit_id: "u804", reading_month: "2026-07-01", current_reading: 0, previous_reading: null, consumption: 0 },
      { unit_id: "u804", reading_month: "2026-09-01", current_reading: 2.251, previous_reading: 0, consumption: 2.251 },
    ],
  });

  assert.deepEqual(drafts.map(({ unitNumber, previousReading, currentReading, consumption, readingDate }) => ({
    unitNumber,
    previousReading,
    currentReading,
    consumption,
    readingDate,
  })), [
    { unitNumber: "306", previousReading: 0, currentReading: 0, consumption: 0, readingDate: "2026-08-31" },
    { unitNumber: "804", previousReading: 0, currentReading: 0, consumption: 0, readingDate: "2026-08-31" },
  ]);
});
