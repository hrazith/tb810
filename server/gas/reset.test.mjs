import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260927140000_clear_current_gas_reading_month.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const panel = readFileSync(
  new URL("../../app/(staff)/gas/unit-gas-readings/_components/gas-reading-ledger-panel.tsx", import.meta.url),
  "utf8",
);

test("Gas Start over uses one guarded atomic current-month RPC", () => {
  assert.match(migration, /create or replace function public\.tb810_clear_current_gas_reading_month\(/);
  assert.match(migration, /p_month_key !~/);
  assert.match(migration, /p_month_key <> to_char\(current_date, 'YYYY-MM'\)/);
  assert.match(migration, /delete from public\.tb810_gas_readings/);
  assert.match(migration, /domain = 'gas'::public\.tb810_dev_test_domain/);
  assert.match(migration, /operation = 'create'/);
  assert.match(migration, /grant execute on function public\.tb810_clear_current_gas_reading_month\(text, uuid\) to authenticated/);
  assert.doesNotMatch(migration, /tb810_gas_bills|tb810_meter_readings|tb810_monthly_financial_obligations/);
  assert.match(index, /tb810_clear_current_gas_reading_month/);
  assert.match(actions, /revalidatePath\(`\/gas\/unit-gas-readings\/\$\{monthKey\}`\)/);
  assert.doesNotMatch(actions, /delete from public\.tb810_gas_readings/);
});

test("Gas Start over is visible only for a complete current month", () => {
  assert.match(panel, /isCurrentMonth && monthEditable && rows\.length > 0 && completedCount === rows\.length/);
  assert.match(panel, /<GasStartOverButton month=\{selectedMonthKey\} readingCount=\{completedCount\} \/>/);
  assert.match(panel, /Start over \$\{monthName\} readings\?/);
  assert.match(panel, /all \{readingCount\} \{monthName\} Gas meter readings/);
  assert.match(panel, /requestSubmit\(\)/);
});
