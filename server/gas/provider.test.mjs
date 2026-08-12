import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { listGasReadingsForMonth } = jiti("./month-query.ts");

test("lists only the canonical source month gas readings", async () => {
  const calls = [];
  const rows = [
    { id: "r1", unit_id: "u1", reading_month: "2026-07-01", current_reading: 10, previous_reading: 9, consumption: 1 },
  ];

  const supabase = {
    from(table) {
      calls.push(["from", table]);
      const chain = {
        select(columns) {
          calls.push(["select", columns]);
          return chain;
        },
        eq(column, value) {
          calls.push(["eq", column, value]);
          return chain;
        },
        then(resolve) {
          resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
  };

  const result = await listGasReadingsForMonth(supabase, "building-1", "2026-07");

  assert.deepEqual(calls, [
    ["from", "tb810_gas_readings"],
    [
      "select",
      "id, unit_id, reading_month, current_reading, previous_reading, consumption",
    ],
    ["eq", "building_id", "building-1"],
    ["eq", "reading_month", "2026-07-01"],
  ]);
  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].reading_month, "2026-07-01");
});
