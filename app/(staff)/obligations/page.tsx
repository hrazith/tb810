import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { currentMonthKey, monthLabel } from "@/server/charges/month";
import { getMonthlyObligationSummary, getOwnerMonthlyObligation, getUnitMonthlyObligation } from "@/server/obligations";
import { getOwnerUnitsForBillingMonth, getUnitOwnershipSnapshot } from "@/server/ownerships";
import { listOwners } from "@/server/owners";
import { listUnits } from "@/server/units";

type PageProps = {
  searchParams: Promise<{
    mode?: "owners" | "units";
    ownerId?: string;
    unitId?: string;
    error?: string;
  }>;
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

function formatComponentValue(status: string, amount: string | null) {
  return status === "available" ? formatMoney(amount) : status === "not_applicable" ? "—" : status;
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/obligations${search.toString() ? `?${search.toString()}` : ""}`;
}

function buildUnitHref(unitId: string, mode: "units" | "owners", error?: string) {
  return buildQuery({ mode, unitId, error });
}

function buildOwnerHref(ownerId: string, error?: string) {
  return buildQuery({ mode: "owners", ownerId, error });
}

function componentLabel(key: string) {
  switch (key) {
    case "fixed_assessment":
      return "Fixed assessments";
    case "metered_water":
      return "Metered water";
    case "common_water":
      return "Common water";
    case "gas":
      return "Gas";
    case "other_charge":
      return "Other charges";
    default:
      return key;
  }
}

export default async function ObligationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const monthKey = await currentMonthKey();
  const mode = params.mode ?? "owners";

  const unitsResult = await listUnits();
  if (unitsResult.error) throw new Error(unitsResult.error);
  const eligibleUnits = unitsResult.data.filter((unit) => unit.unit_type_code === "condo");

  const ownersResult = await listOwners({ status: "active" });
  if (ownersResult.error) throw new Error(ownersResult.error);

  const selectedUnit = mode === "units" && params.unitId
    ? eligibleUnits.find((unit) => unit.id === params.unitId) ?? null
    : null;
  const selectedOwner = mode === "owners" && params.ownerId
    ? ownersResult.data.find((owner) => owner.id === params.ownerId) ?? null
    : null;

  const selectedObligation = selectedUnit
    ? await getUnitMonthlyObligation({ unitId: selectedUnit.id, obligationMonth: monthKey })
    : null;
  if (selectedObligation?.error) throw new Error(selectedObligation.error);

  const selectedOwnerObligation = selectedOwner
    ? await getOwnerMonthlyObligation({ ownerId: selectedOwner.id, obligationMonth: monthKey })
    : null;
  if (selectedOwnerObligation?.error) throw new Error(selectedOwnerObligation.error);
  const selectedOwnerUnits = selectedOwner
    ? await getOwnerUnitsForBillingMonth(selectedOwner.id, monthKey)
    : null;
  if (selectedOwnerUnits?.error) throw new Error(selectedOwnerUnits.error);

  const monthlySummary = !selectedUnit && !selectedOwner
    ? await getMonthlyObligationSummary({ obligationMonth: monthKey })
    : null;
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

  const selectedUnitPanel =
    selectedUnit && selectedObligation?.data?.units[0]
      ? {
          unit: selectedUnit,
          obligation: selectedObligation.data.units[0],
        }
      : null;

  const ownerComponentRows = selectedOwnerObligation?.data
    ? [
        {
          key: "fixed_assessment",
          ...selectedOwnerObligation.data.componentSummary.fixed_assessment,
        },
        {
          key: "metered_water",
          ...selectedOwnerObligation.data.componentSummary.metered_water,
        },
        {
          key: "common_water",
          ...selectedOwnerObligation.data.componentSummary.common_water,
        },
        {
          key: "gas",
          ...selectedOwnerObligation.data.componentSummary.gas,
        },
        {
          key: "other_charge",
          ...selectedOwnerObligation.data.componentSummary.other_charge,
        },
      ]
    : [];
  const ownerUnitTypeByNumber = new Map(
    (selectedOwnerUnits?.data ?? []).map((unit) => [unit.unit_number, unit.unit_type_code] as const),
  );

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

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel className="space-y-6">
          <div className="rounded-[28px] bg-zinc-100 p-1">
            <div className="grid grid-cols-2 gap-1">
              <Link
                href={buildQuery({ mode: "owners", ownerId: selectedOwner?.id, unitId: undefined })}
                className={[
                  "rounded-2xl px-6 py-4 text-center text-xl font-semibold transition",
                  mode === "owners" ? "bg-zinc-950 text-white shadow-sm ring-2 ring-sky-500" : "text-zinc-500",
                ].join(" ")}
              >
                Owners
              </Link>
              <Link
                href={buildQuery({ mode: "units", unitId: selectedUnit?.id, ownerId: undefined })}
                className={[
                  "rounded-2xl px-6 py-4 text-center text-xl font-semibold transition",
                  mode === "units" ? "bg-zinc-950 text-white shadow-sm ring-2 ring-sky-500" : "text-zinc-500",
                ].join(" ")}
              >
                Units
              </Link>
            </div>
          </div>

          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
            {mode === "owners" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {ownersResult.data.map((owner) => {
                  const active = owner.id === selectedOwner?.id;
                  return (
                    <Link
                      key={owner.id}
                      href={buildOwnerHref(owner.id, params.error)}
                      className={[
                        "block rounded-[28px] border px-6 py-6 shadow-[0_1px_0_rgba(15,23,42,0.05)] transition",
                        active
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <div className={["text-2xl font-semibold tracking-tight", active ? "text-white" : "text-zinc-950"].join(" ")}>
                            {owner.full_name}
                          </div>
                          <div className={["text-sm", active ? "text-zinc-300" : "text-zinc-600"].join(" ")}>
                            {owner.owner_reference}
                          </div>
                        </div>
                        <div className={["text-sm font-medium", active ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                          {owner.unit_count} Units
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {eligibleUnits.map((unit) => {
                  const active = unit.id === selectedUnit?.id;
                  return (
                    <Link
                      key={unit.id}
                      href={buildUnitHref(unit.id, "units", params.error)}
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
            )}
          </div>
        </Panel>

        <Panel className="space-y-8">
          {!selectedOwner && !selectedUnit ? (
            <div className="space-y-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">{monthLabel(monthKey)}</div>
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
                      <span>{formatComponentValue(monthlySummary?.data?.components.fixed_assessment.state ?? "available", monthlySummary?.data?.components.fixed_assessment.amount ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Metered water</span>
                      <span>{formatComponentValue(monthlySummary?.data?.components.metered_water.state ?? "available", monthlySummary?.data?.components.metered_water.amount ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Common water</span>
                      <span>{formatComponentValue(monthlySummary?.data?.components.common_water.state ?? "available", monthlySummary?.data?.components.common_water.amount ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Gas</span>
                      <span>{formatComponentValue(monthlySummary?.data?.components.gas.state ?? "available", monthlySummary?.data?.components.gas.amount ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Other charges</span>
                      <span>{formatComponentValue(monthlySummary?.data?.components.other_charge.state ?? "available", monthlySummary?.data?.components.other_charge.amount ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Owner-direct charges</span>
                      <span>S/ —</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-3 text-zinc-950">
                      <span className="font-medium">Total</span>
                      <span>{monthlySummary?.data?.total ? `S/ ${monthlySummary.data.total}` : "S/ —"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Invoices</div>
                  <div className="text-sm text-zinc-600">Coming soon</div>
                  <div className="mt-4">
                    <Button type="button" variant="secondary" size="sm" disabled>
                      Download all
                    </Button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Other charges</div>
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
                Select an Owner or Unit to inspect its Monthly Obligation.
              </div>
            </div>
          ) : selectedOwner && selectedOwnerObligation?.data ? (
            <div className="space-y-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">{selectedOwner.full_name}</div>
                  <div className="mt-2 text-sm text-zinc-600">
                    {selectedOwner.owner_reference} · {monthLabel(monthKey)} · {selectedOwnerObligation.data.ownedUnitCount} responsible Units
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {ownerComponentRows.map((component) => (
                  <div key={component.key} className="rounded-[24px] border border-zinc-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">{componentLabel(component.key)}</div>
                        <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                          {component.state === "available" ? formatMoney(component.amount) : component.state}
                        </div>
                      </div>
                        <div className="text-right text-xs text-zinc-500">
                        <div>{component.state === "not_applicable" ? "—" : component.state}</div>
                        <div>{component.reason ? component.reason : ""}</div>
                      </div>
                    </div>
                    {component.reason ? <div className="mt-3 text-sm text-zinc-500">{component.reason}</div> : null}
                  </div>
                ))}

                <div className="rounded-[24px] border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">Owner-direct charges</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                    {selectedOwnerObligation.data.ownerDirectCharges.state === "available"
                      ? formatMoney(selectedOwnerObligation.data.ownerDirectCharges.amount)
                      : selectedOwnerObligation.data.ownerDirectCharges.state}
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {selectedOwnerObligation.data.ownerDirectCharges.count}
                  </div>
                  {selectedOwnerObligation.data.ownerDirectCharges.reason ? (
                    <div className="mt-3 text-sm text-zinc-500">{selectedOwnerObligation.data.ownerDirectCharges.reason}</div>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-white p-5">
                  <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">Consolidated owner</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                    {selectedOwnerObligation.data.total.state === "available"
                      ? formatMoney(selectedOwnerObligation.data.total.amount)
                      : selectedOwnerObligation.data.total.state}
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">{selectedOwnerObligation.data.readiness}</div>
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                {selectedOwnerObligation.data.obligation.units.map((unit) => {
                  const unitType =
                    ownerUnitTypeByNumber.get(unit.unitNumber) === "parking"
                      ? "Parking"
                      : ownerUnitTypeByNumber.get(unit.unitNumber) === "storage"
                        ? "Storage"
                        : "Residential";
                  return (
                    <div key={unit.unitId} className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                      <div className="text-lg font-semibold text-zinc-950">{unit.unitNumber}</div>
                      <div className="text-sm text-zinc-500">{unitType}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-zinc-950">
                            {unit.readiness === "ready" || unit.readiness === "in_progress" ? formatMoney(unit.knownTotal) : unit.readiness}
                          </div>
                          <div className="text-sm text-zinc-500">{unit.readiness}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                        {unit.components.map((component) => (
                          <div key={component.key} className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 px-3 py-2">
                            <span>{componentLabel(component.key)}</span>
                            <span>
                              {component.status === "available" ? formatMoney(component.amount) : component.status}
                            </span>
                          </div>
                        ))}
                      </div>

                      {unit.blockers.length > 0 ? (
                        <div className="mt-3 text-sm text-zinc-500">{unit.blockers.join(" · ")}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : selectedUnit && selectedUnitPanel ? (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">Unit {selectedUnitPanel.unit.unit_number}</div>
                  <div className="mt-2 text-sm text-zinc-600">{monthLabel(monthKey)}</div>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/units/${selectedUnitPanel.unit.unit_number}`}>View account →</Link>
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {selectedUnitPanel.obligation.components.map((component) => (
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
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Monthly charges</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-zinc-600">
                    <span>Current obligation</span>
                    <span>{formatMoney(selectedUnitPanel.obligation.knownTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-zinc-600">
                    <span>Ready state</span>
                    <span>{selectedUnitPanel.obligation.readiness}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Current owner</div>
                <div className="text-lg font-medium text-zinc-950">{selectedUnitPanel.unit.current_owner_name ?? "No owner"}</div>
                <div className="text-sm text-zinc-500">{selectedUnitPanel.unit.current_owner_reference ?? "Current owner"}</div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent account activity</div>
                {transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between gap-4 text-sm text-zinc-600">
                        <span>{transaction.transaction_type}</span>
                        <span>{formatMoney(transaction.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">No recent activity found.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-4xl font-semibold tracking-tight text-zinc-950">{monthLabel(monthKey)}</div>
                  <div className="mt-2 text-sm text-zinc-600">{eligibleUnits.length} obligation-eligible Units</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
                Select an Owner or Unit to inspect its Monthly Obligation.
              </div>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
