export function parseReadingDate(readingDate: string) {
  const parsed = new Date(`${readingDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getServiceMonthFromReadingDate(readingDate: string) {
  const parsed = parseReadingDate(readingDate);
  if (!parsed) return null;

  const serviceMonth = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  serviceMonth.setUTCMonth(serviceMonth.getUTCMonth() - 1);
  return serviceMonth;
}

export function getChargeMonthFromServiceMonth(serviceMonth: Date | null) {
  if (!serviceMonth) return null;
  const chargeMonth = new Date(Date.UTC(serviceMonth.getUTCFullYear(), serviceMonth.getUTCMonth(), 1));
  chargeMonth.setUTCMonth(chargeMonth.getUTCMonth() + 1);
  return chargeMonth;
}

export function formatMonthYear(date: Date | null, locale = "en-US") {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPeruvianDate(readingDate: string) {
  const parsed = parseReadingDate(readingDate);
  if (!parsed) return readingDate;

  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
