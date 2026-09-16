import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { createSystemClient } from "@/server/supabase/system";
import { selectProgressionPackage } from "./package-selection";
import { createMonthlyObligationSnapshot } from "./snapshot";

const PROGRESSED_STATUSES = new Set(["ready_for_review", "approved", "invoices_generated", "closed"]);

export type MonthlyObligationPulseStatus = "snapshotted" | "not_ready" | "already_progressed" | "error";

export type MonthlyObligationPulseResult = {
  status: MonthlyObligationPulseStatus;
  buildingId: string;
  obligationMonth: string;
  billingPeriodId?: string;
  billingPeriodStatus?: string;
  obligationRowCount?: number;
  reason?: string;
};

export function isSnapshotProgressedStatus(status: string | null | undefined) {
  return status ? PROGRESSED_STATUSES.has(status) : false;
}

export function mapSnapshotResult({
  buildingId,
  obligationMonth,
  result,
}: {
  buildingId: string;
  obligationMonth: string;
  result: {
    data: { billingPeriodId: string; status: string; obligationRowCount: number } | null;
    error: string | null;
    failureKind?: "not_ready" | "error";
  };
}): MonthlyObligationPulseResult {
  if (result.data?.status === "already_snapshotted") {
    return { status: "already_progressed", buildingId, obligationMonth, billingPeriodId: result.data.billingPeriodId, billingPeriodStatus: result.data.status, obligationRowCount: result.data.obligationRowCount };
  }
  if (result.data) {
    return { status: "snapshotted", buildingId, obligationMonth, billingPeriodId: result.data.billingPeriodId, billingPeriodStatus: result.data.status, obligationRowCount: result.data.obligationRowCount };
  }
  return { status: result.failureKind === "not_ready" ? "not_ready" : "error", buildingId, obligationMonth, reason: result.error ?? "Monthly obligation pulse failed." };
}

export type PulseExecutionContext = "human" | "system";

export async function runMonthlyObligationPulse(executionContext: PulseExecutionContext = "human"): Promise<MonthlyObligationPulseResult> {
  const building = getFixedBuildingIdentity();
  const businessNow = await getBusinessNow();
  const year = businessNow.getUTCFullYear();
  const month = businessNow.getUTCMonth() + 1;
  const obligationMonth = `${year}-${String(month).padStart(2, "0")}`;
  const supabase = executionContext === "system" ? createSystemClient() : await createClient();
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const periodResult = await supabase
    .from("tb810_billing_periods")
    .select("id,status,period_year,period_month")
    .eq("building_id", building.id)
    .or(`and(period_year.eq.${year},period_month.eq.${month}),and(period_year.eq.${nextMonth.year},period_month.eq.${nextMonth.month})`);

  if (periodResult.error) return { status: "error", buildingId: building.id, obligationMonth, reason: periodResult.error.message };
  const lifecycleByMonth = new Map((periodResult.data ?? []).map((period) => {
    const monthKey = `${period.period_year}-${String(period.period_month).padStart(2, "0")}`;
    return [monthKey, { obligationMonth: monthKey, mode: "snapshotted" as const, status: String(period.status), id: String(period.id) }];
  }));
  const current = lifecycleByMonth.get(obligationMonth) ?? { obligationMonth, mode: "live" as const, status: null, id: null };
  const upcomingKey = `${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}`;
  const upcoming = lifecycleByMonth.get(upcomingKey) ?? { obligationMonth: upcomingKey, mode: "live" as const, status: null, id: null };
  const candidate = selectProgressionPackage({ current, upcoming });
  const existing = lifecycleByMonth.get(candidate.obligationMonth);
  if (existing && isSnapshotProgressedStatus(existing.status)) {
    return { status: "already_progressed", buildingId: building.id, obligationMonth: candidate.obligationMonth, billingPeriodId: existing.id, billingPeriodStatus: existing.status };
  }

  const snapshotResult = await createMonthlyObligationSnapshot({ buildingId: building.id, buildingName: building.name, obligationMonth: candidate.obligationMonth, executionContext });
  return mapSnapshotResult({ buildingId: building.id, obligationMonth: candidate.obligationMonth, result: snapshotResult });
}
