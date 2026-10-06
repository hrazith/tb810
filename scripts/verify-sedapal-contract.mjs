// Read-only catalog verification of the deployed Sedapal source-freeze contract.
//
//   node scripts/verify-sedapal-contract.mjs
//
// Queries pg_catalog on the linked Supabase project through the Supabase CLI.
// It never writes. Exits non-zero when the deployed trigger set or contract
// functions are missing or have drifted from the migration.
import { execFileSync } from "node:child_process";

const CATALOG_SQL = `
select 'trigger' as kind, t.tgname as name, pg_get_triggerdef(t.oid) as detail
from pg_trigger t
where t.tgrelid = 'public.tb810_utility_bills'::regclass and not t.tgisinternal
union all
select 'function', p.proname, p.prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'tb810_monthly_obligation_package_lock_key',
  'tb810_lock_common_water_source_periods',
  'tb810_assert_sedapal_provenance',
  'tb810_sync_common_water_utility_bill',
  'tb810_block_common_water_bill_changes',
  'tb810_persist_monthly_obligation_snapshot',
  'tb810_approve_monthly_obligation',
  'tb810_approve_dev_monthly_obligation'
)`;

const EXPECTED_TRIGGERS = new Map([
  ["tb810_utility_bills_set_updated_at", /BEFORE UPDATE ON public\.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_set_updated_at\(\)/],
  ["tb810_utility_bills_sync_common_water", /BEFORE INSERT OR UPDATE ON public\.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_sync_common_water_utility_bill\(\)/],
  ["tb810_utility_bills_block_delete", /BEFORE DELETE ON public\.tb810_utility_bills FOR EACH ROW EXECUTE FUNCTION tb810_block_common_water_bill_changes\(\)/],
]);

const EXPECTED_FUNCTION_MARKERS = {
  tb810_monthly_obligation_package_lock_key: [/hashtextextended\(format\('%s:%s:%s'/],
  tb810_lock_common_water_source_periods: [/pg_advisory_xact_lock_shared/, /'approved', 'invoices_generated', 'closed'/],
  tb810_assert_sedapal_provenance: [/Sedapal source changed after review/],
  tb810_sync_common_water_utility_bill: [/tb810_lock_common_water_source_periods/, /Previous reading is read-only/],
  tb810_block_common_water_bill_changes: [/tb810_lock_common_water_source_periods/, /Common water bills are immutable/],
  tb810_persist_monthly_obligation_snapshot: [/pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/, /tb810_assert_sedapal_provenance/],
  tb810_approve_monthly_obligation: [/pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/, /tb810_assert_sedapal_provenance/],
  tb810_approve_dev_monthly_obligation: [/pg_advisory_xact_lock\(public\.tb810_monthly_obligation_package_lock_key/],
};

export function verifyCatalog(rows) {
  const failures = [];
  const triggers = new Map(rows.filter((row) => row.kind === "trigger").map((row) => [row.name, row.detail]));
  for (const [name, definition] of EXPECTED_TRIGGERS) {
    if (!triggers.has(name)) failures.push(`missing trigger ${name}`);
    else if (!definition.test(triggers.get(name))) failures.push(`trigger ${name} drifted: ${triggers.get(name)}`);
  }
  for (const name of triggers.keys()) {
    if (!EXPECTED_TRIGGERS.has(name)) failures.push(`unexpected trigger ${name}`);
  }
  const functions = new Map(rows.filter((row) => row.kind === "function").map((row) => [row.name, row.detail]));
  for (const [name, markers] of Object.entries(EXPECTED_FUNCTION_MARKERS)) {
    if (!functions.has(name)) {
      failures.push(`missing function ${name}`);
      continue;
    }
    for (const marker of markers) {
      if (!marker.test(functions.get(name))) failures.push(`function ${name} drifted: missing ${marker}`);
    }
  }
  return failures;
}

function queryLinkedCatalog() {
  const output = execFileSync("supabase", ["db", "query", "--linked", "-o", "json", CATALOG_SQL], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(output.slice(output.indexOf("{"))).rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = verifyCatalog(queryLinkedCatalog());
  if (failures.length > 0) {
    console.error("Sedapal contract catalog verification FAILED:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Sedapal contract catalog verification passed.");
}
