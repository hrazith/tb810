export function previousMonthKeyFromMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() - 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Gas meters are read at the start of each month, so the reading filed in
// month S closes the usage of S-1. Usage of month M is billed in obligation
// month M+1, which therefore consumes the Gas reading month equal to itself.
// Unit Water and Sedapal keep consuming the previous source month.
export function gasSourceMonthForObligationMonth(obligationMonth: string) {
  return obligationMonth;
}

// The obligation package that consumes (and freezes) a Gas reading month.
export function gasObligationMonthForSourceMonth(readingMonth: string) {
  return readingMonth;
}

export function firstDayOfMonth(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : `${monthKey}-01`;
}

// A purchase belongs to an obligation month's live pool only when the operator
// selected it for that month; the purchase date never assigns membership.
export function isEligibleGasBill(
  bill: { selected_obligation_month: string | null; processed_at: string | null; reserved_billing_period_id: string | null },
  obligationMonth: string,
) {
  if (!firstDayOfMonth(obligationMonth)) return false;
  return bill.processed_at === null
    && bill.reserved_billing_period_id === null
    && bill.selected_obligation_month?.slice(0, 7) === obligationMonth;
}
