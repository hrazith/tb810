import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260927120000_gas_complete_set_import.sql", import.meta.url),
  "utf8",
);
const gasIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const gasDialog = readFileSync(
  new URL("../../app/(staff)/gas/_components/gas-import-dialog.tsx", import.meta.url),
  "utf8",
);
const gasActions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

test("Gas complete-set import validates the live eligible roster in PostgreSQL", () => {
  assert.match(migration, /unit_type_code = 'condo' and has_gas_service = true/);
  assert.match(migration, /v_submitted_count <> v_expected_count/);
  assert.match(migration, /Each eligible Gas Unit may appear only once/);
  assert.match(migration, /Reading date must belong to the selected operational month/);
  assert.match(migration, /Current reading must be greater than or equal to previous reading/);
  assert.match(migration, /on conflict \(building_id, unit_id, reading_month\) do update/);
});

test("DEV Gas import journals pre-state before the canonical write and remains resettable", () => {
  assert.match(migration, /create or replace function public\.tb810_sync_dev_gas_reading_import/);
  assert.match(migration, /v_pre_state jsonb := '\[\]'::jsonb/);
  assert.match(migration, /select \* into v_result from public\.tb810_sync_gas_reading_import/);
  assert.match(migration, /before_state/);
  assert.match(migration, /alter function public\.tb810_reset_dev_test_session\(uuid\) rename to tb810_reset_dev_test_session_base/);
  assert.match(migration, /domain = 'gas'::public\.tb810_dev_test_domain/);
  assert.match(migration, /operation = 'update'/);
});

test("confirmed Gas workbook imports use one RPC rather than a client row-write loop", () => {
  assert.match(gasIndex, /tb810_sync_gas_reading_import/);
  assert.match(gasIndex, /tb810_sync_dev_gas_reading_import/);
  assert.doesNotMatch(gasIndex, /tb810_gas_readings\"\)\.upsert/);
  assert.match(gasDialog, /`Import \$\{expectedUnitCount\} readings`/);
  assert.match(gasDialog, /const ready = Boolean\(/);
});

test("Gas workbook Review uses one bounded eligible roster read", () => {
  const review = gasIndex.slice(gasIndex.indexOf("export async function importGasWorkbook("));
  assert.doesNotMatch(review, /listUnits\(\)/);
  assert.match(gasIndex, /async function listGasReviewRoster\(buildingId: string\)/);
  assert.match(gasIndex, /tb810_unit_types!tb810_units_unit_type_id_fkey!inner\(code\)/);
  assert.match(gasIndex, /\.eq\("has_gas_service", true\)/);
  assert.match(gasIndex, /\.eq\("tb810_unit_types\.code", "condo"\)/);
});

test("Gas Review has no temporary diagnostic instrumentation", () => {
  assert.doesNotMatch(gasIndex, /GAS_REVIEW_PERF|logGasReviewStage/);
  assert.doesNotMatch(gasDialog, /GAS_IMPORT_CONFIRM_TRACE/);
  assert.doesNotMatch(gasActions, /GAS_REVIEW_PERF|GAS_IMPORT_TRACE_SERVER|logGasReviewAction/);
});

test("Gas Review requires a selected workbook before parsing", () => {
  assert.match(gasDialog, /const \[fileSelected, setFileSelected\] = useState\(false\)/);
  assert.match(gasDialog, /setFileSelected\(Boolean\(file\)\)/);
  assert.match(gasDialog, /disabled=\{pending \|\| !fileSelected/);
  assert.match(gasActions, /file\.size === 0 \|\| !file\.name\.trim\(\)/);
  assert.match(gasActions, /Choose a workbook to review\./);
});

test("Gas Review converts expected workbook read failures without swallowing unexpected errors", () => {
  assert.match(gasActions, /error\.message === "Unable to read workbook\."/);
  assert.match(gasActions, /Unable to read this workbook\. Choose a valid \.xlsx file\./);
  assert.match(gasActions, /throw error;/);
});

test("Gas readings dialog uses the readings-only two-step workflow", () => {
  assert.match(gasDialog, /title=\{step === 1 \? "Upload readings" : "Review readings"\}/);
  assert.match(gasDialog, /Drop readings workbook here/);
  assert.match(gasDialog, /setStep\(1\)/);
  assert.match(gasDialog, /Reviewing\.\.\./);
  assert.doesNotMatch(gasDialog, /Import Gas Workbook|Supplier bills matched|Preflight review|Gas readings matched/);
});

test("Gas Review never enables an empty or incomplete import", () => {
  assert.match(gasDialog, /review\?\.readingSheetDetected/);
  assert.match(gasDialog, /expectedUnitCount > 0/);
  assert.match(gasDialog, /readingCount === expectedUnitCount/);
  assert.match(gasIndex, /const readingSetReady = Boolean\(preflight\.readingSheetDetected\)/);
});

test("Gas Review keeps atomic persistence behind the existing RPCs", () => {
  assert.match(gasIndex, /tb810_sync_gas_reading_import/);
  assert.match(gasIndex, /tb810_sync_dev_gas_reading_import/);
  assert.doesNotMatch(gasDialog, /tb810_sync_/);
});

test("Gas parser tolerates namespace-prefixed OOXML and absolute worksheet targets", () => {
  const importer = readFileSync(new URL("./import.ts", import.meta.url), "utf8");
  assert.match(importer, /<\(\?:\[\\w\.\-\]\+:\)\?row/);
  assert.match(importer, /target\.startsWith\("\/"\) \? target\.slice\(1\)/);
  assert.match(importer, /normalizeReadingDate/);
});

test("Gas Review preserves the selected workbook for confirmed import", () => {
  assert.match(gasDialog, /name="workbook"/);
  assert.match(gasDialog, /if \(step === 1\)/);
  assert.doesNotMatch(gasDialog, /importRequested|visibleStep/);
  assert.match(gasDialog, /name="confirmed_readings"/);
  assert.match(gasDialog, /name="confirmed" value="true"/);
  assert.match(gasActions, /confirmed_readings/);
  assert.match(gasActions, /file instanceof File && file.size > 0 \? file : null/);
});

test("Gas confirmed import revalidates only the selected readings route", () => {
  assert.match(gasActions, /if \(confirmed\) revalidatePath\(`\/gas\/unit-gas-readings\/\$\{targetReadingMonth\}`\)/);
});

test("Gas import success closes and refreshes the dialog without a browser reload", () => {
  assert.match(gasDialog, /useRouter/);
  assert.match(gasDialog, /router\.refresh\(\)/);
  assert.match(gasDialog, /if \(pending \|\| !state\.success \|\| state\.review\) return/);
  assert.match(gasDialog, /router\.refresh\(\);\s*queueMicrotask\(\(\) => handleOpenChange\(false\)\);/);
  assert.doesNotMatch(gasDialog, /setTimeout|GAS_IMPORT_TRACE/);
  assert.doesNotMatch(gasDialog, /window\.location\.reload|location\.reload/);
});

test("Gas Review remains on Step 2 while confirmed import is the only close path", () => {
  assert.match(gasDialog, /title=\{step === 1 \? "Upload readings" : "Review readings"\}/);
  assert.match(gasDialog, /\{step === 2 && review \?/);
  assert.match(gasDialog, /onClick=\{\(\) => setStep\(1\)\}/);
  assert.match(gasDialog, /\{state\.error \? <p className="text-red-700">\{state\.error\}<\/p> : null\}/);
});
