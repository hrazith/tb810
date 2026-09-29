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

test("The workspace keeps legacy processed bills separate and renders no Supplier column", () => {
  assert.match(workspaceSource, /Legacy processed bills/);
  assert.match(workspaceSource, /Processed before TB810 obligation tracking/);
  assert.match(workspaceSource, /Invoice \/ receipt/);
  assert.doesNotMatch(workspaceSource, />Supplier</);
  assert.doesNotMatch(workspaceSource, />Status</);
});

test("The normal Supplier Bills route is timeless and starts with Pending", () => {
  assert.match(pageSource, /loadGasBillsWorkspace/);
  assert.match(workspaceSource, /useState<"pending" \| "processed">\("pending"\)/);
  assert.match(workspaceSource, /pendingBills\.length/);
  assert.match(workspaceSource, /There are no supplier bills waiting to be processed/);
});

test("Add bills use the compatibility supplier value without displaying Supplier", () => {
  const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(actions, /supplier_name: "Not recorded"/);
  assert.match(workspaceSource, /Invoice \/ receipt #/);
  assert.doesNotMatch(workspaceSource, /<label[^>]*>Supplier/);
});
