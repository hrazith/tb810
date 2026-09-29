import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
  gasReadingDraftFromCanonical,
  gasReadingMutationKind,
  isGasReadingMonthEditable,
  reconcileGasReadingDraft,
  shouldSubmitGasReading,
} = jiti("./editability.ts");

test("current Gas reading month remains editable for incremental entry", () => {
  assert.equal(isGasReadingMonthEditable("2026-09", false, "2026-09"), true);
});

test("historical Gas reading month is read-only without the existing correction exception", () => {
  assert.equal(isGasReadingMonthEditable("2026-08", false, "2026-09"), false);
});

test("latest ready-for-review correction exception remains available", () => {
  assert.equal(isGasReadingMonthEditable("2026-08", true, "2026-09"), true);
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
