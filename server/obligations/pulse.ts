import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { createSystemClient } from "@/server/supabase/system";
import { loadGiulianaPackageProgression } from "./progression";
import { createMonthlyObligationHandoff, isHandoffCalendarEligible, type HandoffPersistence } from "./snapshot";

const PROGRESSED_STATUSES = new Set(["ready_for_review", "approved", "invoices_generated", "closed"]);

export type MonthlyObligationPulseStatus = "handed_off" | "not_ready" | "not_eligible" | "already_progressed" | "error";

export type MonthlyObligationPulseResult = {
  status: MonthlyObligationPulseStatus;
  buildingId: string;
  obligationMonth: string;
  billingPeriodId?: string;
  billingPeriodStatus?: string;
  obligationRowCount?: number;
  reason?: string;
  diagnostics?: {
    businessDate: string;
    operatingMonth: string;
    candidateObligationMonth: string | null;
    calendar: "eligible" | "not_eligible" | "unknown";
    calculation: "ready" | "blocked" | "unknown";
    blockers: string[];
  };
};

export function isSnapshotProgressedStatus(status: string | null | undefined) {
  return status ? PROGRESSED_STATUSES.has(status) : false;
}

export { isHandoffCalendarEligible };

export function mapSnapshotResult({
  buildingId,
  obligationMonth,
  result,
  diagnostics,
}: {
  buildingId: string;
  obligationMonth: string;
  result: {
    data: { billingPeriodId: string; status: string; obligationRowCount: number } | null;
    error: string | null;
    failureKind?: "not_ready" | "not_eligible" | "error";
    diagnostics?: { calculationReady: boolean; blockers: string[] };
  };
  diagnostics?: MonthlyObligationPulseResult["diagnostics"];
}): MonthlyObligationPulseResult {
  const withDiagnostics = <T extends object>(result: T) => diagnostics ? { ...result, diagnostics } : result;
  if (result.data?.status === "already_snapshotted") {
    return withDiagnostics({ status: "already_progressed" as const, buildingId, obligationMonth, billingPeriodId: result.data.billingPeriodId, billingPeriodStatus: result.data.status, obligationRowCount: result.data.obligationRowCount });
  }
  if (result.data) {
    return withDiagnostics({ status: "handed_off" as const, buildingId, obligationMonth, billingPeriodId: result.data.billingPeriodId, billingPeriodStatus: result.data.status, obligationRowCount: result.data.obligationRowCount });
  }
  return withDiagnostics({ status: result.failureKind === "not_ready" ? "not_ready" as const : result.failureKind === "not_eligible" ? "not_eligible" as const : "error" as const, buildingId, obligationMonth, reason: result.error ?? "Monthly obligation pulse failed." });
}

export type PulseExecutionContext = "human" | "system";

export async function runMonthlyObligationPulse(executionContext: PulseExecutionContext = "human", persistence?: HandoffPersistence): Promise<MonthlyObligationPulseResult> {
  const building = getFixedBuildingIdentity();
  const businessNow = await getBusinessNow();
  const year = businessNow.getUTCFullYear();
  const month = businessNow.getUTCMonth() + 1;
  const obligationMonth = `${year}-${String(month).padStart(2, "0")}`;
  const supabase = executionContext === "system" ? createSystemClient() : await createClient();
  const progressionResult = await loadGiulianaPackageProgression({ buildingId: building.id, startMonth: obligationMonth, client: supabase });
  if (progressionResult.error || !progressionResult.data) {
    return {
      status: "error",
      buildingId: building.id,
      obligationMonth,
      reason: progressionResult.error ?? "Giuliana package progression unavailable.",
      ...(executionContext === "human" ? { diagnostics: { businessDate: businessNow.toISOString().slice(0, 10), operatingMonth: obligationMonth, candidateObligationMonth: null, calendar: "unknown" as const, calculation: "unknown" as const, blockers: [progressionResult.error ?? "Giuliana package progression unavailable."] } } : {}),
    };
  }
  const candidate = progressionResult.data.activePackage;

  const handoffResult = await createMonthlyObligationHandoff({ buildingId: building.id, buildingName: building.name, obligationMonth: candidate.obligationMonth, operatingMonth: obligationMonth, executionContext, persistence });
  return mapSnapshotResult({
    buildingId: building.id,
    obligationMonth: candidate.obligationMonth,
    result: handoffResult,
    diagnostics: executionContext === "human" ? {
      businessDate: businessNow.toISOString().slice(0, 10),
      operatingMonth: obligationMonth,
      candidateObligationMonth: candidate.obligationMonth,
      calendar: isHandoffCalendarEligible(candidate.obligationMonth, obligationMonth) ? "eligible" : "not_eligible",
      calculation: handoffResult.diagnostics ? handoffResult.diagnostics.calculationReady ? "ready" : "blocked" : "unknown",
      blockers: handoffResult.diagnostics?.blockers ?? [],
    } : undefined,
  });
}
