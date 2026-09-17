import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { createSystemClient } from "@/server/supabase/system";
import { loadGiulianaPackageProgression } from "./progression";
import { createMonthlyObligationSnapshot, type SnapshotPersistence } from "./snapshot";

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

export async function runMonthlyObligationPulse(executionContext: PulseExecutionContext = "human", persistence?: SnapshotPersistence): Promise<MonthlyObligationPulseResult> {
  const building = getFixedBuildingIdentity();
  const businessNow = await getBusinessNow();
  const year = businessNow.getUTCFullYear();
  const month = businessNow.getUTCMonth() + 1;
  const obligationMonth = `${year}-${String(month).padStart(2, "0")}`;
  const supabase = executionContext === "system" ? createSystemClient() : await createClient();
  const progressionResult = await loadGiulianaPackageProgression({ buildingId: building.id, startMonth: obligationMonth, client: supabase });
  if (progressionResult.error || !progressionResult.data) {
    return { status: "error", buildingId: building.id, obligationMonth, reason: progressionResult.error ?? "Giuliana package progression unavailable." };
  }
  const candidate = progressionResult.data.activePackage;

  const snapshotResult = await createMonthlyObligationSnapshot({ buildingId: building.id, buildingName: building.name, obligationMonth: candidate.obligationMonth, executionContext, persistence });
  return mapSnapshotResult({ buildingId: building.id, obligationMonth: candidate.obligationMonth, result: snapshotResult });
}
