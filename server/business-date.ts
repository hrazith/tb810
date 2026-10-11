import { cookies } from "next/headers";

const BUSINESS_DATE_COOKIE = "tb810_dev_business_date";

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function parseBusinessDateCookieValue(rawValue: string | undefined) {
  if (!rawValue || !isValidDateKey(rawValue)) return null;
  return rawValue;
}

export function resolveBusinessNowFromCookieValue(
  rawValue: string | undefined,
  fallbackNow = new Date(),
) {
  const override = parseBusinessDateCookieValue(rawValue);
  if (!override) return fallbackNow;
  return new Date(`${override}T00:00:00Z`);
}

export function getBusinessDateCookieName() {
  return BUSINESS_DATE_COOKIE;
}

export async function getBusinessNow() {
  if (process.env.NODE_ENV !== "development") {
    return new Date();
  }

  const cookieStore = await cookies();
  return resolveBusinessNowFromCookieValue(cookieStore.get(BUSINESS_DATE_COOKIE)?.value);
}

export const BUSINESS_TIME_ZONE = "America/Lima";

/** YYYY-MM-DD of `now` as a calendar date in TB810's business time zone. */
export function businessDateKeyAt(now: Date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Current calendar month in America/Lima. A DEV business-date override is
 * already a business-local date, so it is used as-is rather than shifted.
 */
export async function getBusinessCalendarMonthKey() {
  if (process.env.NODE_ENV === "development") {
    const override = parseBusinessDateCookieValue((await cookies()).get(BUSINESS_DATE_COOKIE)?.value);
    if (override) return override.slice(0, 7);
  }
  return businessDateKeyAt(new Date()).slice(0, 7);
}

export async function getBusinessMonthKey() {
  const now = await getBusinessNow();
  // The override only changes the business day; charge month logic still uses UTC month boundaries.
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
