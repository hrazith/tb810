import Link from "next/link";
import { CaretDown, CaretRight, X } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TB810_BUILDING_ID, TB810_BUILDING_NAME } from "@/server/building";
import {
  createOwnerDirectChargeAction,
  createUnitChargeAction,
  deleteFutureChargeAction,
  editFutureChargeAction,
} from "@/server/charges/actions";
import { getUpcomingUnitChargesForObligationMonth } from "@/server/charges";
import { currentMonthKey, monthLabel, nextMonthKey } from "@/server/charges/month";
import {
  getMonthlyObligationSummary,
  getOwnerMonthlyObligation,
  getUnitMonthlyObligationForBuilding,
} from "@/server/obligations";
import { getSelectedUnitOwnershipSnapshot } from "@/server/ownerships";
import { listOwners } from "@/server/owners";
import { isPerfLoggingEnabled } from "@/server/perf";
import { getSelectedUnitTransactionsForUnit } from "@/server/transactions";
import { listUnitDirectory } from "@/server/units";
import { measure, type TimedResult } from "@/server/perf/timing";
import { ObligationsNavigationShell } from "./_components/obligations-navigation-shell";

type PageProps = {
  searchParams: Promise<{
    mode?: "owners" | "units";
    ownerId?: string;
    unitId?: string;
    error?: string;
  }>;
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

function formatStatusLabel(status: string) {
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  const pageStartedAt = process.hrtime.bigint();
  const params = await searchParams;
  const monthKey = await currentMonthKey();
  const mode = params.mode ?? "owners";

  const unitsMeasurement = await measure(listUnitDirectory());
  const unitsResult = unitsMeasurement?.result ?? null;
  if (unitsResult?.error) throw new Error(unitsResult.error);
  const eligibleUnits = unitsResult?.data.filter((unit) => unit.unit_type_code === "condo") ?? [];

  const ownersMeasurementPromise = mode === "owners" ? measure(listOwners({ status: "active" })) : null;
  const monthlySummaryMeasurementPromise = mode === "owners"
    ? measure(getMonthlyObligationSummary({ obligationMonth: monthKey }))
    : null;

  const [ownersMeasurement, monthlySummaryMeasurement] = await Promise.all([
    ownersMeasurementPromise,
    monthlySummaryMeasurementPromise,
  ]);

  const ownersResult = ownersMeasurement?.result ?? null;
  if (ownersResult?.error) throw new Error(ownersResult.error);

  const selectedUnit = mode === "units" && params.unitId
    ? eligibleUnits.find((unit) => unit.id === params.unitId) ?? null
    : null;
  const selectedOwner = mode === "owners" && params.ownerId
    ? ownersResult?.data.find((owner) => owner.id === params.ownerId) ?? null
    : null;
  const selectedBranchStartedAt = selectedUnit ? process.hrtime.bigint() : null;
  const selectedTransactionsMeasurementPromise: Promise<TimedResult<Awaited<ReturnType<typeof getSelectedUnitTransactionsForUnit>>> | null> = selectedUnit
    ? measure(getSelectedUnitTransactionsForUnit(selectedUnit.id))
    : Promise.resolve(null);

  const selectedObligationMeasurementPromise: Promise<TimedResult<Awaited<ReturnType<typeof getUnitMonthlyObligationForBuilding>>> | null> = selectedUnit
    ? measure(
        getUnitMonthlyObligationForBuilding({
        unit: {
          unitId: selectedUnit.id,
          unitNumber: selectedUnit.unit_number,
          unitAccountId: selectedUnit.id,
          participationPercentage: selectedUnit.participation_percentage ?? null,
        },
        obligationMonth: monthKey,
        buildingId: TB810_BUILDING_ID,
        buildingName: TB810_BUILDING_NAME,
        }),
      )
    : Promise.resolve(null);

  const selectedOwnerObligationMeasurementPromise: Promise<TimedResult<Awaited<ReturnType<typeof getOwnerMonthlyObligation>>> | null> = selectedOwner
    ? measure(getOwnerMonthlyObligation({ ownerId: selectedOwner.id, obligationMonth: monthKey }))
    : Promise.resolve(null);

  const selectedUnitUpcomingChargesMeasurementPromise: Promise<
    TimedResult<Awaited<ReturnType<typeof getUpcomingUnitChargesForObligationMonth>>> | null
  > = selectedUnit
    ? measure(getUpcomingUnitChargesForObligationMonth(selectedUnit.id, monthKey))
    : Promise.resolve(null);

  const monthlySummary = monthlySummaryMeasurement?.result ?? null;
  if (monthlySummary?.error) throw new Error(monthlySummary.error);

  const selectedSnapshotMeasurementPromise: Promise<
    TimedResult<Awaited<ReturnType<typeof getSelectedUnitOwnershipSnapshot>>> | null
  > = selectedUnit
    ? measure(
        getSelectedUnitOwnershipSnapshot({
        unit: {
          id: selectedUnit.id,
          unit_number: selectedUnit.unit_number,
          unit_type_code: selectedUnit.unit_type_code,
        },
        }),
      )
    : Promise.resolve(null);

  const [
    selectedObligationMeasurement,
    selectedOwnerObligationMeasurement,
    selectedUnitUpcomingChargesMeasurement,
    selectedSnapshotMeasurement,
    transactionsMeasurement,
  ] = await Promise.all([
    selectedObligationMeasurementPromise,
    selectedOwnerObligationMeasurementPromise,
    selectedUnitUpcomingChargesMeasurementPromise,
    selectedSnapshotMeasurementPromise,
    selectedTransactionsMeasurementPromise,
  ]);

  const selectedObligation = selectedObligationMeasurement?.result ?? null;
  const selectedOwnerObligation = selectedOwnerObligationMeasurement?.result ?? null;
  const selectedUnitUpcomingCharges = selectedUnitUpcomingChargesMeasurement?.result ?? null;
  const selectedSnapshot = selectedSnapshotMeasurement?.result ?? null;
  const transactions = transactionsMeasurement?.result ?? [];

  if (selectedObligation?.error) throw new Error(selectedObligation.error);
  if (selectedOwnerObligation?.error) throw new Error(selectedOwnerObligation.error);
  if (selectedUnitUpcomingCharges?.error) throw new Error(selectedUnitUpcomingCharges.error);
  if (selectedSnapshot?.error) throw new Error(selectedSnapshot.error);

  if (isPerfLoggingEnabled() && selectedBranchStartedAt) {
    const selectedBranchElapsedMs = Number(process.hrtime.bigint() - selectedBranchStartedAt) / 1_000_000;
    console.info(
      [
        "[OBLIGATIONS_SELECTED_BRANCH_PERF]",
        `unit=${selectedUnit?.unit_number ?? "—"}`,
        `month=${monthKey}`,
        `elapsed_ms=${selectedBranchElapsedMs.toFixed(1)}`,
        `concurrent_helpers=financial,ownership_snapshot,upcoming_charges`,
        `sequential_waits=none`,
      ].join(" "),
    );
  }

  if (isPerfLoggingEnabled()) {
    const pageElapsedMs = Number(process.hrtime.bigint() - pageStartedAt) / 1_000_000;
    console.info(
      [
        "[OBLIGATIONS_PAGE_PERF]",
        `mode=${mode}`,
        `month=${monthKey}`,
        `total_ms=${pageElapsedMs.toFixed(1)}`,
        `unit_directory_ms=${unitsMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `owner_directory_ms=${ownersMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `monthly_summary_ms=${monthlySummaryMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `selected_obligation_ms=${selectedObligationMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `selected_owner_obligation_ms=${selectedOwnerObligationMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `selected_unit_upcoming_charges_ms=${selectedUnitUpcomingChargesMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `selected_snapshot_ms=${selectedSnapshotMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
        `selected_transactions_ms=${transactionsMeasurement?.elapsedMs.toFixed(1) ?? "0.0"}`,
      ].join(" "),
    );
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
    <ObligationsNavigationShell
      mode={mode}
      owners={ownersResult?.data ?? null}
      units={eligibleUnits}
      selectedOwnerId={selectedOwner?.id ?? null}
      selectedUnitId={selectedUnit?.id ?? null}
      error={params.error}
    >
      <div className="space-y-8 p-6 md:p-8 ">
        {!selectedOwner && !selectedUnit ? (
          <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="text-3xl font-semibold tracking-tight text-zinc-950">{monthLabel(monthKey)}</div>
            </div>

            <div className="space-y-6 ">
              <h3 className="mb-4 text-sm font-semibold uppercase text-zinc-500">Obligations</h3>
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
                      <span>{formatComponentValue(monthlySummary?.data?.components.owner_direct_charge.state ?? "available", monthlySummary?.data?.components.owner_direct_charge.amount ?? null)}</span>
                    </div>
                <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-3 text-zinc-950">
                  <span className="font-medium">Total</span>
                  <span>{monthlySummary?.data?.total ? `S/ ${monthlySummary.data.total}` : "S/ —"}</span>
                </div>
              </div>

              <div className="p-10">
                  <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Invoices</div>
                  <div className="text-sm text-zinc-600">Coming soon</div>
                  <div className="mt-4">
                    <Button type="button" variant="secondary" size="sm" disabled>
                      Download all
                    </Button>
                  </div>
              </div>

            </div>

            <div className="p-5 text-sm text-zinc-600">
                Select an Owner or Unit to inspect its Monthly Obligation.
              </div>
            </div>
          ) : selectedOwner && selectedOwnerObligation?.data ? (
  /* Owner Obligation */
            <div className="space-y-8  ">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <Button variant="icon" size="sm" className="ml-auto shrink-0" aria-label="Close owner obligations" data-obligations-close>
                  <X aria-hidden size={16} />
                </Button>
                <div>
                  <div className="text-2xl font-semibold tracking-tight text-zinc-950">{selectedOwner.full_name}</div>
                  <div className="mt-2 text-sm text-zinc-600 ">
                    {selectedOwner.owner_reference} · {selectedOwnerObligation.data.ownedUnitCount}  Units
                  </div>
                </div>
                
              </div>

              <div>
            
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500"> Obligations {monthLabel(monthKey)} </h3>
                {ownerComponentRows.map((component) => {
                  const value = component.state === "available" ? formatMoney(component.amount) : formatStatusLabel(component.state);
                  if (component.key !== "fixed_assessment") {
                    return (
                      <div key={component.key} className="flex items-baseline justify-between gap-4 py-3 text-base text-zinc-600">
                        <span className="min-w-0 break-words">{componentLabel(component.key)}</span>
                        <span className="min-w-0 wrap-anywhere text-right font-medium">{value}</span>
                      </div>
                    );
                  }

                  return (
                    <details key={component.key} className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-base text-zinc-600">
                        <span className="min-w-0 break-words">{componentLabel(component.key)}</span>
                        <span className="flex min-w-0 items-center gap-2 text-right font-medium">
                          <span className="wrap-anywhere">{value}</span>
                          <CaretRight className="shrink-0 group-open:hidden" size={16} aria-hidden="true" />
                          <CaretDown className="hidden shrink-0 group-open:block" size={16} aria-hidden="true" />
                        </span>
                      </summary>
                      <div className="space-y-1 pl-6 pb-2">
                        {selectedOwnerObligation.data!.obligation.units.map((unit) => {
                          const unitFixedAssessment = unit.components.find((item) => item.key === "fixed_assessment");
                          const unitValue = unitFixedAssessment?.status === "available"
                            ? formatMoney(unitFixedAssessment.amount)
                            : formatStatusLabel(unitFixedAssessment?.status ?? "not_applicable");
                          return (
                            <div key={unit.unitId} className="flex items-baseline justify-between gap-4 py-2 text-sm text-zinc-600">
                              <Link href={`/units/${unit.unitNumber}`} className="font-medium text-zinc-950 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950">
                                {unit.unitNumber}
                              </Link>
                              <span className="min-w-0 wrap-anywhere text-right">{unitValue}</span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
                <div className="flex items-baseline justify-between gap-4 py-3 text-base text-zinc-600">
                  <span className="min-w-0 break-words">Owner-direct charges</span>
                  <span className="min-w-0 wrap-anywhere text-right font-medium">
                    {selectedOwnerObligation.data.ownerDirectCharges.state === "available"
                      ? formatMoney(selectedOwnerObligation.data.ownerDirectCharges.amount)
                      : formatStatusLabel(selectedOwnerObligation.data.ownerDirectCharges.state)}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-zinc-200 pt-4 font-semibold text-zinc-950">
                  <span>Total</span>
                  <span className="min-w-0 wrap-anywhere text-right">
                    {selectedOwnerObligation.data.total.state === "available"
                      ? formatMoney(selectedOwnerObligation.data.total.amount)
                      : formatStatusLabel(selectedOwnerObligation.data.total.state)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-zinc-500">{formatStatusLabel(selectedOwnerObligation.data.readiness)}</div>
              </div>

                <details className="group rounded-[24px] border border-zinc-200 bg-white px-5 py-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-zinc-950">
                    + Add owner-direct charge
                  </summary>
                  <div className="mt-5 border-t border-zinc-200 pt-5">
                    <form action={createOwnerDirectChargeAction} className="space-y-4">
                      <input type="hidden" name="return_to" value={`/obligations?mode=owners&ownerId=${selectedOwner.id}`} />
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Charge to</span>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950">
                          {selectedOwner.full_name}
                        </div>
                        <input type="hidden" name="owner_id" value={selectedOwner.id} />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Description</span>
                        <Input name="description" placeholder="Owner charge description" />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-zinc-700">Amount</span>
                        <Input name="amount" type="number" step="0.01" placeholder="100.00" />
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
                <Button variant="icon" size="sm" className="ml-auto shrink-0" aria-label="Close unit obligations" data-obligations-close>
                  <X aria-hidden size={16} />
                </Button>
              </div>

              <div>
                <div className="mb-8 text-4xl font-semibold tracking-tight text-zinc-950">{monthLabel(monthKey)}</div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Obligations</h3>
                {selectedUnitPanel.obligation.components.map((component) => (
                  <div key={component.key} className="flex items-baseline justify-between gap-4 py-3 text-base text-zinc-600">
                    <span className="min-w-0 break-words">{component.label}</span>
                    <span className="min-w-0 wrap-anywhere text-right font-medium">
                      {component.status === "available" ? formatMoney(component.amount) : formatStatusLabel(component.status)}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-zinc-200 pt-4 font-semibold text-zinc-950">
                  <span>Total</span>
                  <span className="min-w-0 wrap-anywhere text-right">{formatMoney(selectedUnitPanel.obligation.knownTotal)}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-4 text-sm text-zinc-500">
                  <span>Ready state</span>
                  <span className="min-w-0 wrap-anywhere text-right">{formatStatusLabel(selectedUnitPanel.obligation.readiness)}</span>
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
      </div>
    </ObligationsNavigationShell>
  );
}
