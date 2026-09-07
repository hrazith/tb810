import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { getGulianaDashboardFacts, projectGulianaDashboard } from "@/server/dashboard";

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

function amountText(amount: string | null) {
  return amount ? formatMoney(amount) : "Unavailable";
}

function progressPercent(complete: number, expected: number) {
  if (expected <= 0) return 0;
  return Math.min(Math.max((complete / expected) * 100, 0), 100);
}

function uploadHrefForAttention(source: string, happened: string) {
  if (source === "gas") return "/gas/readings/new";
  if (source === "water" && happened.startsWith("Sedapal")) return "/water/sedapal/new";
  if (source === "water") return "/water/unit-meter-readings/new";
  return "/obligations";
}

function uploadLabelForAttention(source: string, happened: string) {
  if (source === "gas") return "Enter gas readings";
  if (source === "water" && happened.startsWith("Sedapal")) return "Upload Sedapal bill";
  if (source === "water") return "Enter water readings";
  return "Open obligations";
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
  const isOpen = projection.context === "open";
  const attentionCount = projection.attentions.length;
  const worthNoting = projection.worthNoting;
  const operatingMonthLabel = formatMonthLabel(result.data.operatingMonth);
  const upcomingMonthLabel = formatMonthLabel(result.data.upcomingObligationMonth);
  const financialFacts = isOpen ? result.data.current : result.data.upcoming;
  const financialMonthLabel = formatMonthLabel(financialFacts.obligations.obligationMonth);
  const waterBill = result.data.upcoming.commonWaterBill;
  const waterComplete = result.data.sourceWork.water.meterReadingCompleteCount;
  const waterExpected = result.data.sourceWork.water.meterReadingExpectedCount;
  const gasComplete = result.data.sourceWork.gas.gasReadingCount;
  const gasExpected = result.data.sourceWork.gas.gasUnitCount;
  const components = financialFacts.obligations.components;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col space-y-6 px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{formatDateLabel(result.data.businessDate)}</p>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">{operatingMonthLabel} {isOpen ? "open" : "close"}</h1>
            <p className="text-lg leading-8 text-zinc-600">{isOpen ? `${operatingMonthLabel} operations are open.` : `Preparing ${upcomingMonthLabel} obligations for Carlos.`}</p>
          </div>
        </div>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:border-zinc-950 [&::-webkit-details-marker]:hidden">Upload</summary>
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
            <Link href="/water/sedapal/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Sedapal bill</Link>
            <Link href="/water/unit-meter-readings/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Water readings</Link>
            <Link href="/gas/readings/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas readings</Link>
            <Link href="/gas/bills/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas supplier bill</Link>
          </div>
        </details>
      </div>

      {attentionCount > 0 || worthNoting.length > 0 ? (
        <Panel className="space-y-4 border-zinc-200 bg-white" padding="compact">
          {attentionCount > 0 ? <>
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">{attentionCount} {attentionCount === 1 ? "item" : "items"} need attention</p>
              <p className="text-sm text-zinc-600">These inputs are blocking {financialMonthLabel} obligations.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {projection.attentions.map((attention, index) => (
                <div key={`${attention.source}:${attention.happened}:${index}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{attention.source}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-zinc-950">{attention.happened}</p>
                  <Link href={uploadHrefForAttention(attention.source, attention.happened)} className="mt-3 inline-flex text-sm font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">
                    {uploadLabelForAttention(attention.source, attention.happened)} →
                  </Link>
                </div>
              ))}
            </div>
          </> : null}
          {worthNoting.length > 0 ? <div className={attentionCount > 0 ? "space-y-3 border-t border-zinc-200 pt-4" : "space-y-3"}>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Worth noting</p>
            <div className="grid gap-2 lg:grid-cols-3">
              {worthNoting.map((item) => (
                <div key={`${item.kind}:${item.unitNumber}:${item.obligationMonth}:${item.reason}:${item.amount}`} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="text-sm font-medium text-zinc-950">Unit {item.unitNumber} · Unit charge</p>
                  <p className="mt-1 text-sm text-zinc-600">{formatMoney(item.amount)} · {formatMonthLabel(item.obligationMonth)} obligations</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.reason}</p>
                </div>
              ))}
            </div>
          </div> : null}
        </Panel>
      ) : null}

      <div className={`grid gap-4 lg:grid-cols-2 ${isOpen ? "order-3" : "order-2"}`}>
        <Panel className="space-y-4" padding="compact">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Water</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{projection.water.state === "complete" ? "Complete" : projection.water.state === "blocked" ? "Blocked" : isOpen && projection.water.state === "waiting" ? "Waiting for inputs" : isOpen ? "In progress" : "Incomplete"}</h2>
            </div>
            <Link href="/water" className="text-sm font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">View water details →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Sedapal bill</p><p className="mt-2 text-lg font-semibold text-zinc-950">{waterBill ? "Present" : isOpen ? "Not received yet" : "Missing"}</p>{waterBill ? <p className="mt-1 text-sm text-zinc-600">{formatMoney(waterBill.amount)}</p> : null}</div>
            <div>
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Meter readings</p><p className="text-sm font-medium text-zinc-950">{waterComplete} of {waterExpected}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label="Water meter reading completeness" aria-valuemin={0} aria-valuemax={waterExpected} aria-valuenow={waterComplete}><div className="h-full rounded-full bg-zinc-950" style={{ width: `${progressPercent(waterComplete, waterExpected)}%` }} /></div>
              <p className="mt-2 text-sm text-zinc-600">{waterComplete} of {waterExpected} complete</p>
            </div>
          </div>
        </Panel>

        <Panel className="space-y-4" padding="compact">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Gas</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{projection.gas.state === "complete" ? "Complete" : projection.gas.state === "blocked" ? "Blocked" : isOpen && projection.gas.state === "waiting" ? "Waiting for inputs" : isOpen ? "In progress" : "Incomplete"}</h2>
            </div>
            <Link href="/gas" className="text-sm font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">View gas details →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Meter readings</p><p className="text-sm font-medium text-zinc-950">{gasComplete} of {gasExpected}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label="Gas meter reading completeness" aria-valuemin={0} aria-valuemax={gasExpected} aria-valuenow={gasComplete}><div className="h-full rounded-full bg-zinc-950" style={{ width: `${progressPercent(gasComplete, gasExpected)}%` }} /></div>
              <p className="mt-2 text-sm text-zinc-600">{gasComplete} of {gasExpected} complete</p>
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Supplier bills</p><p className="mt-2 text-lg font-semibold text-zinc-950">{result.data.upcoming.gas.supplierBillCount} bills</p><p className="mt-1 text-sm text-zinc-600">{formatMoney(result.data.upcoming.gas.supplierBillTotal)}</p></div>
          </div>
        </Panel>
      </div>

      <Panel className={`order-2 space-y-5 ${isOpen ? "" : "order-3"}`} padding="compact">
          <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><h2 className="text-xl font-semibold tracking-tight text-zinc-950">{financialMonthLabel} obligations</h2><span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{isOpen ? projection.obligations.readiness === "ready_for_carlos" ? "Ready for Carlos" : "Not ready" : "Live preview"}</span></div>
          <Link href="/obligations" className="text-sm font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">Open obligations →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="sm:col-span-2 xl:col-span-1"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Total receivable</p><p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{amountText(financialFacts.obligations.total)}</p>{financialFacts.obligations.total === null ? <p className="mt-1 text-sm text-zinc-500">3 source inputs block completion.</p> : null}</div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Fixed assessment</p><p className="mt-2 text-lg font-semibold text-zinc-950">{amountText(components.fixed_assessment.amount)}</p></div>
          <div className="text-zinc-500"><p className="text-xs font-semibold uppercase tracking-[0.16em]">Water</p><p className="mt-2 text-lg font-semibold text-zinc-700">{amountText(components.metered_water.amount)}</p></div>
          <div className="text-zinc-500"><p className="text-xs font-semibold uppercase tracking-[0.16em]">Gas</p><p className="mt-2 text-lg font-semibold text-zinc-700">{amountText(components.gas.amount)}</p></div>
          <div className="text-zinc-500"><p className="text-xs font-semibold uppercase tracking-[0.16em]">Other charges</p><p className="mt-2 text-lg font-semibold text-zinc-700">{amountText(components.other_charge.amount)}</p><p className="mt-1 text-xs">{components.other_charge.count ?? 0} charges</p></div>
          <div className="text-zinc-500"><p className="text-xs font-semibold uppercase tracking-[0.16em]">Owner-direct</p><p className="mt-2 text-lg font-semibold text-zinc-700">{amountText(components.owner_direct_charge.amount)}</p><p className="mt-1 text-xs">{components.owner_direct_charge.count ?? 0} charges</p></div>
        </div>
      </Panel>
    </section>
  );
}
