import { getBusinessMonthKey } from "../business-date";

export function monthStart(monthKey: string) {
  return `${monthKey}-01`;
}

export function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function firstDayOfMonth(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : monthStart(monthKey);
}

export function previousMonthKey(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() - 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function currentMonthKey() {
  return getBusinessMonthKey();
}

export function nextMonthKey(monthKey: string) {
  const parsed = new Date(`${monthStart(monthKey)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function defaultStartMonthForNewCharge(referenceMonth: string) {
  return nextMonthKey(referenceMonth) ?? referenceMonth;
}

export function isChargeEligibleForMonth(args: {
  schedule: "one_off" | "recurring";
  effectiveFromMonth: string;
  effectiveToMonth: string | null;
  obligationMonth: string;
}) {
  const { schedule, effectiveFromMonth, effectiveToMonth, obligationMonth } = args;
  if (schedule === "one_off") {
    return effectiveFromMonth === obligationMonth;
  }
  if (effectiveFromMonth > obligationMonth) return false;
  if (!effectiveToMonth) return true;
  return effectiveToMonth >= obligationMonth;
}
