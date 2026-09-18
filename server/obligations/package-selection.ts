import { nextMonthKey } from "@/server/charges/month";

export type ObligationPackageLifecycle = {
  obligationMonth: string;
  mode: "live" | "snapshotted";
  status: string | null;
};

const APPROVED_STATUSES = new Set(["approved", "invoices_generated", "closed"]);
const HANDED_OFF_STATUSES = new Set(["ready_for_review", ...APPROVED_STATUSES]);

export function isApprovedPackage(lifecycle: Pick<ObligationPackageLifecycle, "mode" | "status">) {
  return lifecycle.mode === "snapshotted" && lifecycle.status !== null && APPROVED_STATUSES.has(lifecycle.status);
}

export function isHandedOffPackage(lifecycle: Pick<ObligationPackageLifecycle, "mode" | "status">) {
  return lifecycle.status !== null && HANDED_OFF_STATUSES.has(lifecycle.status);
}

export function selectFinancialFocus(currentLifecycle: Pick<ObligationPackageLifecycle, "mode" | "status">) {
  return isHandedOffPackage(currentLifecycle) ? "upcoming" as const : "current" as const;
}

export function selectProgressionPackage({
  current,
  upcoming,
}: {
  current: ObligationPackageLifecycle;
  upcoming: ObligationPackageLifecycle;
}) {
  const responsibility = isHandedOffPackage(current) ? upcoming : current;
  if (!isHandedOffPackage(responsibility)) return responsibility;

  return {
    obligationMonth: nextMonthKey(responsibility.obligationMonth) ?? responsibility.obligationMonth,
    mode: "live" as const,
    status: null,
  };
}
