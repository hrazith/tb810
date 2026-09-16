import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { selectFinancialFocus, selectProgressionPackage } = jiti("./package-selection.ts");

function lifecycle(obligationMonth, status = null) {
  return { obligationMonth, mode: status ? "snapshotted" : "live", status };
}

test("September close selects October", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-09", "approved"), upcoming: lifecycle("2026-10") }).obligationMonth, "2026-10");
});

test("incomplete source facts keep October as the candidate", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-09", "approved"), upcoming: lifecycle("2026-10") }).obligationMonth, "2026-10");
});

test("October remains the candidate while live", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-10"), upcoming: lifecycle("2026-11") }).obligationMonth, "2026-10");
});

test("ready for review advances to the immediate successor", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-10", "ready_for_review"), upcoming: lifecycle("2026-11") }).obligationMonth, "2026-11");
});

test("ready for review advances Giuliana financial focus", () => {
  assert.equal(selectFinancialFocus(lifecycle("2026-09", "ready_for_review")), "upcoming");
});

test("approval advances exactly one package", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-10", "approved"), upcoming: lifecycle("2026-11") }).obligationMonth, "2026-11");
});

test("early approval advances from October to November", () => {
  assert.equal(selectProgressionPackage({ current: lifecycle("2026-09", "approved"), upcoming: lifecycle("2026-10", "approved") }).obligationMonth, "2026-11");
});
