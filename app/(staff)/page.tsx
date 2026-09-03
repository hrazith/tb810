import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { projectGulianaDashboard, getGulianaDashboardFacts } from "@/server/dashboard";

function formatDateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatMoney(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function sectionTone(state: string) {
  switch (state) {
    case "blocked":
      return "border-red-200 bg-red-50";
    case "complete":
      return "border-zinc-200 bg-white";
    case "active":
      return "border-zinc-200 bg-white";
    default:
      return "border-zinc-200 bg-white";
  }
}

function stateLabel(value: string) {
  switch (value) {
    case "blocked":
      return "Blocked";
    case "complete":
      return "Complete";
    case "active":
      return "Active";
    case "waiting":
      return "Waiting";
    default:
      return value;
  }
}

function amountText(amount: string | null) {
  return amount ? formatMoney(amount) : "Unavailable";
}

export default async function DashboardPage() {
  const result = await getGulianaDashboardFacts();
  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.data) {
    throw new Error("Dashboard facts unavailable.");
  }

  const projection = projectGulianaDashboard(result.data);
  const hasBlockers = projection.exceptions.length > 0;
  const operatingMonthLabel = formatMonthLabel(result.data.operatingMonth);
  const upcomingMonthLabel = formatMonthLabel(result.data.upcomingObligationMonth);
  const waterBill = result.data.upcoming.commonWaterBill;
  const waterBlocker = result.data.upcoming.obligations.components.common_water.reason
    ?? result.data.upcoming.obligations.components.metered_water.reason
    ?? null;
  const gasBlocker = result.data.upcoming.obligations.components.gas.reason ?? null;

  const quickActions = [
    {
      href: "/water/sedapal/new",
      title: "Upload Sedapal bill",
      description: "Enter the source bill feeding the next obligation cycle.",
    },
    {
      href: "/water/unit-meter-readings/new",
      title: "Upload water readings",
      description: "Capture the month-end meter readings.",
    },
    {
      href: "/gas/bills/new",
      title: "Upload gas supplier bill",
      description: "Record incoming supplier bill facts.",
    },
    {
      href: "/gas/readings/new",
      title: "Upload gas readings",
      description: "Capture the month-end gas readings.",
    },
    {
      href: "/obligations",
      title: "Open obligations",
      description: `Review the live ${upcomingMonthLabel} obligation preview.`,
    },
  ] as const;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-6 sm:py-8">
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {formatDateLabel(result.data.businessDate)}
        </p>
        <div className="max-w-3xl space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            {operatingMonthLabel} close
          </h1>
          <p className="text-lg leading-8 text-zinc-600">
            Preparing {upcomingMonthLabel} obligations before Carlos reviews the snapshot.
          </p>
          <p className="max-w-2xl text-sm leading-6 text-zinc-500">
            Review the source inputs that feed the live next-month preview, then open the relevant operational work if anything is still outstanding.
          </p>
        </div>
      </div>

      {hasBlockers ? (
        <Panel className="space-y-4 border-red-200 bg-red-50">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
              Needs Attention
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-red-950">
              Canonical blocker(s) are preventing the preview from fully completing.
            </h2>
          </div>
          <div className="space-y-3">
            {projection.exceptions.map((exception, index) => (
              <div key={`${exception.source}:${exception.message}:${index}`} className="rounded-2xl border border-red-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  {exception.source}
                </p>
                <p className="mt-1 text-sm leading-6 text-red-950">{exception.message}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className={["space-y-5", sectionTone(projection.water.state)].join(" ")}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Month-end check</p>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Water</h2>
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
              {stateLabel(projection.water.state)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Sedapal bill</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">
                {waterBill ? "Present" : "Missing"}
              </p>
              {waterBill ? (
                <p className="mt-1 text-sm text-zinc-600">
                  {formatMoney(waterBill.amount)} · {waterBill.bill_date ? formatDateLabel(waterBill.bill_date) : "Date unavailable"}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  {waterBlocker ?? "Sedapal bill has not been entered yet."}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Meter readings</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">
                {result.data.sourceWork.water.meterReadingCompleteCount} of {result.data.sourceWork.water.meterReadingExpectedCount} complete
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {projection.water.meterReadingsComplete ? "All expected readings are in." : "Some readings are still outstanding."}
              </p>
            </div>
          </div>
        </Panel>

        <Panel className={["space-y-5", sectionTone(projection.gas.state)].join(" ")}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Month-end check</p>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Gas</h2>
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
              {stateLabel(projection.gas.state)}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Meter readings</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">
                {result.data.sourceWork.gas.gasReadingCount} of {result.data.sourceWork.gas.gasUnitCount} complete
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {projection.gas.readingsComplete ? "All gas-enabled units are covered." : "Some gas readings are still outstanding."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Supplier bills</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">
                {result.data.upcoming.gas.supplierBillCount} bills
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {formatMoney(result.data.upcoming.gas.supplierBillTotal)} total from the live preview package.
              </p>
            </div>
          </div>

          {gasBlocker ? (
            <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-950">
              {gasBlocker}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Upcoming obligation preview</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950">{upcomingMonthLabel} obligations</h2>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Live preview
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Total receivable</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
              {amountText(result.data.upcoming.obligations.total)}
            </p>
            {result.data.upcoming.obligations.total === null ? (
              <p className="mt-2 text-sm text-zinc-600">
                The preview is incomplete while a canonical component is blocked.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Fixed assessment</p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {amountText(result.data.upcoming.obligations.components.fixed_assessment.amount)}
            </p>
            {result.data.upcoming.obligations.components.fixed_assessment.reason ? (
              <p className="mt-1 text-sm text-zinc-600">{result.data.upcoming.obligations.components.fixed_assessment.reason}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Water</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-600">Metered water</span>
                <span className="text-sm font-medium text-zinc-950">
                  {amountText(result.data.upcoming.obligations.components.metered_water.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-600">Common water</span>
                <span className="text-sm font-medium text-zinc-950">
                  {amountText(result.data.upcoming.obligations.components.common_water.amount)}
                </span>
              </div>
            </div>
            {waterBill ? (
              <p className="mt-3 text-sm text-zinc-600">
                Sedapal source bill: {formatMoney(waterBill.amount)} · {waterBill.bill_date ? formatDateLabel(waterBill.bill_date) : "Date unavailable"}
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">
                Sedapal source bill is missing for the upcoming preview.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Gas</p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {amountText(result.data.upcoming.obligations.components.gas.amount)}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {result.data.upcoming.gas.supplierBillCount} bills · {formatMoney(result.data.upcoming.gas.supplierBillTotal)}
            </p>
            {result.data.upcoming.obligations.components.gas.reason ? (
              <p className="mt-2 text-sm text-zinc-600">{result.data.upcoming.obligations.components.gas.reason}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Other charges</p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {amountText(result.data.upcoming.obligations.components.other_charge.amount)}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {result.data.upcoming.obligations.components.other_charge.count ?? 0} charges
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Owner-direct charges</p>
            <p className="mt-2 text-xl font-semibold text-zinc-950">
              {amountText(result.data.upcoming.obligations.components.owner_direct_charge.amount)}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {result.data.upcoming.obligations.components.owner_direct_charge.count ?? 0} charges
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Quick actions</p>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Open the work you can take right now</h2>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Panel
              key={action.href}
              as={Link}
              href={action.href}
              padding="compact"
              className="group space-y-2 transition hover:border-zinc-950 hover:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-zinc-950">{action.title}</h3>
                  <p className="text-sm leading-6 text-zinc-600">{action.description}</p>
                </div>
                <span className="text-sm font-medium text-zinc-950 transition group-hover:translate-x-0.5">
                  →
                </span>
              </div>
            </Panel>
          ))}
        </div>
      </Panel>

      <div className="text-sm text-zinc-500">
        {projection.water.state === "blocked" || projection.gas.state === "blocked"
          ? "A blocker is keeping the preview incomplete."
          : "The dashboard stays quiet when the source work is complete."}
      </div>

      <Button asChild variant="secondary" shape="pill">
        <Link href="/obligations">Open obligations</Link>
      </Button>
    </section>
  );
}
