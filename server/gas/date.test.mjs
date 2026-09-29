import assert from "node:assert/strict";
import test from "node:test";
import createJiti from "jiti";
import path from "node:path";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.resolve(process.cwd()),
  },
});
const { gasReadingMonthForImport, isGasReadingDateInMonth } = jiti("./date.ts");

test("Gas reading dates are validated against the explicit operational month", () => {
  assert.equal(isGasReadingDateInMonth("2026-09-16", "2026-09"), true);
  assert.equal(isGasReadingDateInMonth("2026-10-01", "2026-09"), false);
});

test("Gas import persists the explicit target month rather than deriving it from the row date", () => {
  assert.equal(gasReadingMonthForImport("2026-09"), "2026-09-01");
  assert.notEqual(gasReadingMonthForImport("2026-09"), "2026-10-01");
});

test("invalid or fabricated dates are not accepted as physical reading dates", () => {
  assert.equal(isGasReadingDateInMonth("", "2026-09"), false);
  assert.equal(isGasReadingDateInMonth("2026-09-01", "2026-09"), true);
  assert.equal(isGasReadingDateInMonth("2026-09-31", "2026-09"), false);
});
