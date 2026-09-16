import { nextMonthKey } from "@/server/charges/month";

export type ObligationPackageLifecycle = {
  obligationMonth: string;
  mode: "live" | "snapshotted";
  status: string | null;
};

const APPROVED_STATUSES = new Set(["approved", "invoices_generated", "closed"]);

export function isApprovedPackage(lifecycle: Pick<ObligationPackageLifecycle, "mode" | "status">) {
  return lifecycle.mode === "snapshotted" && lifecycle.status !== null && APPROVED_STATUSES.has(lifecycle.status);
}

export function selectFinancialFocus(currentLifecycle: Pick<ObligationPackageLifecycle, "mode" | "status">) {
  return isApprovedPackage(currentLifecycle) ? "upcoming" as const : "current" as const;
}

export function selectProgressionPackage({
  current,
  upcoming,
}: {
  current: ObligationPackageLifecycle;
  upcoming: ObligationPackageLifecycle;
}) {
  const responsibility = isApprovedPackage(current) ? upcoming : current;
  if (!isApprovedPackage(responsibility)) return responsibility;

  return {
    obligationMonth: nextMonthKey(responsibility.obligationMonth) ?? responsibility.obligationMonth,
    mode: "live" as const,
    status: null,
  };
}
