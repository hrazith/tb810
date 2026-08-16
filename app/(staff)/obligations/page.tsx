import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  changeFutureChargeEconomicsAction,
  createUnitChargeAction,
  stopFutureChargeAction,
} from "@/server/charges/actions";
import { currentMonthKey, monthLabel, nextMonthKey } from "@/server/charges/month";
import { getMonthlyObligationSummary, getUnitMonthlyObligation } from "@/server/obligations";
import { getUnitOwnershipSnapshot } from "@/server/ownerships";
import { listUnits } from "@/server/units";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ unitId?: string; error?: string }>;
};

type FinancialActivity = {
  id: string;
  created_at: string;
  transaction_type: string;
  amount: number;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
};

function formatMoney(value: string | number | null) {
  if (value === null || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatMonthRange(from: string, to: string | null) {
  const start = monthLabel(from);
  if (!to) return `Recurring · ${start}`;
  const end = monthLabel(to);
  return start === end ? `One-off · ${start}` : `${start} – ${end}`;
}

function buildUnitHref(unitId: string, error?: string) {
  const search = new URLSearchParams();
  search.set("unitId", unitId);
  if (error) search.set("error", error);
  return `/obligations?${search.toString()}`;
}

export default async function ObligationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const monthKey = await currentMonthKey();
  const unitsResult = await listUnits();
  if (unitsResult.error) throw new Error(unitsResult.error);

  const eligibleUnits = unitsResult.data.filter((unit) => unit.unit_type_code === "condo");
  const selectedUnit = params.unitId
    ? eligibleUnits.find((unit) => unit.id === params.unitId) ?? null
    : null;

  const selectedObligation = selectedUnit
    ? await getUnitMonthlyObligation({ unitId: selectedUnit.id, obligationMonth: monthKey })
    : null;
  if (selectedObligation?.error) throw new Error(selectedObligation.error);

  const monthlySummary = selectedUnit ? null : await getMonthlyObligationSummary({ obligationMonth: monthKey });
  if (monthlySummary?.error) throw new Error(monthlySummary.error);

  const selectedSnapshot = selectedUnit ? await getUnitOwnershipSnapshot(selectedUnit.id) : null;
  if (selectedSnapshot?.error) throw new Error(selectedSnapshot.error);

  let transactions: FinancialActivity[] = [];
  if (selectedSnapshot?.data?.unitAccount?.id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tb810_account_transactions")
      .select("id, created_at, transaction_type, amount, notes, reference_type, reference_id")
      .eq("unit_account_id", selectedSnapshot.data.unitAccount.id)
      .order("created_at", { ascending: false })
      .limit(10);
    transactions = (data ?? []) as FinancialActivity[];
  }

  const selectedPanel =
    selectedUnit && selectedObligation?.data?.units[0]
      ? {
          unit: selectedUnit,
          obligation: selectedObligation.data.units[0],
        }
      : null;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Obligations</h1>
        
      </div>

      {params.error ? (
        <Panel padding="compact" className="border-red-200 bg-red-50 text-sm text-red-800">
          {params.error}
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)] ">
        <Panel className="space-y-6 ">
              <div className="rounded-[28px] bg-zinc-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <div className="rounded-2xl bg-zinc-950 px-6 py-4 text-center text-xl font-semibold text-white shadow-sm ring-2 ring-sky-500">
                Units
              </div>
              <button
                type="button"
                className="rounded-2xlpx-6 py-4 text-center text-xl font-semibold text-zinc-500"
                aria-disabled="true"
                tabIndex={-1}
              >
                Owners
                <span className="ml-2 text-xs font-medium text-zinc-400">Coming next</span>
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {eligibleUnits.map((unit) => {
                const active = unit.id === selectedUnit?.id;
                return (
                  <Link
                    key={unit.id}
                    href={buildUnitHref(unit.id, params.error)}
                    className={[
                      "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <div className="space-y-8">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className={["text-3xl font-semibold tracking-tight", active ? "text-white" : "text-zinc-950"].join(" ")}>
                            {unit.unit_number}
                          </div>
                          <div className={["text-lg", active ? "text-zinc-300" : "text-zinc-700"].join(" ")}>
                            {unit.current_owner_name ?? "No owner"}
                          </div>
                        </div>
                        <div className={["text-sm font-medium", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                          {unit.participation_percentage ? `${unit.participation_percentage.toFixed(3)}%` : "—"}
                        </div>
                      </div>

                      <div className={["text-sm", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                        {unit.current_owner_reference ?? "Current owner"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel className="space-y-8">
          {!selectedPanel ? (
            <div className="space-y-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">
                    {monthLabel(monthKey)}
                  </div>
                  <div className="mt-2 text-sm text-zinc-600">
                    {eligibleUnits.length} obligation-eligible Units
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Monthly obligations
                  </div>
                  <div className="space-y-3 text-sm text-zinc-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>Fixed assessments</span>
                      <span>{monthlySummary?.data?.components.fixed_assessment.amount ? `S/ ${monthlySummary.data.components.fixed_assessment.amount}` : "S/ —"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Metered water</span>
                      <span>{monthlySummary?.data?.components.metered_water.amount ? `S/ ${monthlySummary.data.components.metered_water.amount}` : "S/ —"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Common water</span>
                      <span>{monthlySummary?.data?.components.common_water.amount ? `S/ ${monthlySummary.data.components.common_water.amount}` : "S/ —"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Gas</span>
                      <span>{monthlySummary?.data?.components.gas.amount ? `S/ ${monthlySummary.data.components.gas.amount}` : "S/ —"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Other charges</span>
                      <span>{monthlySummary?.data?.components.other_charge.amount ? `S/ ${monthlySummary.data.components.other_charge.amount}` : "S/ —"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-3 text-zinc-950">
                      <span className="font-medium">Total</span>
                      <span>{monthlySummary?.data?.total ? `S/ ${monthlySummary.data.total}` : "S/ —"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Invoices
                  </div>
                  <div className="text-sm text-zinc-600">Coming soon</div>
                  <div className="mt-4">
                    <Button type="button" variant="secondary" size="sm" disabled>
                      Download all
                    </Button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Other charges
                  </div>
                  {monthlySummary?.data?.components.other_charge.amount ? (
                    <div className="flex items-center justify-between gap-4 text-sm text-zinc-600">
                      <span>{monthlySummary.data.components.other_charge.count} charges</span>
                      <span>S/ {monthlySummary.data.components.other_charge.amount}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">—</div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
                Select a Unit to inspect its Monthly Obligation.
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">
                    Unit {selectedPanel.unit.unit_number}
                  </div>
                  <div className="mt-2 text-sm text-zinc-600">{monthLabel(monthKey)}</div>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/units/${selectedPanel.unit.unit_number}`}>View account →</Link>
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {selectedPanel.obligation.components.map((component) => (
                  <div key={component.key} className="rounded-[24px] border border-zinc-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">{component.label}</div>
                        <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                          {component.status === "available" ? formatMoney(component.amount) : component.status}
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <div>{component.status}</div>
                        {component.sourceMonth ? <div>{component.sourceMonth}</div> : null}
                      </div>
                    </div>
                    {component.blocker ? <div className="mt-3 text-sm text-zinc-500">{component.blocker}</div> : null}
                  </div>
                ))}

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">Total</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                    {formatMoney(selectedPanel.obligation.knownTotal)}
                  </div>
                </div>
              </div>

              <Panel className="space-y-4 border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950">Other Charges</h3>
                    <p className="text-sm text-zinc-600">Logical source charges for the selected month.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedPanel.obligation.components.find((component) => component.key === "other_charge")?.lineItems?.length ? (
                    selectedPanel.obligation.components
                      .find((component) => component.key === "other_charge")
                      ?.lineItems?.map((lineItem) => (
                        <div
                          key={lineItem.chargeId}
                          className="rounded-[20px] border border-zinc-200 bg-zinc-50 px-4 py-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-base font-medium text-zinc-950">{lineItem.description}</div>
                              <div className="text-sm text-zinc-600">
                                {formatMonthRange(lineItem.effectiveFromMonth, lineItem.effectiveToMonth)}
                              </div>
                            </div>
                            <div className="text-lg font-semibold text-zinc-950">
                              {formatMoney(lineItem.amount)}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <details className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                              <summary className="cursor-pointer list-none">Edit future / stop</summary>
                              <div className="mt-4 grid gap-4 border-t border-zinc-200 pt-4 md:grid-cols-2">
                                {lineItem.effectiveToMonth ? null : (
                                  <form action={changeFutureChargeEconomicsAction} className="space-y-3">
                                    <input type="hidden" name="charge_id" value={lineItem.chargeId} />
                                    <input type="hidden" name="return_to" value={`/obligations?unitId=${selectedPanel.unit.id}`} />
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <Input name="amount" type="number" step="0.01" defaultValue={lineItem.amount} className="h-10" />
                                      <Input name="effective_month" type="month" min={nextMonthKey(monthKey) ?? monthKey} defaultValue={nextMonthKey(monthKey) ?? monthKey} className="h-10" />
                                    </div>
                                    <Button type="submit" variant="secondary" size="sm">
                                      Change future
                                    </Button>
                                  </form>
                                )}

                                <form action={stopFutureChargeAction} className="space-y-3">
                                  <input type="hidden" name="charge_id" value={lineItem.chargeId} />
                                  <input type="hidden" name="return_to" value={`/obligations?unitId=${selectedPanel.unit.id}`} />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Input name="stop_month" type="month" min={nextMonthKey(monthKey) ?? monthKey} defaultValue={nextMonthKey(monthKey) ?? monthKey} className="h-10" />
                                    <Input name="note" type="text" placeholder="Stop note" className="h-10" />
                                  </div>
                                  <Button type="submit" variant="ghost" size="sm">
                                    Stop future
                                  </Button>
                                </form>
                              </div>
                            </details>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
                      No other charges for this unit in {monthLabel(monthKey)}.
                    </div>
                  )}
                </div>

                <details className="group rounded-[24px] border border-zinc-200 bg-white px-5 py-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-zinc-950">
                    + Add charge
                  </summary>
                  <div className="mt-5 border-t border-zinc-200 pt-5">
                    <form action={createUnitChargeAction} className="space-y-4">
                      <input type="hidden" name="return_to" value={`/obligations?unitId=${selectedPanel.unit.id}`} />
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Charge to</span>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950">
                          Unit {selectedPanel.unit.unit_number}
                        </div>
                        <input type="hidden" name="unit_id" value={selectedPanel.unit.id} />
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
                        <select
                          name="schedule"
                          defaultValue="one_off"
                          className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm"
                        >
                          <option value="one_off">One-off</option>
                          <option value="recurring">Recurring</option>
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Starts</span>
                        <Input
                          name="starts_month"
                          type="month"
                          min={nextMonthKey(monthKey) ?? monthKey}
                          defaultValue={nextMonthKey(monthKey) ?? monthKey}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Ends</span>
                        <Input name="ends_month" type="month" min={nextMonthKey(monthKey) ?? monthKey} />
                      </label>
                      <Button type="submit" variant="primary" className="w-full">
                        Save Charge
                      </Button>
                    </form>
                  </div>
                </details>
              </Panel>

              <Panel className="space-y-4 border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950">Recent activity</h3>
                    <p className="text-sm text-zinc-600">Read-only recent financial activity.</p>
                  </div>
                {selectedSnapshot?.data?.unitAccount ? (
                  <div className="text-sm text-zinc-500">
                    Account {selectedSnapshot.data.unitAccount.account_number}
                  </div>
                ) : null}
                </div>

                {transactions.length > 0 ? (
                  <div className="overflow-hidden rounded-[20px] border border-zinc-200">
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
                            <td className="px-3 py-2 text-zinc-950">
                              {tx.notes ?? tx.reference_type ?? tx.reference_id ?? tx.transaction_type}
                            </td>
                            <td className="px-3 py-2 text-zinc-600">{formatMoney(tx.amount)}</td>
                            <td className="px-3 py-2 text-zinc-600">{tx.transaction_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
                    No recent activity.
                  </div>
                )}
              </Panel>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
