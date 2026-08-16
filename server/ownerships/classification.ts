import type { OwnershipRecord, OwnershipWithRelations } from "./types";

function toBillingMonth(dateString: string) {
  return dateString.slice(0, 7);
}

export function classifyOwnershipRow(
  row: Pick<OwnershipRecord, "start_date" | "end_date">,
  currentBillingMonth: string,
): OwnershipWithRelations["ownership_status"] {
  const startMonth = toBillingMonth(row.start_date);
  const endMonth = row.end_date ? toBillingMonth(row.end_date) : null;

  if (startMonth > currentBillingMonth) return "scheduled";
  if (endMonth !== null && endMonth < currentBillingMonth) return "past";
  if (startMonth <= currentBillingMonth && (endMonth === null || endMonth >= currentBillingMonth)) {
    return "current";
  }
  return "past";
}
