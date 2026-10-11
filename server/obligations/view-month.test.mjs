import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { parseRequestedObligationMonth, selectObligationsViewMonth } = jiti("./view-month.ts");
const { businessDateKeyAt } = jiti("@/server/business-date");

// Lima is UTC-5 year-round (no DST).
function limaMonthAt(isoInstant) {
  return businessDateKeyAt(new Date(isoInstant)).slice(0, 7);
}

function defaultViewMonthAt(isoInstant) {
  return selectObligationsViewMonth({ requestedMonth: undefined, calendarMonth: limaMonthAt(isoInstant) });
}

test("October 11 defaults to October", () => {
  assert.equal(defaultViewMonthAt("2026-10-11T15:00:00Z"), "2026-10");
});

test("October 31 defaults to October, including late evening in Lima", () => {
  assert.equal(defaultViewMonthAt("2026-10-31T12:00:00Z"), "2026-10");
  // 23:30 Lima on Oct 31 is already Nov 1 in UTC.
  assert.equal(defaultViewMonthAt("2026-11-01T04:30:00Z"), "2026-10");
});

test("November 1 defaults to November", () => {
  assert.equal(defaultViewMonthAt("2026-11-01T05:00:00Z"), "2026-11");
  assert.equal(defaultViewMonthAt("2026-11-01T15:00:00Z"), "2026-11");
});

test("an explicitly requested month takes precedence over the calendar month", () => {
  assert.equal(selectObligationsViewMonth({ requestedMonth: "2026-09", calendarMonth: "2026-10" }), "2026-09");
  assert.equal(selectObligationsViewMonth({ requestedMonth: "2026-11", calendarMonth: "2026-10" }), "2026-11");
});

test("malformed requested months fall back to the calendar month", () => {
  for (const value of ["", "2026-13", "2026-1", "2026-10-01", "october", "2026-00"]) {
    assert.equal(parseRequestedObligationMonth(value), null, value);
    assert.equal(selectObligationsViewMonth({ requestedMonth: value, calendarMonth: "2026-10" }), "2026-10", value);
  }
});

test("the viewed month has no package lifecycle input, so approval cannot move it", () => {
  // Selection depends only on the request and the calendar; lifecycle state is not a parameter.
  assert.equal(selectObligationsViewMonth.length, 1);
  const page = fs.readFileSync("app/(staff)/obligations/page.tsx", "utf8");
  assert.match(page, /const monthKey = selectObligationsViewMonth\(\{\s*requestedMonth: params\.month,\s*calendarMonth: await getBusinessCalendarMonthKey\(\),\s*\}\);/);
  assert.doesNotMatch(page, /const monthKey = selectGiulianaWorkspaceMonth/);
});

test("approved October still defaults to October while charge defaults keep following the package", () => {
  const page = fs.readFileSync("app/(staff)/obligations/page.tsx", "utf8");
  // Approval may advance the package (workspace) month, but only charge defaults read it.
  assert.match(page, /const workingObligationMonth = workspaceMonth;/);
  assert.equal(defaultViewMonthAt("2026-10-20T15:00:00Z"), "2026-10");
});

test("explicit month survives Obligations navigation and charge redirects", () => {
  const page = fs.readFileSync("app/(staff)/obligations/page.tsx", "utf8");
  const shell = fs.readFileSync("app/(staff)/obligations/_components/obligations-navigation-shell.tsx", "utf8");
  assert.match(page, /month=\{requestedMonth\}/);
  assert.equal((page.match(/\$\{monthParam\}/g) ?? []).length, 5);
  assert.match(shell, /buildObligationsQuery\(\{ \.\.\.params, month: month \?\? undefined \}\)/);
});
