import Link from "next/link";
import { notFound } from "next/navigation";
import { UserSwitchIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { loadUnitWorkspace } from "@/server/unit-workspace";

type PageProps = {
  params: Promise<{
    unitNumber: string;
  }>;
};

function formatArea(value: number | null) {
  return value === null ? "—" : `${value.toFixed(3).replace(/\.?0+$/, "")} m²`;
}

function formatParticipation(value: number) {
  return `${value.toFixed(4).replace(/\.?0+$/, "")}%`;
}

function formatCurrency(value: string, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatBudget(value: string, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatAssessmentPercentage(value: number) {
  return `${value.toFixed(3).replace(/\.?0+$/, "")}%`;
}

function formatObligationMonth(value: string) {
  const [year, month] = value.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) return value;
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(status: string) {
  if (status === "current") return "Current";
  if (status === "scheduled") return "Scheduled";
  return "Past";
}

export default async function UnitDetailPage({ params }: PageProps) {
  const { unitNumber } = await params;
  const workspaceResult = await loadUnitWorkspace(unitNumber, "2026-08");
  if (workspaceResult.error) throw new Error(workspaceResult.error);
  if (!workspaceResult.data) notFound();

  const { unit, ownershipSnapshot, monthlyObligation } = workspaceResult.data!;
  const unitObligation = monthlyObligation?.units[0];
  const fixedAssessment = unitObligation?.components.find((component) => component.key === "fixed_assessment");

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Unit</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{unit.unit_number}</h1>
          <div className="space-y-1 text-sm text-zinc-600">
            <p>Type: {unit.unit_type_name}</p>
            <p>Building: {unit.building_name}</p>
            <p>Floor: {unit.floor ?? "—"}</p>
            <p>Registered area: {formatArea(unit.registered_area_m2)}</p>
            <p>Participation percentage: {formatParticipation(unit.participation_percentage)}</p>
            <p>Individual water meter: {unit.has_meter ? "Yes" : "No"}</p>
            <p>Gas service: {unit.has_gas_service ? "Yes" : "No"}</p>
            <p>Unit account: {ownershipSnapshot.unitAccount?.account_number ?? "Unavailable"}</p>
            <p>
              Current balance:{" "}
              {ownershipSnapshot.unitAccount ? ownershipSnapshot.unitAccount.current_balance.toFixed(2) : "—"}
            </p>
            <p>Workspace reads: {workspaceResult.data.metrics.readCount}</p>
            <p>Workspace server time: {workspaceResult.data.metrics.elapsedMs} ms</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/units/${unit.unit_number}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Edit
          </Link>
        </div>
      </div>

      <Panel as="section" className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-zinc-950">
            Monthly Obligation: {formatObligationMonth(monthlyObligation?.obligationMonth ?? "2026-08")}
          </h2>
        </div>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Known Total</p>
              <p className="text-base font-semibold text-zinc-950">{formatCurrency(monthlyObligation?.knownTotal ?? "0.00", "PEN")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Readiness</p>
              <p className="text-base font-normal text-zinc-950">{monthlyObligation?.readiness ?? "blocked"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Missing Components</p>
              <p className="text-base font-normal text-zinc-950">
                {monthlyObligation && monthlyObligation.missingComponents.length > 0 ? monthlyObligation.missingComponents.join(", ") : "None"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Blockers</p>
              <p className="text-base font-normal text-zinc-950">
                {monthlyObligation && monthlyObligation.blockers.length > 0 ? monthlyObligation.blockers.join(" | ") : "None"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {unitObligation?.components.map((component) => (
              <div key={component.key} className="mt-12">
                {component.key === "fixed_assessment" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">Fixed Monthly Assessment</p>
                        <p className="text-sm text-zinc-600">
                          {fixedAssessment?.status === "available"
                            ? `assessed @ ${formatAssessmentPercentage(unit.participation_percentage)} of the monthly budget`
                            : "Unavailable"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-zinc-950">
                          {fixedAssessment?.status === "available"
                            ? formatBudget(fixedAssessment.amount ?? "0.00", fixedAssessment.currency ?? "PEN")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">{component.label}</p>
                        <p className="text-xs uppercase tracking-wide text-zinc-500">{component.key}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-zinc-950">
                          {component.amount ? formatCurrency(component.amount, component.currency ?? "PEN") : "—"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel as="section" className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Ownership</h2>
          <Button asChild variant="secondary" shape="default">
            <Link href={`/units/${unit.unit_number}/transfer-ownership`}>
              <UserSwitchIcon size={16} aria-hidden="true" />
              {ownershipSnapshot.currentOwnership ? "Transfer ownership" : "Assign owner"}
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Current owner</h3>
            {ownershipSnapshot.currentOwnership ? (
              <div className="space-y-2">
                <p className="text-base font-semibold text-zinc-950">{ownershipSnapshot.currentOwnership.owner.full_name}</p>
                <p className="text-sm text-zinc-600">
                  Reference: {ownershipSnapshot.currentOwnership.owner.owner_reference}
                </p>
                <p className="text-sm text-zinc-600">
                  Responsibility starts: {ownershipSnapshot.currentOwnership.start_date}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No current owner.</p>
            )}
            {ownershipSnapshot.scheduledOwnerships.length ? (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scheduled owner</h4>
                {ownershipSnapshot.scheduledOwnerships.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <p className="text-sm font-medium text-zinc-950">{item.owner.full_name}</p>
                    <p className="text-xs text-zinc-600">Starts: {item.start_date}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Ownership history</h3>
            {ownershipSnapshot.ownershipHistory.length ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Start</th>
                      <th className="px-4 py-3">End</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white">
                    {ownershipSnapshot.ownershipHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-zinc-900">
                          <div className="space-y-1">
                            <p className="font-medium">{item.owner.full_name}</p>
                            <p className="text-xs font-medium text-zinc-500">{item.owner.owner_reference}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{item.start_date}</td>
                        <td className="px-4 py-3 text-zinc-600">{item.end_date ?? "Current"}</td>
                        <td className="px-4 py-3 text-zinc-600">{statusLabel(item.ownership_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No ownership history yet.</p>
            )}
          </div>
        </div>
      </Panel>

      <Panel as="section">
        <h2 className="text-lg font-semibold text-zinc-950">Notes</h2>
        <p className="mt-3 text-sm text-zinc-600">{unit.notes ?? "No notes added."}</p>
      </Panel>
    </section>
  );
}
