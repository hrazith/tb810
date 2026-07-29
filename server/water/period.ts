export type WaterPeriod = {
  year: number;
  month: number;
  periodKey: string;
  periodLabel: string;
  periodStartIso: string;
  periodEndIso: string;
};

export function parseWaterPeriodKey(periodKey: string): WaterPeriod | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));
  const periodLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodStart);

  return {
    year,
    month,
    periodKey,
    periodLabel,
    periodStartIso: periodStart.toISOString().slice(0, 10),
    periodEndIso: periodEnd.toISOString().slice(0, 10),
  };
}

export function formatWaterPeriodKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getNextWaterPeriodKey(periodKey: string) {
  const period = parseWaterPeriodKey(periodKey);
  if (!period) return null;

  const next = new Date(Date.UTC(period.year, period.month, 1));
  return formatWaterPeriodKey(next);
}

export function getCurrentWaterPeriodKey(now = new Date()) {
  return formatWaterPeriodKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}
