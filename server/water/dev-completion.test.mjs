import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});
const { buildMissingWaterReadingDrafts, getCommonWaterUtilityTypeId } = jiti("./dev-completion.ts");
const supabaseServer = jiti("@/lib/supabase/server");

test("builds drafts only for missing water readings", () => {
  const units = [
    { id: "u1", unit_number: "101", unit_type_code: "condo", has_meter: true },
    { id: "u2", unit_number: "102", unit_type_code: "condo", has_meter: true },
    { id: "u3", unit_number: "103", unit_type_code: "condo", has_meter: true },
  ];
  const readings = [
    { unit_id: "u1", reading_date: "2026-08-31", reading_end: 100, reading_start: 90, consumption: 10, created_at: "2026-09-04T00:00:00Z" },
    { unit_id: "u2", reading_date: "2026-07-31", reading_end: 220, reading_start: 200, consumption: 20, created_at: "2026-08-01T00:00:00Z" },
    { unit_id: "u3", reading_date: "2026-08-31", reading_end: 305, reading_start: 300, consumption: 5, created_at: "2026-09-04T00:00:00Z" },
  ];

  const result = buildMissingWaterReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units,
    readings,
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0], {
    unitId: "u2",
    unitNumber: "102",
    readingDate: "2026-08-31",
    readingStart: 220,
    readingEnd: 240,
    consumption: 20,
  });
  assert.deepEqual(readings, [
    { unit_id: "u1", reading_date: "2026-08-31", reading_end: 100, reading_start: 90, consumption: 10, created_at: "2026-09-04T00:00:00Z" },
    { unit_id: "u2", reading_date: "2026-07-31", reading_end: 220, reading_start: 200, consumption: 20, created_at: "2026-08-01T00:00:00Z" },
    { unit_id: "u3", reading_date: "2026-08-31", reading_end: 305, reading_start: 300, consumption: 5, created_at: "2026-09-04T00:00:00Z" },
  ]);
});

test("returns zero drafts when water readings are already complete", () => {
  const units = [
    { id: "u1", unit_number: "101", unit_type_code: "condo", has_meter: true },
    { id: "u2", unit_number: "102", unit_type_code: "condo", has_meter: true },
  ];
  const readings = [
    { unit_id: "u1", reading_date: "2026-08-31", reading_end: 100, reading_start: 90, consumption: 10, created_at: "2026-09-04T00:00:00Z" },
    { unit_id: "u2", reading_date: "2026-08-31", reading_end: 240, reading_start: 220, consumption: 20, created_at: "2026-09-04T00:00:00Z" },
  ];

  const result = buildMissingWaterReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units,
    readings,
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 0);
});

test("uses current-month averages when a unit has no prior reading", () => {
  const units = [
    { id: "u1", unit_number: "101", unit_type_code: "condo", has_meter: true },
    { id: "u2", unit_number: "102", unit_type_code: "condo", has_meter: true },
  ];
  const readings = [
    { unit_id: "u1", reading_date: "2026-08-31", reading_end: 100, reading_start: 90, consumption: 10, created_at: "2026-09-04T00:00:00Z" },
    { unit_id: "u2", reading_date: "2026-07-31", reading_end: 220, reading_start: 200, consumption: 20, created_at: "2026-08-01T00:00:00Z" },
  ];

  const result = buildMissingWaterReadingDrafts({
    sourceReadingMonth: "2026-08",
    readingDate: "2026-08-31",
    units,
    readings,
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].unitId, "u2");
  assert.equal(result.data[0].consumption, 20);
  assert.equal(result.data[0].readingEnd, 240);
});

test("loads the common water utility type from tb810_utility_types", async () => {
  const originalCreateClient = supabaseServer.createClient;
  const calls = [];
  supabaseServer.createClient = async () => ({
    from(table) {
      calls.push(table);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { id: "utility-type-id", code: "common_water" },
            error: null,
          });
        },
      };
    },
  });

  try {
    const result = await getCommonWaterUtilityTypeId();
    assert.equal(result.error, null);
    assert.equal(result.data, "utility-type-id");
    assert.deepEqual(calls, ["tb810_utility_types"]);
  } finally {
    supabaseServer.createClient = originalCreateClient;
  }
});
