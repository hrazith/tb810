"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog } from "@/components/ui/dialog";
import type { ApprovalActionState } from "@/app/(staff)/obligations/actions";
import type { CarlosApprovalAttention, CarlosDashboardProjection, CarlosObligationReviewDetail } from "@/server/dashboard";

type Props = {
  projection: CarlosDashboardProjection;
  initialDetail: CarlosObligationReviewDetail;
  attentionPackages: CarlosApprovalAttention[];
  loadReviewAction: (obligationMonth: string) => Promise<{ data: CarlosObligationReviewDetail | null; error: string | null }>;
  approveAction: (previousState: ApprovalActionState, formData: FormData) => Promise<ApprovalActionState>;
  initialError?: string;
};

const componentLabels: Record<string, string> = {
  fixed_assessment: "Fixed assessments",
  metered_water: "Metered water",
  common_water: "Common water",
  gas: "Gas",
  other_charge: "Other charges",
  owner_direct_charge: "Owner-direct charges",
};

function formatMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function shortMonthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  const parts = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(parsed);
  return `${parts.find((part) => part.type === "month")?.value ?? monthKey} ’${(parts.find((part) => part.type === "year")?.value ?? "").slice(-2)}`;
}

function amountText(value: string | null) {
  if (value === null) return "Unavailable";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(numeric)
    : "Unavailable";
}

function signedAmountText(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "PEN", minimumFractionDigits: 2, signDisplay: "exceptZero" }).format(numeric)
    : "Unavailable";
}

// Common Water is charged as an equal share rounded up to the céntimo; the source pool is kept and the difference shown.
function commonWaterRoundingText(component: { state: "available" | "blocked"; sourcePool?: string | null; roundingVariance?: string | null; allocationBasis?: string }) {
  if (component.state !== "available" || component.sourcePool == null || component.roundingVariance == null) return null;
  const label = component.allocationBasis === "persisted" ? "Approved rounding variance" : "Rounding variance";
  return `Source pool ${amountText(component.sourcePool)} · ${label} ${signedAmountText(component.roundingVariance)}`;
}

function componentText(component: { state: "available" | "blocked"; amount: string | null; count?: number | null }) {
  if (component.state === "blocked") return "Blocked";
  return `${amountText(component.amount)}${component.count == null ? "" : ` · ${component.count} ${component.count === 1 ? "charge" : "charges"}`}`;
}

