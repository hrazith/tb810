import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../../app/(staff)/gas/unit-gas-readings/_components/gas-reading-ledger-panel.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

test("Gas inline rows route persisted readings through update and missing readings through create", () => {
  assert.match(panel, /gasReadingMutationKind\(row\.reading_id\)/);
  assert.match(panel, /useActionState\(action, initialState\)/);
  assert.match(panel, /name="reading_id" value=\{row\.reading_id\}/);
});

test("Gas reading actions map database errors to friendly UI messages", () => {
  assert.match(actions, /function userFacingGasReadingError/);
  assert.match(actions, /Unable to save this Gas data/);
  const readingActions = actions.slice(actions.indexOf("export async function createGasReadingAction"));
  assert.doesNotMatch(readingActions, /return \{ error: result\.error, values: toValues\(formData\) \}/);
});

test("Gas inline saves revalidate the canonical monthly workspace route", () => {
  const readingActions = actions.slice(actions.indexOf("export async function createGasReadingAction"));
  assert.match(readingActions, /revalidatePath\(gasReadingRoute\(formData\)\)/);
  assert.equal((readingActions.match(/revalidatePath\(gasReadingRoute\(formData\)\)/g) ?? []).length, 2);
  assert.match(actions, /return `\/gas\/unit-gas-readings\/\$\{String\(formData\.get\("reading_month"\) \?\? ""\)\.slice\(0, 7\)\}`/);
});

test("Gas inline rows suppress generic validation copy when field errors are present", () => {
  assert.match(panel, /state\.error && !state\.fieldErrors/);
});

test("Gas Reading Date semantic errors are mapped to the Reading Date field", () => {
  assert.match(actions, /function gasReadingFieldError/);
  assert.match(actions, /fieldErrors: gasReadingFieldError\(error\)/);
  assert.match(actions, /reading_date: error/);
});

test("Gas system errors remain available as row-level errors", () => {
  assert.match(panel, /state\.error && !state\.fieldErrors/);
});
