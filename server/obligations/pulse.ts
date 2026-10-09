import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getFixedBuildingIdentity } from "@/server/building";
import { createSystemClient } from "@/server/supabase/system";
import { loadGiulianaPackageProgression } from "./progression";
import { createMonthlyObligationHandoff, isHandoffCalendarEligible, type HandoffPersistence } from "./snapshot";

const PROGRESSED_STATUSES = new Set(["ready_for_review", "approved", "invoices_generated", "closed"]);

export type MonthlyObligationPulseStatus = "handed_off" | "not_ready" | "not_eligible" | "already_progressed" | "error";

// FIN-008 operational/source clock: the system Pulse establishes the current
// operational month's Billing Period container, independently of progression.
export type OperationalMonthResult =
  | { status: "ensured"; month: string; billingPeriodId: string; created: boolean }
  | { status: "error"; reason: string };

export type MonthlyObligationPulseResult = {
  status: MonthlyObligationPulseStatus;
  operationalMonth?: OperationalMonthResult;
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

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

// The month comes from the database clock. A failure is reported, never
// worked around, and never gates obligation progression.
export async function ensureOperationalMonth(client: unknown, buildingId: string): Promise<OperationalMonthResult> {
  try {
    const { data, error } = await (client as RpcClient).rpc("tb810_ensure_operational_billing_period_system", { p_building_id: buildingId });
    if (error) return { status: "error", reason: error.message };
    const payload = data as { billingPeriodId?: string; month?: string; created?: boolean } | null;
    if (!payload?.billingPeriodId || !payload.month) return { status: "error", reason: "Operational month container unavailable." };
    return { status: "ensured", month: payload.month, billingPeriodId: payload.billingPeriodId, created: payload.created === true };
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "Operational month container unavailable." };
  }
}

export async function runMonthlyObligationPulse(executionContext: PulseExecutionContext = "human", persistence?: HandoffPersistence): Promise<MonthlyObligationPulseResult> {
  const building = getFixedBuildingIdentity();
  const businessNow = await getBusinessNow();
  const year = businessNow.getUTCFullYear();
  const month = businessNow.getUTCMonth() + 1;
  const obligationMonth = `${year}-${String(month).padStart(2, "0")}`;
  const supabase = executionContext === "system" ? createSystemClient() : await createClient();
  // Operational clock first; obligation progression is evaluated regardless.
  const operationalMonth = executionContext === "system" ? await ensureOperationalMonth(supabase, building.id) : undefined;
  const result = await evaluateObligationProgression({ executionContext, persistence, building, businessNow, obligationMonth, supabase });
  return operationalMonth ? { ...result, operationalMonth } : result;
}

async function evaluateObligationProgression({
  executionContext,
  persistence,
  building,
  businessNow,
  obligationMonth,
  supabase,
}: {
  executionContext: PulseExecutionContext;
  persistence?: HandoffPersistence;
  building: { id: string; name: string };
  businessNow: Date;
  obligationMonth: string;
  supabase: SupabaseClient<Database>;
}): Promise<MonthlyObligationPulseResult> {
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
