import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { isHandoffCalendarEligible, isSnapshotProgressedStatus, mapSnapshotResult } = jiti("./pulse.ts");
const context = { buildingId: "building-1", obligationMonth: "2026-09" };

test("incomplete snapshot calculation is not ready", () => {
  assert.equal(mapSnapshotResult({ ...context, result: { data: null, error: "Required gas readings are missing.", failureKind: "not_ready" } }).status, "not_ready");
});

test("successful handoff is reported without snapshot rows", () => {
  assert.equal(mapSnapshotResult({ ...context, result: { data: { billingPeriodId: "period-1", status: "ready_for_review", obligationRowCount: 0 }, error: null } }).status, "handed_off");
});

test("existing and raced snapshots are already progressed", () => {
  assert.equal(isSnapshotProgressedStatus("approved"), true);
  assert.equal(mapSnapshotResult({ ...context, result: { data: { billingPeriodId: "period-1", status: "already_snapshotted", obligationRowCount: 364 }, error: null } }).status, "already_progressed");
});

test("infrastructure errors are preserved", () => {
  assert.equal(mapSnapshotResult({ ...context, result: { data: null, error: "RPC unavailable", failureKind: "error" } }).status, "error");
});

test("handoff is calendar eligible only when the obligation month has begun", () => {
  assert.equal(isHandoffCalendarEligible("2026-10", "2026-09"), false);
  assert.equal(isHandoffCalendarEligible("2026-10", "2026-10"), true);
});

test("calendar-ineligible pulse results remain distinct from incomplete facts", () => {
  assert.equal(mapSnapshotResult({ ...context, result: { data: null, error: "October is not eligible yet.", failureKind: "not_eligible" } }).status, "not_eligible");
  assert.equal(mapSnapshotResult({ ...context, result: { data: null, error: "Required readings are missing.", failureKind: "not_ready" } }).status, "not_ready");
});
