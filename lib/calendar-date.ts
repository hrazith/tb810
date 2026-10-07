// Canonical TB810 calendar dates.
//
// Machine/form/database value: YYYY-MM-DD.
// Operator presentation and entry: DD/MM/YYYY, for every UI language.
//
// Dates are handled as plain year/month/day numbers. Nothing here parses
// through JavaScript Date heuristics, so a value can never shift by a day with
// the process timezone, and impossible dates (31/02/2026) are rejected rather
// than rolled over into the next month.

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

const CANONICAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRealDate({ year, month, day }: CalendarDateParts) {
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

export function toCanonicalDate({ year, month, day }: CalendarDateParts) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** YYYY-MM-DD → parts, or null when the value is not a real calendar date. */
export function parseCanonicalDate(value: string | null | undefined): CalendarDateParts | null {
  const match = CANONICAL_PATTERN.exec(value ?? "");
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isRealDate(parts) ? parts : null;
}

/** YYYY-MM-DD → DD/MM/YYYY, or null when the value is not a real calendar date. */
export function formatCalendarDate(value: string | null | undefined) {
  const parts = parseCanonicalDate(value);
  return parts ? `${pad(parts.day, 2)}/${pad(parts.month, 2)}/${pad(parts.year, 4)}` : null;
}

/** DD/MM/YYYY → YYYY-MM-DD, or null when the text is not a complete real date. */
export function parseDisplayDate(text: string | null | undefined) {
  const match = DISPLAY_PATTERN.exec((text ?? "").trim());
  if (!match) return null;
  const parts = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  return isRealDate(parts) ? toCanonicalDate(parts) : null;
}

/**
 * Progressive DD/MM/YYYY entry mask: keeps up to eight digits and inserts the
 * separators, so typing 06102026 reads 06/10/2026. It never reorders fields.
 */
export function maskDisplayDate(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Shift a calendar date by whole days without involving any timezone. */
export function addCalendarDays(value: string, days: number) {
  const parts = parseCanonicalDate(value);
  if (!parts) return null;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return toCanonicalDate({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

/** Monday-first weekday index (0 = Monday … 6 = Sunday) of a calendar date. */
export function weekdayIndex(value: string) {
  const parts = parseCanonicalDate(value);
  if (!parts) return null;
  return (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
}

/** The operator's own calendar day (local clock), as YYYY-MM-DD. */
export function todayCanonicalDate(now = new Date()) {
  return toCanonicalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
