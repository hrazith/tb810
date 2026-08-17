import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import {
  createUnitChargeAction,
  deleteFutureChargeAction,
  editFutureChargeAction,
} from "@/server/charges/actions";
import { getUpcomingOwnerDirectChargesForObligationMonth, getUpcomingUnitChargesForObligationMonth } from "@/server/charges";
import { currentMonthKey, monthLabel, nextMonthKey } from "@/server/charges/month";
import { getMonthlyObligationSummary, getOwnerMonthlyObligation, getUnitMonthlyObligation } from "@/server/obligations";
import { getUnitOwnershipSnapshot } from "@/server/ownerships";
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

  const unitsResult = mode === "units" ? await listUnits() : null;
  if (unitsResult?.error) throw new Error(unitsResult.error);
  const eligibleUnits = unitsResult?.data.filter((unit) => unit.unit_type_code === "condo") ?? [];

  const ownersResult = mode === "owners" ? await listOwners({ status: "active" }) : null;
  if (ownersResult?.error) throw new Error(ownersResult.error);

  const selectedUnit = mode === "units" && params.unitId
    ? eligibleUnits.find((unit) => unit.id === params.unitId) ?? null
    : null;
  const selectedOwner = mode === "owners" && params.ownerId
    ? ownersResult?.data.find((owner) => owner.id === params.ownerId) ?? null
    : null;

  const selectedObligation = selectedUnit
    ? await getUnitMonthlyObligation({ unitId: selectedUnit.id, obligationMonth: monthKey })
    : null;
  if (selectedObligation?.error) throw new Error(selectedObligation.error);

  const selectedOwnerObligation = selectedOwner
    ? await getOwnerMonthlyObligation({ ownerId: selectedOwner.id, obligationMonth: monthKey })
    : null;
  if (selectedOwnerObligation?.error) throw new Error(selectedOwnerObligation.error);

  const selectedOwnerUpcomingCharges = selectedOwner
    ? await getUpcomingOwnerDirectChargesForObligationMonth(selectedOwner.id, monthKey)
    : null;
  if (selectedOwnerUpcomingCharges?.error) throw new Error(selectedOwnerUpcomingCharges.error);

  const selectedUnitUpcomingCharges = selectedUnit
    ? await getUpcomingUnitChargesForObligationMonth(selectedUnit.id, monthKey)
    : null;
  if (selectedUnitUpcomingCharges?.error) throw new Error(selectedUnitUpcomingCharges.error);

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
                {ownersResult?.data.map((owner) => {
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

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5 md:col-span-2">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Upcoming owner-direct charges
                  </div>
                  {selectedOwnerUpcomingCharges?.data && selectedOwnerUpcomingCharges.data.length > 0 ? (
                    <div className="space-y-3">
                      {selectedOwnerUpcomingCharges.data.map((charge) => (
                        <div key={charge.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="text-base font-semibold text-zinc-950">{charge.description}</div>
                              <div className="mt-1 text-sm text-zinc-600">
                                {charge.schedule === "one_off" ? "One-off" : "Recurring"}
                              </div>
                              <div className="mt-1 text-sm text-zinc-600">
                                Starts {monthLabel(charge.effective_from_month.slice(0, 7))}
                              </div>
                              {charge.effective_to_month ? (
                                <div className="mt-1 text-sm text-zinc-600">
                                  Ends {monthLabel(charge.effective_to_month.slice(0, 7))}
                                </div>
                              ) : null}
                              {charge.stop_note ? (
                                <div className="mt-1 text-sm text-zinc-500">{charge.stop_note}</div>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-semibold text-zinc-950">{formatMoney(charge.amount)}</div>
                              <div className="text-sm text-zinc-500">Owner-direct</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">No upcoming owner-direct charges.</div>
                  )}
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
                  return (
                    <div key={unit.unitId} className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-zinc-950">{unit.unitNumber}</div>
                          <div className="text-sm text-zinc-500">
                            {unit.unitTypeCode === "parking"
                              ? "Parking"
                              : unit.unitTypeCode === "storage"
                                ? "Storage"
                                : "Residential"}
                          </div>
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

              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Upcoming charges</div>
                {selectedUnitUpcomingCharges?.data && selectedUnitUpcomingCharges.data.length > 0 ? (
                  <div className="space-y-3">
                    {selectedUnitUpcomingCharges.data.map((charge) => (
                      <div key={charge.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold text-zinc-950">{charge.description}</div>
                            <div className="mt-1 text-sm text-zinc-600">
                              {charge.schedule === "one_off" ? "One-off" : "Recurring"}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600">
                              Starts {monthLabel(charge.effective_from_month.slice(0, 7))}
                            </div>
                            {charge.effective_to_month ? (
                              <div className="mt-1 text-sm text-zinc-600">
                                Ends {monthLabel(charge.effective_to_month.slice(0, 7))}
                              </div>
                            ) : null}
                            {charge.stop_note ? (
                              <div className="mt-1 text-sm text-zinc-500">{charge.stop_note}</div>
                            ) : null}
                            <div className="mt-4 flex flex-wrap gap-2">
                              <details className="group">
                                <summary className="cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400">
                                  Edit
                                </summary>
                                <div className="mt-3 w-[min(32rem,80vw)] rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                  <form action={editFutureChargeAction} className="space-y-3">
                                    <input type="hidden" name="return_to" value={`/obligations?mode=units&unitId=${selectedUnitPanel.unit.id}`} />
                                    <input type="hidden" name="charge_id" value={charge.id} />
                                    <label className="block space-y-2">
                                      <span className="text-sm font-medium text-zinc-700">Description</span>
                                      <Input name="description" defaultValue={charge.description} />
                                    </label>
                                    <label className="block space-y-2">
                                      <span className="text-sm font-medium text-zinc-700">Amount</span>
                                      <Input name="amount" type="number" step="0.01" defaultValue={charge.amount} />
                                    </label>
                                    <label className="block space-y-2">
                                      <span className="text-sm font-medium text-zinc-700">Schedule</span>
                                      <select
                                        name="schedule"
                                        defaultValue={charge.schedule}
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
                                        defaultValue={charge.effective_from_month.slice(0, 7)}
                                      />
                                    </label>
                                    <label className="block space-y-2">
                                      <span className="text-sm font-medium text-zinc-700">Ends</span>
                                      <Input
                                        name="ends_month"
                                        type="month"
                                        min={nextMonthKey(monthKey) ?? monthKey}
                                        defaultValue={charge.effective_to_month?.slice(0, 7) ?? ""}
                                      />
                                    </label>
                                    <Button type="submit" variant="primary" className="w-full">
                                      Save Changes
                                    </Button>
                                  </form>
                                </div>
                              </details>
                              <details className="group">
                                <summary className="cursor-pointer rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:border-red-400">
                                  Delete
                                </summary>
                                <div className="mt-3 w-[min(24rem,80vw)] rounded-2xl border border-red-200 bg-red-50 p-4">
                                  <div className="text-sm text-red-900">
                                    This will permanently delete this future charge series before it takes effect.
                                  </div>
                                  <form action={deleteFutureChargeAction} className="mt-3 space-y-3">
                                    <input type="hidden" name="return_to" value={`/obligations?mode=units&unitId=${selectedUnitPanel.unit.id}`} />
                                    <input type="hidden" name="charge_id" value={charge.id} />
                                    <Button type="submit" variant="destructive" className="w-full">
                                      Confirm Delete
                                    </Button>
                                  </form>
                                </div>
                              </details>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-zinc-950">{formatMoney(charge.amount)}</div>
                            <div className="text-sm text-zinc-500">Unit-targeted</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">No upcoming charges.</div>
                )}
              </div>

              <details className="group rounded-[24px] border border-zinc-200 bg-white px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-zinc-950">
                  + Add charge
                </summary>
                <div className="mt-5 border-t border-zinc-200 pt-5">
                  <form action={createUnitChargeAction} className="space-y-4">
                    <input type="hidden" name="return_to" value={`/obligations?unitId=${selectedUnitPanel.unit.id}`} />
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-zinc-700">Charge to</span>
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950">
                        Unit {selectedUnitPanel.unit.unit_number}
                      </div>
                      <input type="hidden" name="unit_id" value={selectedUnitPanel.unit.id} />
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
