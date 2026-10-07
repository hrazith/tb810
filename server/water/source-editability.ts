export const FINALIZED_OBLIGATION_STATUSES = ["approved", "invoices_generated", "closed"] as const;

const FINALIZED_STATUS_SET = new Set<string>(FINALIZED_OBLIGATION_STATUSES);

export function isSourceMonthEditable({
  sourceMonth,
  activeMonth,
  consumingPackage,
}: {
  sourceMonth: string;
  activeMonth: string;
  consumingPackage: { status: string } | null;
}) {
  if (sourceMonth > activeMonth) return false;
  if (consumingPackage && FINALIZED_STATUS_SET.has(consumingPackage.status)) return false;
  return true;
}

function nextMonthKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function previousMonthKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/**
 * Unit Water's primary working month: the source month consumed by
 * Giuliana's active K6 package (activePackage - 1). Source work never runs
 * ahead of the operating month, so early handoffs clamp to it. Editability is
 * still decided by isSourceMonthEditable; this only orients the workspace.
 */
export function primaryUnitWaterSourceMonth({
  activeObligationMonth,
  operatingMonth,
}: {
  activeObligationMonth: string;
  operatingMonth: string;
}) {
  const sourceMonth = previousMonthKey(activeObligationMonth);
  return sourceMonth > operatingMonth ? operatingMonth : sourceMonth;
}

/** Orientation label for an open source month relative to the primary month. */
export function unitWaterMonthNote({
  month,
  primaryMonth,
  sourceMonthOpen,
}: {
  month: string;
  primaryMonth: string;
  sourceMonthOpen: boolean;
}) {
  if (!sourceMonthOpen) return undefined;
  if (month === primaryMonth) return "Current work";
  return month > primaryMonth ? "Next source work" : "Open for corrections";
}

/**
 * Source months that can still hold unconsumed source work, to be evaluated
 * with isSourceMonthEditable.
 *
 * Packages are approved oldest-first, so finalized consuming packages form a
 * frozen prefix: every source month before the latest finalized consuming
 * package F is consumed by a finalized package. Only F's own source month
 * onward (F, F+1, ... up to the operating month) can be open. With no
 * finalized package yet, only the operating month is a candidate.
 */
export function sourceMonthCandidates({
  latestFinalizedConsumingMonth,
  operatingMonth,
}: {
  latestFinalizedConsumingMonth: string | null;
  operatingMonth: string;
}) {
  const months: string[] = [];
  for (let month = latestFinalizedConsumingMonth ?? operatingMonth; month <= operatingMonth; month = nextMonthKey(month)) {
    months.push(month);
  }
  return months;
}
