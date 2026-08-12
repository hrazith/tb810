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

export function isEligibleGasBill(invoiceDate: string, processedAt: string | null, obligationMonth: string) {
  const boundary = firstDayOfMonth(obligationMonth);
  if (!boundary) return false;
  return processedAt === null && invoiceDate < boundary;
}
