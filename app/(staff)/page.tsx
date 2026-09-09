import Link from "next/link";
import { CaretDown, Warning, Drop } from "@phosphor-icons/react/dist/ssr";

import { DashboardGreeting } from "@/components/dashboard-greeting";
import { getGulianaDashboardFacts, projectGulianaDashboard } from "@/server/dashboard";
import { getStaffContext } from "@/server/staff-context";

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

function componentText(component: { state: "available" | "blocked"; amount: string | null }) {
  return component.state === "blocked" ? "Blocked" : amountText(component.amount);
}

function shortMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(parsed);
  const month = parts.find((part) => part.type === "month")?.value ?? monthKey;
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${month} ’${year.slice(-2)}`;
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

export default async function DashboardPage() {
  const staffContext = await getStaffContext();
  if (!staffContext) {
    throw new Error("Staff context unavailable.");
  }
  const displayName = staffContext.staffProfile.display_name.trim();
  if (!displayName) {
    throw new Error("Staff display name unavailable.");
  }
  const firstName = displayName.split(/\s+/)[0];
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
      <div className="flex flex-wrap items-start justify-between gap-6 mt-12">
        <div className="space-y-4 ">
          <p className="text-md  text-zinc-800">{formatDateLabel(result.data.businessDate)}</p>
            <DashboardGreeting firstName={firstName} />
        </div>

{/*   Upload Button */}
        <details className="relative">
          <summary className=" cursor-pointer list-none rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:border-zinc-950 [&::-webkit-details-marker]:hidden">Upload</summary>
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
            <Link href="/water/sedapal/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Sedapal bill</Link>
            <Link href="/water/unit-meter-readings/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Water readings</Link>
            <Link href="/gas/readings/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas readings</Link>
            <Link href="/gas/bills/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas supplier bill</Link>
          </div>
        </details>
      </div>

{/*   Attention and Worth Noting */}
      {attentionCount > 0 || worthNoting.length > 0 ? (
        <div className="space-y-4 mt-6">
          {attentionCount > 0 ? <>
            <div className="space-y-1  border-b border-zinc-200 py-4 ">
              <div className="flex items-center gap-2  ">
                <Warning size={20} weight="regular" aria-hidden="true" />
                <p className="text-lg text-zinc-950 ">These inputs are blocking {financialMonthLabel} obligations.</p>
                
              </div>
            </div>
            <div className="grid gap-14 lg:grid-cols-3 ">
              {projection.attentions.map((attention, index) => (
                <div key={`${attention.source}:${attention.happened}:${index}`} >
                 
                  <Link href={uploadHrefForAttention(attention.source, attention.happened)} className="mt-2 inline-block text-2xl font-normal leading-tight text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">
                    {attention.happened}
                  </Link>
                </div>
              ))}
            </div>
          </> : null}
          {worthNoting.length > 0 ? <div className={attentionCount > 0 ? "space-y-3 border-t border-zinc-200 pt-4" : "space-y-3"}>
            <p className="text-sm font-semibold uppercase  tracking-wide  text-zinc-500">Worth noting</p>
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
        </div>
      ) : null}

      <div className={`grid  mt-6 gap-4 lg:grid-cols-2 ${isOpen ? "order-3" : "order-2"}`}>
        <Link href="/water" className="group rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 cursor-pointer">
          <div className="flex items-start justify-between gap-4">

            <div>
              <Drop size={20} weight="regular" aria-hidden="true" />
              <p className="text-md font-light text-zinc-950">Water</p>
              <h2 className="mt-1  text-xl font-semibold tracking-tight text-zinc-950">{projection.water.state === "complete" ? "Complete" : projection.water.state === "blocked" ? "Blocked" : isOpen && projection.water.state === "waiting" ? "Waiting for inputs" : isOpen ? "In progress" : "Incomplete"}</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Sedapal bill</p><p className="mt-2 text-lg font-semibold text-zinc-950">{waterBill ? "Present" : isOpen ? "Not received yet" : "Missing"}</p>{waterBill ? <p className="mt-1 text-sm text-zinc-600">{formatMoney(waterBill.amount)}</p> : null}</div>
            <div>
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Meter readings</p><p className="text-sm font-medium text-zinc-950">{waterComplete} of {waterExpected}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label="Water meter reading completeness" aria-valuemin={0} aria-valuemax={waterExpected} aria-valuenow={waterComplete}><div className="h-full rounded-full bg-zinc-950" style={{ width: `${progressPercent(waterComplete, waterExpected)}%` }} /></div>
              <p className="mt-2 text-sm text-zinc-600">{waterComplete} of {waterExpected} complete</p>
            </div>
          </div>
        </Link>

        <Link href="/gas" className="group rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 cursor-pointer">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Gas</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{projection.gas.state === "complete" ? "Complete" : projection.gas.state === "blocked" ? "Blocked" : isOpen && projection.gas.state === "waiting" ? "Waiting for inputs" : isOpen ? "In progress" : "Incomplete"}</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Meter readings</p><p className="text-sm font-medium text-zinc-950">{gasComplete} of {gasExpected}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label="Gas meter reading completeness" aria-valuemin={0} aria-valuemax={gasExpected} aria-valuenow={gasComplete}><div className="h-full rounded-full bg-zinc-950" style={{ width: `${progressPercent(gasComplete, gasExpected)}%` }} /></div>
              <p className="mt-2 text-sm text-zinc-600">{gasComplete} of {gasExpected} complete</p>
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Supplier bills</p><p className="mt-2 text-lg font-semibold text-zinc-950">{result.data.upcoming.gas.supplierBillCount} bills</p><p className="mt-1 text-sm text-zinc-600">{formatMoney(result.data.upcoming.gas.supplierBillTotal)}</p></div>
          </div>
        </Link>
      </div>

      <details className="fixed bottom-6 right-6 z-40 max-sm:bottom-4 max-sm:right-4">
        <summary className="flex cursor-pointer list-none items-center gap-4 rounded-full border border-zinc-200 bg-white px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-zinc-950 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-zinc-950">Obligations</span>
          <span className="text-sm text-zinc-600">{shortMonthLabel(financialFacts.obligations.obligationMonth)}</span>
          <span className="text-xs font-semibold tracking-[0.12em] text-zinc-500">
            {isOpen ? projection.obligations.readiness === "ready_for_carlos" ? "Ready for Carlos" : "Not ready" : "Live preview"}
          </span>
          <CaretDown size={16} aria-hidden="true" />
        </summary>
        <div className="absolute bottom-full right-0 z-20 mb-3 w-[min(32rem,calc(100vw-3rem))] rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_18px_40px_rgba(0,0,0,0.1)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{financialMonthLabel} obligations</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">
                {isOpen ? projection.obligations.readiness === "ready_for_carlos" ? "Ready for Carlos" : "Not ready" : "Live preview"}
              </p>
            </div>
            <Link href="/obligations" className="text-sm font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950">Open obligations →</Link>
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Fixed assessments</span><span className="font-medium text-zinc-950">{componentText(components.fixed_assessment)}</span></div>
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Metered water</span><span className="font-medium text-zinc-950">{componentText(components.metered_water)}</span></div>
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Common water</span><span className="font-medium text-zinc-950">{componentText(components.common_water)}</span></div>
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Gas</span><span className="font-medium text-zinc-950">{componentText(components.gas)}</span></div>
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Other charges</span><span className="font-medium text-zinc-950">{componentText(components.other_charge)}</span></div>
            <div className="flex items-center justify-between gap-6"><span className="text-zinc-600">Owner-direct charges</span><span className="font-medium text-zinc-950">{componentText(components.owner_direct_charge)}</span></div>
            <div className="flex items-center justify-between gap-6 border-t border-zinc-200 pt-4 text-base"><span className="font-semibold text-zinc-950">Total</span><span className="font-semibold text-zinc-950">{amountText(financialFacts.obligations.total)}</span></div>
          </div>
        </div>
      </details>
    </section>
  );
}
