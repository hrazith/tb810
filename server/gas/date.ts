import { parseReadingDate } from "@/lib/water-dates";

export function isGasReadingDateInMonth(readingDate: string, readingMonth: string) {
  const parsed = parseReadingDate(readingDate);
  if (!parsed || !/^\d{4}-\d{2}$/.test(readingMonth)) return false;

  const normalizedDate = parsed.toISOString().slice(0, 10);
  return normalizedDate === readingDate && normalizedDate.slice(0, 7) === readingMonth;
}

export function gasReadingMonthForImport(targetReadingMonth: string) {
  return `${targetReadingMonth}-01`;
}
