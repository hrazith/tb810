import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../../app/(staff)/gas/bills/_components/gas-bills-workspace.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../app/(staff)/gas/bills/page.tsx", import.meta.url), "utf8");

test("Pending uses one building-scoped unprocessed bill read without month filtering", () => {
  assert.match(indexSource, /\.from\("tb810_gas_bills"\)[\s\S]*?\.eq\("building_id", building\.data\.id\)[\s\S]*?\.is\("processed_at", null\)/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf("export async function loadGasBillsWorkspace")), /isEligibleGasBill|monthKeyToDate/);
});

test("Processed native bundles use Billing Period snapshot sourceIds", () => {
  const readModel = indexSource.slice(indexSource.indexOf("export async function loadGasBillsWorkspace"));
  assert.match(readModel, /tb810_billing_periods/);
  assert.match(readModel, /tb810_monthly_financial_obligations/);
  assert.match(readModel, /sourceIdsFromSnapshot/);
  assert.match(readModel, /nativeSourceIds/);
  assert.doesNotMatch(readModel, /source_id \?\? .*sourceIds/);
});

test("The workspace shows historical purchases before test records and shows purchase provenance", () => {
  assert.ok(workspaceSource.indexOf("Historical supplier purchases") < workspaceSource.indexOf("Historical test records"));
  assert.match(workspaceSource, /Approved in TB810 · Processed/);
  assert.doesNotMatch(workspaceSource, /Legacy processed bills/);
  assert.match(workspaceSource, /Invoice \/ receipt/);
  assert.match(workspaceSource, />Supplier</);
  assert.match(workspaceSource, /bill\.invoice_number \?\? "No reference"/);
  assert.doesNotMatch(workspaceSource, />Status</);
});

test("The pending workspace includes purchases by default with explicit Exclude / Restore", () => {
  assert.match(workspaceSource, /setGasBillSelectionAction/);
  assert.match(workspaceSource, />Exclude<\/Button>/);
  assert.match(workspaceSource, /Restore to \{poolMonthLabel\}/);
  assert.match(workspaceSource, /"Included"/);
  assert.match(workspaceSource, /Excluded/);
  assert.doesNotMatch(workspaceSource, /Add to \{poolMonthLabel\}|Remove from \{poolMonthLabel\}/);
  assert.match(workspaceSource, /selected_obligation_month\?\.slice\(0, 7\) === data\.poolMonthKey/);
  assert.doesNotMatch(workspaceSource, /invoice_date\s*</);
});

test("The normal Supplier Bills route is timeless and starts with Pending", () => {
  assert.match(pageSource, /loadGasBillsWorkspace/);
  assert.match(workspaceSource, /useState<"pending" \| "processed">\("pending"\)/);
  assert.match(workspaceSource, /pendingBills\.length/);
  assert.match(workspaceSource, /There are no supplier bills waiting to be processed/);
});

test("Add bills record supplier and invoice only when known, never a placeholder", () => {
  const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /Not recorded/);
  assert.doesNotMatch(workspaceSource, /Not recorded/);
  assert.match(actions, /supplier_name: String\(formData\.get\("supplier_name"\) \?\? ""\)/);
  assert.match(workspaceSource, /Invoice \/ receipt # <span className="text-zinc-400">\(optional\)<\/span>/);
  assert.match(workspaceSource, /Supplier <span className="text-zinc-400">\(optional\)<\/span>/);
});
