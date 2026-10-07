import Link from "next/link";
import { CaretDown, FileText, Drop, Flame } from "@phosphor-icons/react/dist/ssr";

import { DashboardGreeting } from "@/components/dashboard-greeting";
import { DashboardNoticeCarousel } from "@/components/dashboard-notice-carousel";
import { deriveCarlosApprovalAttentions, getCarlosDashboardFacts, getGulianaDashboardFacts, projectCarlosDashboard, projectGulianaDashboard } from "@/server/dashboard";
import { approveMonthlyObligationAction, loadCarlosObligationReviewAction } from "@/app/(staff)/obligations/actions";
import { getStaffContext } from "@/server/staff-context";
import { CarlosApprovalWorkspace } from "./_components/carlos-approval-workspace";

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

function MeterProgress({ complete, expected, label }: { complete: number; expected: number; label: string }) {
  const percent = progressPercent(complete, expected);
  const circumference = 2 * Math.PI * 50;

  return (
    <div className=" relative h-32 w-32" role="progressbar" aria-label={`${label} completeness`} aria-valuemin={0} aria-valuemax={expected} aria-valuenow={complete}>
      <svg className="h-full w-full" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#e4e4e7" strokeWidth="10" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="#09090b" strokeDasharray={circumference} strokeDashoffset={circumference - (circumference * percent) / 100} strokeLinecap="round" strokeWidth="10" transform="rotate(-90 60 60)" />
        <circle cx="60" cy="10" r="4" fill="#a1a1aa" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-950">
        <span className="text-base font-semibold">{complete} of {expected}</span>
        <span className="text-sm text-zinc-600">{percent}%</span>
      </div>
    </div>
  );
}

function uploadHrefForAttention(source: string, happened: string) {
  if (source === "gas") return "/gas/unit-gas-readings";
  if (source === "water" && happened.startsWith("Sedapal")) return "/water/sedapal/new";
  if (source === "water") return "/water/unit-meter-readings/new";
  return "/obligations";
}

function UtilityStatusIndicator({ emphasis, complete }: { emphasis: string; complete: boolean }) {
  if (complete && emphasis !== "attention") {
    return <span className="absolute right-1 -top-1 h-4 w-4 rounded-full bg-emerald-500 border-4 border-white" role="img" aria-label="Complete" />;
  }
  if (emphasis === "attention") {
    return <span className="absolute right-0 -top-2 h-3 w-3 rounded-full bg-red-500 border-2 border-zinc-50" role="img" aria-label="Needs attention" />;
  }
  return null;
}

