import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": process.cwd(),
  },
});

const { ownerChargeInputSchema } = jiti("./validation.ts");
const { validateChargeLifecycleInput } = jiti("./index.ts");

test("owner-direct charge input rejects stray unit target fields and validates required owner target", () => {
  const parsed = ownerChargeInputSchema.safeParse({
    owner_id: "owner-1",
    unit_id: "unit-1",
    description: "Owner charge",
    amount: 100,
    schedule: "one_off",
    starts_month: "2026-09",
    ends_month: "",
  });

  assert.equal(parsed.success, false);

  const valid = ownerChargeInputSchema.safeParse({
    owner_id: "owner-1",
    description: "Owner charge",
    amount: 100,
    schedule: "one_off",
    starts_month: "2026-09",
    ends_month: "",
  });

  assert.equal(valid.success, true);
});

test("shared charge lifecycle validation applies the same next-month cutoff and end-month rules", () => {
  const future = validateChargeLifecycleInput({
    schedule: "recurring",
    starts_month: "2026-09",
    ends_month: "2026-10",
    currentMonth: "2026-08",
  });
  assert.equal(future.error, null);
  assert.equal(future.effectiveFromMonth, "2026-09-01");
  assert.equal(future.effectiveToMonth, "2026-10-01");

  const past = validateChargeLifecycleInput({
    schedule: "one_off",
    starts_month: "2026-08",
    ends_month: null,
    currentMonth: "2026-08",
  });
  assert.match(past.error ?? "", /Start month cannot be before 2026-09\./);

  const invalidEnd = validateChargeLifecycleInput({
    schedule: "recurring",
    starts_month: "2026-09",
    ends_month: "2026-08",
    currentMonth: "2026-08",
  });
  assert.match(invalidEnd.error ?? "", /End month cannot be before the start month\./);
});
