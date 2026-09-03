import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});

const { monthKeyToDate, loadBuildingMonthFinancialFacts } = jiti("./owner-facts.ts");
const supabaseServer = jiti("@/lib/supabase/server");

test("building month facts RPC receives a SQL date for source reading month", () => {
  assert.equal(monthKeyToDate("2026-07"), "2026-07-01");
  assert.equal(monthKeyToDate("2026-08"), "2026-08-01");
});

test("building month facts keep missing Sedapal as a representable null bill", async () => {
  const originalCreateClient = supabaseServer.createClient;
  const rpcCalls = [];
  supabaseServer.createClient = async () => ({
    rpc(name, args) {
      rpcCalls.push([name, args]);
      return Promise.resolve({
        data: {
          plan: { currency: "PEN", monthly_operating_budget: "1000.00" },
          commonWaterType: { id: "cw", code: "common_water", name: "Common Water" },
          commonWaterBill: null,
          unitRows: [
            {
              id: "u-1",
              unit_number: "101",
              unit_type_id: "condo",
              unit_type_code: "condo",
              has_meter: true,
              has_gas_service: true,
              participation_percentage: 0.1,
            },
          ],
          waterReadings: [],
          gasBills: [],
          gasReadings: [],
          charges: [],
        },
        error: null,
      });
    },
  });

  try {
    const result = await loadBuildingMonthFinancialFacts({
      buildingId: "building-1",
      obligationMonth: "2026-09",
    });

    assert.equal(result.error, null);
    assert.equal(result.requestCount, 1);
    assert.equal(result.source, "remote");
    assert.ok(result.data);
    assert.equal(result.data?.commonWaterBill, null);
    assert.equal(rpcCalls.length, 1);
  } finally {
    supabaseServer.createClient = originalCreateClient;
  }
});
