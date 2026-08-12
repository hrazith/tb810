import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
  parseBusinessDateCookieValue,
  resolveBusinessNowFromCookieValue,
} = jiti("./business-date.ts");

test("valid development business-date cookie is accepted", () => {
  assert.equal(parseBusinessDateCookieValue("2026-08-31"), "2026-08-31");
});

test("invalid development business-date cookie is ignored safely", () => {
  assert.equal(parseBusinessDateCookieValue("2026-08-32"), null);
  assert.equal(parseBusinessDateCookieValue("not-a-date"), null);
});

test("business-date override replaces the active date while preserving UTC month math", () => {
  const fallback = new Date("2026-08-13T12:00:00Z");
  assert.equal(
    resolveBusinessNowFromCookieValue("2026-07-23", fallback).toISOString(),
    "2026-07-23T00:00:00.000Z",
  );
  assert.equal(
    resolveBusinessNowFromCookieValue("2026-08-31", fallback).toISOString(),
    "2026-08-31T00:00:00.000Z",
  );
  assert.equal(
    resolveBusinessNowFromCookieValue("bad-value", fallback).toISOString(),
    fallback.toISOString(),
  );
});
