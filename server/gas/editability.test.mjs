import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
  gasReadingDraftFromCanonical,
  gasReadingMutationKind,
  reconcileGasReadingDraft,
  shouldSubmitGasReading,
} = jiti("./editability.ts");

test("Gas mutation boundary delegates month editability to the canonical guard", () => {
  const source = readFileSync("server/gas/index.ts", "utf8");
  assert.match(source, /import \{ canEditSourceMonth/);
  assert.match(source, /async function gasReadingMonthEditError\(monthKey: string\)/);
  assert.match(source, /const correction = await canEditSourceMonth\(monthKey\)/);
  for (const functionName of ["createGasReading", "updateGasReading", "deleteGasReading"]) {
    const start = source.indexOf(`export async function ${functionName}`);
    const next = source.indexOf("export async function", start + 1);
    const functionSource = source.slice(start, next === -1 ? undefined : next);
    assert.match(functionSource, /gasReadingMonthEditError\(/, `${functionName} must use the canonical guard`);
  }
});

test("Gas source facts remain editable through handoff and lock after finalization", () => {
  const { isSourceMonthEditable } = jiti("../water/source-editability.ts");
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-08",
    activeMonth: "2026-09",
    consumingPackage: { status: "ready_for_review" },
  }), true);
  for (const status of ["approved", "invoices_generated", "closed"]) {
    assert.equal(isSourceMonthEditable({
      sourceMonth: "2026-08",
      activeMonth: "2026-09",
      consumingPackage: { status },
    }), false);
  }
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-10",
    activeMonth: "2026-09",
    consumingPackage: null,
  }), false);
});

test("existing Gas readings use update while missing readings use create", () => {
  assert.equal(gasReadingMutationKind("reading-201-september"), "update");
  assert.equal(gasReadingMutationKind(null), "create");
});

test("Gas blur submission ignores unchanged, pending, and duplicate Enter/blur saves", () => {
  const committed = { currentReading: "100", readingDate: "2026-09-01" };
  assert.equal(shouldSubmitGasReading(committed, committed, false), false);
  assert.equal(shouldSubmitGasReading(committed, { currentReading: "101", readingDate: "2026-09-01" }, true), false);
  assert.equal(shouldSubmitGasReading(committed, { currentReading: "101", readingDate: "2026-09-01" }, false), true);
});

test("Gas row draft follows refreshed canonical props from populated to empty", () => {
  const populated = { readingId: "reading-201", currentReading: 283, readingDate: "2026-09-01" };
  const empty = { readingId: null, currentReading: null, readingDate: null };
  assert.deepEqual(
    reconcileGasReadingDraft(populated, empty, gasReadingDraftFromCanonical(populated)),
    { currentReading: "", readingDate: "" },
  );
});

test("Gas row draft follows refreshed canonical props from empty to populated", () => {
  const empty = { readingId: null, currentReading: null, readingDate: null };
  const populated = { readingId: "reading-201", currentReading: 283, readingDate: "2026-09-01" };
  assert.deepEqual(
    reconcileGasReadingDraft(empty, populated, gasReadingDraftFromCanonical(empty)),
    { currentReading: "283", readingDate: "2026-09-01" },
  );
});

test("Gas row draft preserves an active local edit while canonical props refresh", () => {
  const populated = { readingId: "reading-201", currentReading: 283, readingDate: "2026-09-01" };
  const refreshed = { readingId: "reading-201", currentReading: 284, readingDate: "2026-09-01" };
  assert.deepEqual(
    reconcileGasReadingDraft(populated, refreshed, { currentReading: "285", readingDate: "2026-09-01" }),
    { currentReading: "285", readingDate: "2026-09-01" },
  );
});
