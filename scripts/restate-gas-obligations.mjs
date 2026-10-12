// Restate the Gas rows of an approved Monthly Obligations package under the
// Gas source-month rule (20261012130000_gas_source_month_alignment).
//
// Usage:
//   node scripts/restate-gas-obligations.mjs --month 2026-10 --reason "<why>"            # dry run
//   node scripts/restate-gas-obligations.mjs --month 2026-10 --reason "<why>" \
//     --write --confirm-target <NEXT_PUBLIC_SUPABASE_URL>                               # apply
//
// The Gas rows are computed by the application's own snapshot calculation
// (getSnapshotCalculation -> calculateGasCharges) from the package's Gas source
// month and the supplier pool it reserved at approval. The database function
// tb810_restate_gas_obligations_system repeats every validation, writes only
// with --write, and records the previous rows in the audit log.
//
// Exit codes: 0 done (or dry run passed), 1 stop condition, 2 usage error.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { month: null, reason: null, write: false, confirmTarget: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--month") args.month = argv[++i] ?? null;
    else if (value === "--reason") args.reason = argv[++i] ?? null;
    else if (value === "--write") args.write = true;
    else if (value === "--confirm-target") args.confirmTarget = argv[++i] ?? null;
    else if (value === "--dry-run") args.write = false;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function stop(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

const cents = (value) => Math.round(Number(value) * 100);
const money = (value) => (value / 100).toFixed(2);

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (!args.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
    console.error("--month YYYY-MM is required.");
    process.exit(2);
  }
  if (!args.reason || !args.reason.trim()) {
    console.error("--reason is required.");
    process.exit(2);
  }

  loadEnvFile(path.join(ROOT, ".env.local"));
  const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!target || !process.env.SUPABASE_SECRET_KEY) stop("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  console.log(`Target: ${target}`);
  console.log(`Mode:   ${args.write ? "WRITE" : "dry run"}`);
  if (args.write && args.confirmTarget !== target) {
    stop("--write requires --confirm-target equal to the target URL.");
  }

  const require = createRequire(path.join(ROOT, "package.json"));
  const jiti = require("jiti")(path.join(ROOT, "scripts/restate-gas-obligations.mjs"), { alias: { "@": ROOT }, interopDefault: true });
  const { createSystemClient } = jiti("@/server/supabase/system");
  const { getFixedBuildingIdentity } = jiti("@/server/building");
  const { loadBuildingMonthFinancialFacts } = jiti("@/server/obligations/owner-facts");
  const { getSnapshotCalculation } = jiti("@/server/obligations/snapshot");

  const supabase = createSystemClient();
  const building = getFixedBuildingIdentity();
  const factsResult = await loadBuildingMonthFinancialFacts({ buildingId: building.id, obligationMonth: args.month, client: supabase });
  if (factsResult.error || !factsResult.data) stop(factsResult.error ?? "Building month facts unavailable.");
  const facts = factsResult.data.current;
  const lifecycle = facts.obligationLifecycle;

  if (lifecycle.billingPeriodStatus !== "approved") {
    stop(`The ${args.month} package is ${lifecycle.billingPeriodStatus ?? "absent"}; only an approved package can be restated.`);
  }
  if (lifecycle.gasReservationState !== "native_reserved" && lifecycle.gasReservationState !== "native_empty") {
    stop(`The ${args.month} package has Gas reservation state ${lifecycle.gasReservationState ?? "none"}.`);
  }

  // The pool is the set of bills this package reserved (and processed) at
  // approval; the calculation consumes them as its pool.
  const calculationFacts = { ...facts, gasBills: facts.gasBills.map((bill) => ({ ...bill, processed_at: null })) };
  const calculation = await getSnapshotCalculation({
    buildingId: building.id,
    buildingName: building.name,
    obligationMonth: args.month,
    facts: calculationFacts,
    supabase,
  });
  if (calculation.error || !calculation.data) stop(`Corrected package cannot be calculated: ${calculation.error ?? "unknown error"}`);
  const gasRows = calculation.data.rows.filter((row) => row.obligation_type === "gas_consumption");
  if (gasRows.length === 0) stop("The corrected calculation produced no Gas rows.");

  const { data: result, error } = await supabase.rpc("tb810_restate_gas_obligations_system", {
    p_building_id: building.id,
    p_period_year: Number(args.month.slice(0, 4)),
    p_period_month: Number(args.month.slice(5, 7)),
    p_rows: gasRows,
    p_reason: args.reason.trim(),
    p_dry_run: !args.write,
  });
  if (error) stop(error.message);

  const unitNumberById = new Map(facts.unitRows.map((row) => [row.id, row.unit_number]));
  if (!args.write) {
    const previousByUnit = new Map(result.previousRows.map((row) => [row.unit_id, row]));
    console.log(`\nGas source month ${result.gasSourceMonth}, pool ${Number(result.poolTotal).toFixed(2)} (${result.billIds.length} bills)`);
    console.log("Unit    previous m3  previous   restated m3  restated   delta");
    let delta = 0;
    for (const row of [...result.restatedRows].sort((a, b) => String(unitNumberById.get(a.unit_id)).localeCompare(String(unitNumberById.get(b.unit_id)), undefined, { numeric: true }))) {
      const previous = previousByUnit.get(row.unit_id);
      const previousAmount = previous ? cents(previous.amount) : 0;
      const restatedAmount = cents(row.amount);
      delta += restatedAmount - previousAmount;
      console.log([
        String(unitNumberById.get(row.unit_id) ?? row.unit_id).padEnd(7),
        String(previous?.calculation_snapshot?.gasProvenance?.unitConsumption ?? "-").padStart(11),
        money(previousAmount).padStart(10),
        String(row.gasProvenance?.unitConsumption ?? "-").padStart(13),
        money(restatedAmount).padStart(10),
        money(restatedAmount - previousAmount).padStart(8),
      ].join(" "));
    }
    console.log(`Totals: previous ${Number(result.previousTotal).toFixed(2)}, restated ${Number(result.restatedTotal).toFixed(2)}, net ${money(delta)}`);
    console.log("\nDry run passed every database validation. Nothing was written.");
    return;
  }

  console.log(`\nRestated ${result.restatedRowCount} Gas rows for ${result.gasSourceMonth}: ${Number(result.previousTotal).toFixed(2)} -> ${Number(result.restatedTotal).toFixed(2)} (pool ${Number(result.poolTotal).toFixed(2)}).`);
  const after = await loadBuildingMonthFinancialFacts({ buildingId: building.id, obligationMonth: args.month, client: supabase });
  const persistedGas = after.data?.current.obligationSnapshot?.components.gas_consumption;
  if (!persistedGas || cents(persistedGas.amount) !== cents(result.restatedTotal) || persistedGas.count !== result.restatedRowCount) {
    stop(`Post-check failed: persisted Gas ${persistedGas ? `${persistedGas.count} rows / ${persistedGas.amount}` : "missing"}.`);
  }
  console.log("Post-check passed: persisted Gas rows match the restatement.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
