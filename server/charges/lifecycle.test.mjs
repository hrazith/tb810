import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const {
  canDeleteFutureChargeSeries,
  canStopCharge,
  isFutureEffectiveCharge,
  validateFutureChargeInput,
} = jiti("./index.ts");

function makeCharge(overrides = {}) {
  return {
    id: "charge-1",
    series_id: "series-1",
    building_id: "building-1",
    unit_id: "unit-1",
    owner_id: null,
    description: "Laundry",
    amount: 30,
    schedule: "one_off",
    effective_from_month: "2026-09-01",
    effective_to_month: null,
    stop_note: null,
    legacy_table: null,
    legacy_id: null,
    legacy_metadata: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

test("future one-off edit and delete remain allowed while current/past months are rejected", () => {
  const future = validateFutureChargeInput({
    schedule: "one_off",
    starts_month: "2026-09",
    ends_month: null,
    currentMonth: "2026-08",
  });
  assert.equal(future.error, null);

  const past = validateFutureChargeInput({
    schedule: "one_off",
    starts_month: "2026-08",
    ends_month: null,
    currentMonth: "2026-08",
  });
  assert.match(past.error ?? "", /Start month cannot be before 2026-09\./);

  const currentOneOff = makeCharge({ effective_from_month: "2026-08-01" });
  assert.equal(isFutureEffectiveCharge(currentOneOff, "2026-08"), false);
  assert.equal(canDeleteFutureChargeSeries([currentOneOff], "2026-08"), false);
});

test("future recurring edit/delete remain allowed and series safety rejects mixed history", () => {
  const futureRecurring = validateFutureChargeInput({
    schedule: "recurring",
    starts_month: "2026-09",
    ends_month: "2026-12",
    currentMonth: "2026-08",
  });
  assert.equal(futureRecurring.error, null);

  const futureSeries = [
    makeCharge({ id: "row-1", schedule: "recurring", effective_from_month: "2026-09-01" }),
    makeCharge({ id: "row-2", schedule: "recurring", effective_from_month: "2026-10-01", series_id: "series-1" }),
  ];
  assert.equal(canDeleteFutureChargeSeries(futureSeries, "2026-08"), true);

  const mixedSeries = [
    makeCharge({ id: "row-1", schedule: "recurring", effective_from_month: "2026-08-01" }),
    makeCharge({ id: "row-2", schedule: "recurring", effective_from_month: "2026-09-01", series_id: "series-1" }),
  ];
  assert.equal(canDeleteFutureChargeSeries(mixedSeries, "2026-08"), false);
});

test("stop safety rejects one-off and preserves recurring semantics", () => {
  assert.equal(canStopCharge(makeCharge({ schedule: "one_off" })), false);
  assert.equal(canStopCharge(makeCharge({ schedule: "recurring" })), true);
});
