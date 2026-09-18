import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { getActiveDevTestSessionSummary } from "@/server/dev-test-session";
import { getStaffContext } from "@/server/staff-context";
import { buildFinancialReviewFingerprint, getSnapshotCalculation } from "./snapshot";
import { loadBuildingMonthFinancialFacts } from "./owner-facts";

export function canApproveMonthlyObligation(roleKeys: string[]) {
  return roleKeys.includes("super_admin");
}

export function validateApprovalTransition(status: string) {
  if (status === "approved") return { ok: true as const, idempotent: true as const };
  if (status !== "ready_for_review") {
    return { ok: false as const, error: `Billing Period cannot be approved from status ${status}.` };
  }
  return { ok: true as const, idempotent: false as const };
}

export function validateDevApprovalReset(status: string) {
  return status === "approved"
    ? { ok: true as const }
    : { ok: false as const, error: "DEV approval reset is only available for an approved Billing Period." };
}

export async function approveMonthlyObligation({ billingPeriodId, reviewFingerprint }: { billingPeriodId: string; reviewFingerprint?: string }) {
  const staffContext = await getStaffContext();
  if (!staffContext) return { data: null, error: "Staff context unavailable." };
  if (!canApproveMonthlyObligation(staffContext.roleKeys)) {
    return { data: null, error: "Only an authorized financial administrator can approve Monthly Obligations." };
  }

  const building = getFixedBuildingIdentity();
  const supabase = await createClient();
  const periodResult = await supabase
    .from("tb810_billing_periods")
    .select("id,status,period_year,period_month")
    .eq("id", billingPeriodId)
    .eq("building_id", building.id)
    .maybeSingle();

  if (periodResult.error) return { data: null, error: periodResult.error.message };
  if (!periodResult.data) return { data: null, error: "Billing Period not found." };

  const transition = validateApprovalTransition(String(periodResult.data.status));
  if (!transition.ok) return { data: null, error: transition.error };
  if (transition.idempotent) return { data: { status: "approved" }, error: null };

  const factsResult = await loadBuildingMonthFinancialFacts({
    buildingId: building.id,
    obligationMonth: `${periodResult.data.period_year}-${String(periodResult.data.period_month).padStart(2, "0")}`,
    client: supabase,
  });
  if (factsResult.error || !factsResult.data) return { data: null, error: factsResult.error ?? "Building month facts unavailable." };
  const facts = factsResult.data.current;
  const hasPersistedSnapshot = facts.obligationSnapshot !== null;
  if (!hasPersistedSnapshot && reviewFingerprint && buildFinancialReviewFingerprint(facts) !== reviewFingerprint) {
    return { data: null, error: "The Monthly Obligations package changed. Review it again before approving." };
  }

  const calculation = hasPersistedSnapshot
    ? null
    : await getSnapshotCalculation({
        buildingId: building.id,
        buildingName: building.name,
        obligationMonth: facts.obligationMonth,
        facts,
        supabase,
      });
  if (calculation?.error || (calculation && !calculation.data)) {
    return { data: null, error: calculation.error ?? "Monthly obligation package is not ready." };
  }

  const devSession = process.env.NODE_ENV === "development"
    ? await getActiveDevTestSessionSummary()
    : null;
  if (!hasPersistedSnapshot && process.env.NODE_ENV === "development" && !devSession) {
    return { data: null, error: "Start a DEV test session first." };
  }

  const approvalResult = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: { status: string } | null; error: { message: string } | null }>;
  }).rpc(!hasPersistedSnapshot && devSession ? "tb810_approve_dev_monthly_obligation" : "tb810_approve_monthly_obligation", {
    ...(devSession && !hasPersistedSnapshot ? { p_session_id: devSession.id } : {}),
    p_billing_period_id: billingPeriodId,
    p_period_year: periodResult.data.period_year,
    p_period_month: periodResult.data.period_month,
    p_rows: calculation?.data?.rows ?? [],
    p_gas_bill_ids: calculation?.data?.gasBillIds ?? [],
  });
  if (approvalResult.error) return { data: null, error: approvalResult.error.message };
  if (!approvalResult.data) return { data: null, error: "Monthly Obligation approval failed." };
  return { data: { status: String(approvalResult.data.status) }, error: null };
}

export async function resetCurrentMonthlyObligationApprovalForDev() {
  if (process.env.NODE_ENV !== "development") {
    return { data: null, error: "DEV approval reset is development-only." };
  }

  const session = await getActiveDevTestSessionSummary();
  if (!session) return { data: null, error: "Start a DEV test session first." };

  const businessNow = await getBusinessNow();
  const building = getFixedBuildingIdentity();
  const periodYear = businessNow.getUTCFullYear();
  const periodMonth = businessNow.getUTCMonth() + 1;
  const supabase = await createClient();
  const periodResult = await supabase
    .from("tb810_billing_periods")
    .select("id,status,period_year,period_month")
    .eq("building_id", building.id)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (periodResult.error) return { data: null, error: periodResult.error.message };
  if (!periodResult.data) return { data: null, error: "Current Billing Period not found." };

  const transition = validateDevApprovalReset(String(periodResult.data.status));
  if (!transition.ok) return { data: null, error: transition.error };

  const updateResult = await supabase
    .from("tb810_billing_periods")
    .update({ status: "ready_for_review", approved_at: null, approved_by: null })
    .eq("id", periodResult.data.id)
    .eq("building_id", building.id)
    .eq("status", "approved")
    .select("status,approved_at,approved_by")
    .maybeSingle();

  if (updateResult.error) return { data: null, error: updateResult.error.message };
  if (!updateResult.data) return { data: null, error: "Billing Period changed before DEV approval reset." };

  return { data: { status: String(updateResult.data.status) }, error: null };
}
