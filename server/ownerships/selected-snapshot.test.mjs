import test from "node:test";
import assert from "node:assert/strict";
import createJiti from "jiti";
import { resolve } from "node:path";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": resolve(process.cwd()),
  },
});
const {
  buildSelectedUnitOwnershipSnapshotFromFacts,
} = jiti("./index.ts");

test("selected unit ownership snapshot preserves ownership classifications and account facts", () => {
  const snapshot = buildSelectedUnitOwnershipSnapshotFromFacts(
    {
      ownershipRows: [
        {
          id: "ownership-current",
          owner_id: "owner-current",
          unit_id: "unit-201",
          start_date: "2026-08-01",
          end_date: null,
          notes: "current",
          legacy_table: null,
          legacy_id: null,
          legacy_metadata: null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
          owner: {
            id: "owner-current",
            full_name: "Current Owner",
            owner_reference: "OWN-1",
            active: true,
          },
        },
        {
          id: "ownership-scheduled",
          owner_id: "owner-scheduled",
          unit_id: "unit-201",
          start_date: "2026-09-01",
          end_date: null,
          notes: "scheduled",
          legacy_table: null,
          legacy_id: null,
          legacy_metadata: null,
          created_at: "2026-08-02T00:00:00.000Z",
          updated_at: "2026-08-02T00:00:00.000Z",
          owner: {
            id: "owner-scheduled",
            full_name: "Scheduled Owner",
            owner_reference: "OWN-2",
            active: true,
          },
        },
        {
          id: "ownership-past",
          owner_id: "owner-past",
          unit_id: "unit-201",
          start_date: "2026-07-01",
          end_date: "2026-07-31",
          notes: "past",
          legacy_table: null,
          legacy_id: null,
          legacy_metadata: null,
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          owner: {
            id: "owner-past",
            full_name: "Past Owner",
            owner_reference: "OWN-3",
            active: false,
          },
        },
      ],
      unitAccount: {
        id: "unit-account-201",
        account_number: "UA-201",
        status: "active",
        current_balance: 12.34,
        credit_balance: 0,
      },
    },
    {
      id: "unit-201",
      unit_number: "201",
      unit_type_code: "condo",
      unit_type_name: "Condo",
    },
    "2026-08",
  );

  assert.equal(snapshot.currentOwnership?.owner.full_name, "Current Owner");
  assert.equal(snapshot.currentOwnership?.ownership_status, "current");
  assert.equal(snapshot.scheduledOwnerships.length, 1);
  assert.equal(snapshot.scheduledOwnerships[0]?.owner.full_name, "Scheduled Owner");
  assert.equal(snapshot.ownershipHistory.length, 3);
  assert.equal(snapshot.ownershipHistory[2]?.owner.full_name, "Past Owner");
  assert.deepEqual(snapshot.unitAccount, {
    id: "unit-account-201",
    account_number: "UA-201",
    status: "active",
    current_balance: 12.34,
    credit_balance: 0,
  });
});
