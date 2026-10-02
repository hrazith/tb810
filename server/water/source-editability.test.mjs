import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { isSourceMonthEditable } = jiti("./source-editability.ts");

const activeMonth = "2026-09";

test("past source month remains editable while its package is collecting readings", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-08",
    activeMonth,
    consumingPackage: { status: "collecting_readings" },
  }), true);
});

test("past source month remains editable while its package is handed off but unfinalized", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-08",
    activeMonth,
    consumingPackage: { status: "ready_for_review" },
  }), true);
});

test("source month is immutable after the consuming package is approved", () => {
  for (const status of ["approved", "invoices_generated", "closed"]) {
    assert.equal(isSourceMonthEditable({
      sourceMonth: "2026-08",
      activeMonth,
      consumingPackage: { status },
    }), false);
  }
});

test("current source month remains editable without a consuming package", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: activeMonth,
    activeMonth,
    consumingPackage: null,
  }), true);
});

test("past source month remains editable before its consuming package exists", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-08",
    activeMonth,
    consumingPackage: null,
  }), true);
});

test("current source month is immutable when its consuming package is finalized", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: activeMonth,
    activeMonth,
    consumingPackage: { status: "approved" },
  }), false);
});

test("future source month remains protected until its consuming package exists", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-10",
    activeMonth,
    consumingPackage: null,
  }), false);
});

test("future source month remains unavailable even when a live package exists", () => {
  assert.equal(isSourceMonthEditable({
    sourceMonth: "2026-10",
    activeMonth,
    consumingPackage: { status: "collecting_readings" },
  }), false);
});

test("historical inline rows honor the canonical correction decision", () => {
  const source = readFileSync("app/(staff)/water/unit-meter-readings/_components/current-meter-reading-row.tsx", "utf8");
  assert.match(source, /const editable = !readOnly \|\| canEditHistoricalReadings/);
  assert.match(source, /value=\{devHistoricalEditEnabled \? "true" : "false"\}/);
});
