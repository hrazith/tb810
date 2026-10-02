const FINALIZED_OBLIGATION_STATUSES = new Set(["approved", "invoices_generated", "closed"]);

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
  if (consumingPackage && FINALIZED_OBLIGATION_STATUSES.has(consumingPackage.status)) return false;
  return true;
}
