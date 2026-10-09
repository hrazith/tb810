export function previousMonthKeyFromMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() - 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
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
