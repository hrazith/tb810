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

export async function getBusinessMonthKey() {
  const now = await getBusinessNow();
  // The override only changes the business day; charge month logic still uses UTC month boundaries.
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