export function CarlosApprovalWorkspace({ projection, initialDetail, attentionPackages, loadReviewAction, approveAction, initialError }: Props) {
  const actionable = projection.pendingReviews[0] ?? null;
  const router = useRouter();
  const [approvalState, approvalFormAction, approvalPending] = useActionState(approveAction, { data: null, error: null });
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CarlosObligationReviewDetail>>({
    [initialDetail.obligationMonth]: initialDetail,
  });
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedDetail = selectedMonth ? details[selectedMonth] ?? null : null;
  const approvalResult = approvalState.data?.obligationMonth === selectedMonth ? approvalState.data : null;
  const approvalError = approvalState.obligationMonth === selectedMonth ? approvalState.error : null;
  const selectedReview = selectedMonth ? projection.pendingReviews.find((review) => review.obligationMonth === selectedMonth) : null;
  const blockingReview = selectedDetail
    && selectedReview
    && !selectedReview.chronologicallyActionable
    ? projection.pendingReviews.find((review) => review.chronologicallyActionable)
    : null;

  useEffect(() => {
    if (initialError) router.replace("/", { scroll: false });
  }, [initialError, router]);

  async function openMonth(month: string) {
    setSelectedMonth(month);
    setLoadError(null);
    if (details[month]) return;
    setLoadingMonth(month);
    const result = await loadReviewAction(month);
    setLoadingMonth(null);
    if (result.error || !result.data) {
      setLoadError(result.error ?? "Monthly obligation details unavailable.");
      return;
    }
    const detail = result.data;
    setDetails((current) => ({ ...current, [month]: detail }));
  }

  function closeAfterApproval() {
    setSelectedMonth(null);
    router.refresh();
  }

  const nextPackage = selectedMonth
    ? projection.pendingReviews.find((review) => review.obligationMonth !== selectedMonth && review.outstanding)
    : null;

  return (
    <>
      {attentionPackages.length > 0 ? (
        <section className="mt-6 space-y-6" aria-label="Pay attention">
          <div className="flex items-center gap-3 border-b border-zinc-200 pb-3">
            <span className="text-lg" aria-hidden="true">!</span>
            <p className="text-lg font-medium text-zinc-950">Needs attention</p>
          </div>
          <div className="grid gap-14 lg:grid-cols-3">
            {attentionPackages.map((review) => (
              <button
                key={review.billingPeriodId}
                type="button"
                onClick={() => openMonth(review.obligationMonth)}
                className="text-left text-lg font-normal leading-snug text-zinc-950 underline decoration-zinc-300 underline-offset-4 transition hover:decoration-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
              >
                {review.happened}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actionable ? (
        <button
          type="button"
          onClick={() => openMonth(actionable.obligationMonth)}
          className="fixed bottom-6 right-6 z-40 flex cursor-pointer items-center gap-4 rounded-full border border-zinc-950 bg-zinc-950 px-5 py-3 text-left text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition hover:bg-zinc-800 max-sm:bottom-4 max-sm:right-4"
        >
          <span className="text-sm font-semibold">Obligations</span>
          <span className="text-sm text-zinc-300">{shortMonthLabel(actionable.obligationMonth)}</span>
          <span className="text-xs font-semibold tracking-[0.12em] text-zinc-400">{actionable.approvalEligible ? "Ready for your approval" : "Ready for review"}</span>
        </button>
      ) : null}

      <Dialog
        open={selectedMonth !== null}
        title={selectedMonth ? `${formatMonthLabel(selectedMonth)} obligations` : "Monthly obligations"}
        onOpenChange={(open) => { if (!open) setSelectedMonth(null); }}
        className="m-auto w-full max-w-2xl rounded-3xl"
        contentClassName="!p-8 sm:!p-10"
      >
        {loadingMonth ? <p className="text-sm text-zinc-600">Loading obligation details…</p> : null}
        {loadError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p> : null}
        {selectedDetail ? (
          approvalResult ? (
            <div className="space-y-5" role="status" aria-live="polite">
              <div>
                <p className="text-xl font-semibold text-zinc-950">{formatMonthLabel(approvalResult.obligationMonth)} approved</p>
                <p className="mt-2 text-sm text-zinc-600">{approvalResult.obligationRowCount} obligations finalized · {amountText(approvalResult.total)}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={closeAfterApproval} className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-950 bg-zinc-950 px-6 py-3 text-base font-medium text-white transition hover:bg-zinc-800">Done</button>
                {nextPackage ? (
                  <button type="button" onClick={() => openMonth(nextPackage.obligationMonth)} className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3 text-base font-medium text-zinc-900 transition hover:border-zinc-950">Review next package</button>
                ) : null}
              </div>
            </div>
          ) : (
          <div className="space-y-5">
            {approvalError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{approvalError}</p> : null}
            <div className="space-y-3 text-sm">
              {Object.entries(selectedDetail.components).map(([key, component]) => {
                const roundingText = key === "common_water" ? commonWaterRoundingText(component) : null;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between gap-6">
                      <span className="text-zinc-600">{componentLabels[key] ?? key}</span>
                      <span className="font-medium text-zinc-950">{componentText(component)}</span>
                    </div>
                    {roundingText ? <p className="text-right text-xs text-zinc-500">{roundingText}</p> : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-zinc-200 pt-4 text-base">
              <span className="font-semibold text-zinc-950">Total</span>
              <span className="font-semibold text-zinc-950">{amountText(selectedDetail.total)}</span>
            </div>
            {selectedDetail.billingPeriodStatus === "ready_for_review" && selectedDetail.financialReadiness === "ready" && projection.pendingReviews.some((review) => review.obligationMonth === selectedDetail.obligationMonth && review.approvalEligible) ? (
              <form action={approvalFormAction}>
                <input type="hidden" name="billingPeriodId" value={selectedDetail.billingPeriodId ?? ""} />
                <input type="hidden" name="reviewFingerprint" value={selectedDetail.reviewFingerprint} />
                <input type="hidden" name="obligationMonth" value={selectedDetail.obligationMonth} />
                <button type="submit" disabled={approvalPending} className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-950 bg-zinc-950 px-6 py-3 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60" aria-disabled={approvalPending}>{approvalPending ? `Approving ${formatMonthLabel(selectedDetail.obligationMonth)}…` : `Approve ${formatMonthLabel(selectedDetail.obligationMonth)} obligations`}</button>
              </form>
            ) : (
              <p className="text-sm text-zinc-600">{blockingReview ? `This package is ready for review. ${formatMonthLabel(blockingReview.obligationMonth)} must be approved first.` : selectedDetail.financialBlockers.length > 0 ? selectedDetail.financialBlockers.join(" ") : "This package is visible for review."}</p>
            )}
          </div>
          )
        ) : null}
      </Dialog>
    </>
  );
}
