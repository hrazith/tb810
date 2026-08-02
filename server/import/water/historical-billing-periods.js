function parsePeriodKey(periodKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const startsOn = new Date(Date.UTC(year, month - 1, 1));
  const endsOn = new Date(Date.UTC(year, month, 0));

  return {
    periodKey,
    periodYear: year,
    periodMonth: month,
    startsOn: startsOn.toISOString().slice(0, 10),
    endsOn: endsOn.toISOString().slice(0, 10),
  };
}

export function buildHistoricalBillingPeriodSequence(startKey, endKey) {
  const start = parsePeriodKey(startKey);
  const end = parsePeriodKey(endKey);
  if (!start || !end) {
    throw new Error("Invalid billing period range.");
  }

  const months = [];
  let current = new Date(Date.UTC(start.periodYear, start.periodMonth - 1, 1));
  const last = new Date(Date.UTC(end.periodYear, end.periodMonth - 1, 1));

  while (current <= last) {
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push({
      ...parsePeriodKey(key),
      status: year === 2026 && month === 8 ? "collecting_readings" : "closed",
    });
    current = new Date(Date.UTC(year, month, 1));
  }

  return months;
}

export function monthLabel(periodYear, periodMonth) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(periodYear, periodMonth - 1, 1)));
}

export function monthsBetween(startKey, endKey) {
  return buildHistoricalBillingPeriodSequence(startKey, endKey).map((period) => period.periodKey);
}
