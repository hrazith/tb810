import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createUnitChargeAction, changeFutureChargeEconomicsAction, stopFutureChargeAction } from "@/server/charges/actions";
import { currentMonthKey, nextMonthKey } from "@/server/charges/month";
import { getCurrentBuilding, listUnits } from "@/server/units";
import { getUnitOwnershipSnapshot } from "@/server/ownerships";
import { listCharges } from "@/server/charges";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ unitId?: string; error?: string }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function ObligationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) throw new Error(buildingResult.error);
  const unitsResult = await listUnits();
  if (unitsResult.error) throw new Error(unitsResult.error);
  const chargesResult = await listCharges();
  if (chargesResult.error) throw new Error(chargesResult.error);

  const selectedUnitId = params.unitId ?? unitsResult.data[0]?.id ?? null;
  const selectedUnit = unitsResult.data.find((unit) => unit.id === selectedUnitId) ?? null;
  const unitSnapshot = selectedUnit ? await getUnitOwnershipSnapshot(selectedUnit.id) : null;

  let transactions: Array<{
    id: string;
    created_at: string;
    transaction_type: string;
    amount: number;
    notes: string | null;
    reference_type: string | null;
    reference_id: string | null;
  }> = [];

  if (unitSnapshot?.data?.unitAccount?.id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tb810_account_transactions")
      .select("id, created_at, transaction_type, amount, notes, reference_type, reference_id")
      .eq("unit_account_id", unitSnapshot.data.unitAccount.id)
      .order("created_at", { ascending: false })
      .limit(10);
    transactions = (data ?? []) as typeof transactions;
  }

  const currentMonth = await currentMonthKey();
  const nextStartMonth = nextMonthKey(currentMonth) ?? currentMonth;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Obligations</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Charges</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Source charges for Units. Unit-side charges flow into Monthly Obligations through the
          `other_charge` component.
        </p>
      </div>

      {params.error ? (
        <Panel padding="compact" className="border-red-200 bg-red-50 text-sm text-red-800">
          {params.error}
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Charges</h2>
              <p className="text-sm text-zinc-600">Logical source charges, shown once.</p>
            </div>
            <div className="text-sm text-zinc-500">{chargesResult.data.length} charges</div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Starts</th>
                  <th className="px-4 py-3">Ends</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {chargesResult.data.map((charge) => (
                  <tr key={charge.series_id}>
                    <td className="px-4 py-3 text-zinc-700">
                      {charge.target_label}{charge.target_unit_number ? ` ${charge.target_unit_number}` : ""}
                    </td>
                    <td className="px-4 py-3 text-zinc-950">{charge.description}</td>
                    <td className="px-4 py-3 text-zinc-700">{formatMoney(charge.current_amount)}</td>
                    <td className="px-4 py-3 text-zinc-700">{charge.schedule === "one_off" ? "One-off" : "Monthly"}</td>
                    <td className="px-4 py-3 text-zinc-700">{charge.current_effective_from_month}</td>
                    <td className="px-4 py-3 text-zinc-700">{charge.current_effective_to_month ?? "Ongoing"}</td>
                    <td className="px-4 py-3 text-zinc-700">{charge.state}</td>
                    <td className="px-4 py-3">
                      {charge.schedule === "recurring" ? (
                        <div className="flex flex-col gap-2">
                          <form action={changeFutureChargeEconomicsAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="charge_id" value={charge.id} />
                            <input type="hidden" name="return_to" value="/obligations" />
                            <Input name="amount" type="number" step="0.01" defaultValue={charge.current_amount} className="h-10 w-28" />
                            <Input name="effective_month" type="month" min={nextStartMonth} defaultValue={nextStartMonth} className="h-10 w-36" />
                            <Button type="submit" variant="secondary" size="sm">Change</Button>
                          </form>
                          <form action={stopFutureChargeAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="charge_id" value={charge.id} />
                            <input type="hidden" name="return_to" value="/obligations" />
                            <Input name="stop_month" type="month" min={nextStartMonth} defaultValue={nextStartMonth} className="h-10 w-36" />
                            <Input name="note" type="text" placeholder="Stop note" className="h-10 w-48" />
                            <Button type="submit" variant="ghost" size="sm">Stop future</Button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">One-off</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">+ Charge</h2>
              <p className="text-sm text-zinc-600">Create a Unit charge. Owner is hidden for Sprint 4A.</p>
            </div>
            <form action={createUnitChargeAction} className="space-y-4">
              <input type="hidden" name="return_to" value="/obligations" />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Unit</span>
                <select name="unit_id" defaultValue={selectedUnit?.id ?? ""} className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm">
                  {unitsResult.data.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.unit_number}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Description</span>
                <Input name="description" placeholder="Lavanderia" />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Amount</span>
                <Input name="amount" type="number" step="0.01" placeholder="30.00" />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Schedule</span>
                <select name="schedule" defaultValue="one_off" className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm">
                  <option value="one_off">One-off</option>
                  <option value="recurring">Recurring</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Starts</span>
                <Input name="starts_month" type="month" min={nextStartMonth} defaultValue={nextStartMonth} />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Ends</span>
                <Input name="ends_month" type="month" min={nextStartMonth} />
              </label>
              <Button type="submit" variant="primary" className="w-full">Save Charge</Button>
            </form>
          </Panel>

          <Panel className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">Unit context</h2>
                <p className="text-sm text-zinc-600">Read-only recent financial activity.</p>
              </div>
              {selectedUnit ? <Button asChild variant="secondary" size="sm"><Link href={`/units/${selectedUnit.unit_number}`}>View account</Link></Button> : null}
            </div>
            <form method="get" className="space-y-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700">Selected unit</span>
                <select name="unitId" defaultValue={selectedUnit?.id ?? ""} className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm">
                  {unitsResult.data.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.unit_number}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary" className="w-full">Show unit</Button>
            </form>
            {selectedUnit ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-600">
                  {unitSnapshot?.data?.unitAccount ? (
                    <>
                      <div>Account: {unitSnapshot.data.unitAccount.account_number}</div>
                      <div>Current balance: {unitSnapshot.data.unitAccount.current_balance.toFixed(2)}</div>
                    </>
                  ) : (
                    <div>No account snapshot.</div>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl border border-zinc-200">
                  <table className="min-w-full divide-y divide-zinc-200 text-xs">
                    <thead className="bg-zinc-50 text-left font-semibold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Description / Reference</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="px-3 py-2 text-zinc-600">{tx.created_at.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-zinc-950">{tx.notes ?? tx.reference_type ?? tx.reference_id ?? tx.transaction_type}</td>
                          <td className="px-3 py-2 text-zinc-600">{tx.amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-zinc-600">{tx.transaction_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </section>
  );
}