async function CarlosDashboardPage({ firstName, error }: { firstName: string; error?: string }) {
  const result = await getCarlosDashboardFacts();
  if (result.error) throw new Error(result.error);
  if (!result.data) throw new Error("Dashboard facts unavailable.");

  const projection = projectCarlosDashboard(result.data);
  const initialDetail = {
    obligationMonth: projection.obligationMonth,
    billingPeriodId: projection.billingPeriodId,
    billingPeriodStatus: projection.billingPeriodStatus,
    total: projection.total,
    components: projection.components,
    financialReadiness: projection.financialReadiness,
    financialBlockers: projection.financialBlockers,
    reviewFingerprint: result.data.current.reviewFingerprint,
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col space-y-6 px-6 py-6 sm:py-8">
      <div className="mt-12 space-y-4">
        <p className="text-md text-zinc-800">{formatDateLabel(result.data.businessDate)}</p>
        <DashboardGreeting firstName={firstName} />
      </div>

      <CarlosApprovalWorkspace
        projection={projection}
        initialDetail={initialDetail}
        attentionPackages={deriveCarlosApprovalAttentions(projection.pendingReviews)}
        loadReviewAction={loadCarlosObligationReviewAction}
        approveAction={approveMonthlyObligationAction}
        initialError={error}
      />
      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p> : null}

      <div className="mt-4 space-y-4">
        <p className="text-lg font-medium text-zinc-950">Financial watch</p>
        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["Delinquency", "Coming soon"],
            ["Expenses", "Coming soon"],
            ["TBD", "Coming soon"],
          ].map(([title, status]) => (
            <div key={title} className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</p>
              <p className="mt-8 text-lg text-zinc-600">{status}</p>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const staffContext = await getStaffContext();
  if (!staffContext) {
    throw new Error("Staff context unavailable.");
  }
  const displayName = staffContext.staffProfile.display_name.trim();
  if (!displayName) {
    throw new Error("Staff display name unavailable.");
  }
  const firstName = displayName.split(/\s+/)[0];
  if (staffContext.primaryRoleKey === "super_admin") {
    const params = searchParams ? await searchParams : {};
    return <CarlosDashboardPage firstName={firstName} error={params.error} />;
  }
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
  const financialFacts = result.data[projection.financialFocus];
  const financialMonthLabel = formatMonthLabel(financialFacts.obligations.obligationMonth);
  const waterBill = financialFacts.commonWaterBill;
  const waterComplete = result.data.sourceWork.water.meterReadingCompleteCount;
  const waterExpected = result.data.sourceWork.water.meterReadingExpectedCount;
  const gasComplete = result.data.sourceWork.gas.gasReadingCount;
  const gasExpected = result.data.sourceWork.gas.gasUnitCount;
  const components = financialFacts.obligations.components;
  const handoffStatus = projection.handoff
    ? projection.handoff.status === "approved_ready_for_dispatch"
      ? "Approved · Ready for dispatch"
      : "Complete · Awaiting Carlos approval"
    : projection.obligations.readiness === "awaiting_approval"
      ? "Complete · Awaiting Carlos approval"
      : null;
  const handoffMonthLabel = projection.handoff
    ? formatMonthLabel(projection.handoff.obligationMonth)
    : financialMonthLabel;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col space-y-6 px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-6 mt-12 ">
        <div className="space-y-4 ">
          <p className="text-md  text-zinc-800">{formatDateLabel(result.data.businessDate)}</p>
            <DashboardGreeting firstName={firstName} />
          {handoffStatus ? (
            <p className="flex flex-wrap items-center gap-2 text-lg text-zinc-950">
              <span>{handoffMonthLabel} obligations {projection.handoff ? "are now" : "are"}</span>
              <span className="inline-flex items-center gap-2 font-medium">
                <FileText size={20} weight="regular" aria-hidden="true" />
                {handoffStatus}
              </span>
            </p>
          ) : null}
        </div>

{/*   Upload Button */}
        <details className="relative">
          <summary className=" cursor-pointer list-none rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:border-zinc-950 [&::-webkit-details-marker]:hidden">Upload</summary>
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
            <Link href="/water/sedapal/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Sedapal bill</Link>
            <Link href="/water/unit-meter-readings/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Water readings</Link>
            <Link href="/gas/unit-gas-readings" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas readings</Link>
            <Link href="/gas/bills/new" className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">Gas supplier bill</Link>
          </div>
        </details>
      </div>

{/*   Attention and Worth Noting */}
      {attentionCount > 0 || worthNoting.length > 0 ? (
        <DashboardNoticeCarousel
          attentions={projection.attentions.map((attention) => ({
            ...attention,
            href: uploadHrefForAttention(attention.source, attention.happened),
          }))}
          worthNoting={worthNoting}
        />
      ) : null}

      <div className="mt-12 space-y-1 ">
        <p className="text-lg font-medium text-zinc-950">Source inputs for <span className="font-semibold">{financialMonthLabel} </span> obligations</p>

      </div>

      <div className={`grid gap-8 sm:grid-cols-2 xl:grid-cols-4 ${isOpen ? "order-3" : "order-2"}`}>

{/*   Water insights */}
        <Link href="/water/unit-meter-readings" className="group relative rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">
          <div className="flex items-start justify-between gap-4 ">

            <div>
              <Drop size={32} weight="regular" aria-hidden="true" />


            </div>
            <UtilityStatusIndicator emphasis={projection.water.meterReadingsEmphasis} complete={projection.water.meterReadingsComplete} />
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <p className="text-lg font-normal text-zinc-950">Water meter reading</p>
              <MeterProgress complete={waterComplete} expected={waterExpected} label="Water meter readings" />
            </div>

          </div>
        </Link>

         <Link href="/water/sedapal" className="group relative rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">
          <div className="flex items-start justify-between gap-4 ">

             <div className="relative bg-gray-100 p-3 rounded-full">
              <Drop size={32} weight="regular" aria-hidden="true" />
              <UtilityStatusIndicator emphasis={projection.water.billEmphasis} complete={projection.water.billPresent} />
            </div>
            
          </div>

           

     


          <div className="mt-10 h-36 rounded-3xl   w-36 ">
              <p className="text-lg font-normal text-zinc-950">Sedapal Bill</p>
              <p className="mt-2 text-lg font-medium text-zinc-950">{waterBill ? "Present" : isOpen ? "Not received yet" : "Missing"}</p>
          </div>
        </Link>

{/*   Gas insights */}
        <Link href="/gas" className="group relative rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">

        <div className="  flex items-start justify-between gap-4 ">

            <div>
              <Flame size={32} weight="regular" aria-hidden="true" />
              

            </div>
            <div>

              <UtilityStatusIndicator emphasis={projection.gas.readingsEmphasis} complete={projection.gas.readingsComplete} />

            </div>
          </div>



          <div className="mt-10  ">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <p className="text-lg text-center font-normal text-zinc-950 ">Gas Meter Readings</p>
              <MeterProgress complete={gasComplete} expected={gasExpected} label="Gas meter readings" />
            </div>
           
          </div>
        </Link>

        <Link href="/gas" className="group  rounded-3xl border border-zinc-200 bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">

        <div className="flex items-start justify-between gap-4  ">

            <div className="relative">
              <Flame size={32} weight="regular" aria-hidden="true" />
              <UtilityStatusIndicator emphasis={projection.gas.supplierBillsEmphasis} complete={projection.gas.supplierBillsPresent} />
            </div>
          </div>



          <div className="mt-10  gap-8 ">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <p className="text-lg font-normal text-zinc-950">Gas Supplier Bills</p>
              <p className="mt-2 text-lg font-semibold text-zinc-950">{financialFacts.gas.supplierBillCount} bills</p>
              <p className="mt-1 text-sm text-zinc-600">{formatMoney(financialFacts.gas.supplierBillTotal)}</p>
            </div>
           
          </div>
        </Link>
      </div>

      <details className="fixed bottom-6 right-6 z-40 max-sm:bottom-4 max-sm:right-4">
        <summary className="flex cursor-pointer list-none items-center gap-4 rounded-full border border-zinc-200 bg-white px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-zinc-950 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-zinc-950">Obligations</span>
          <span className="text-sm text-zinc-600">{shortMonthLabel(financialFacts.obligations.obligationMonth)}</span>
          <span className="text-xs font-semibold tracking-[0.12em] text-zinc-500">
            {projection.financialFocus === "upcoming" ? "Live preview" : projection.obligations.readiness === "awaiting_approval" ? "Awaiting approval" : projection.obligations.readiness === "ready_for_carlos" ? "Ready for handoff" : "Not ready"}
          </span>
          <CaretDown size={16} aria-hidden="true" />
        </summary>
        <div className="absolute bottom-full right-0 z-20 mb-3 w-[min(32rem,calc(100vw-3rem))] rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_18px_40px_rgba(0,0,0,0.1)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{financialMonthLabel} obligations</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">
                {projection.financialFocus === "upcoming" ? "Live preview" : projection.obligations.readiness === "awaiting_approval" ? "Awaiting approval" : projection.obligations.readiness === "ready_for_carlos" ? "Ready for handoff" : "Not ready"}
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
