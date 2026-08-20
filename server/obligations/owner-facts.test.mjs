import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});

const { monthKeyToDate } = jiti("./owner-facts.ts");

test("building month facts RPC receives a SQL date for source reading month", () => {
  assert.equal(monthKeyToDate("2026-07"), "2026-07-01");
  assert.equal(monthKeyToDate("2026-08"), "2026-08-01");
});
