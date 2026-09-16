import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { isCronRequestAuthorized } = jiti("./route.ts");

test("cron auth requires an exact bearer secret", () => {
  assert.equal(isCronRequestAuthorized(null, "secret"), false);
  assert.equal(isCronRequestAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isCronRequestAuthorized("Bearer secret", "secret"), true);
  assert.equal(isCronRequestAuthorized("Bearer secret-extra", "secret"), false);
  assert.equal(isCronRequestAuthorized("Bearer secret", undefined), false);
});
