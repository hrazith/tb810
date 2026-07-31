export function parseWaterMonthKey(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return `${match[1]}-${match[2]}`;
}

export function getWaterMonthStart(monthKey: string) {
  return `${monthKey}-01`;
}

export function getNextWaterMonthKey(monthKey: string) {
  const parsed = new Date(`${getWaterMonthStart(monthKey)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const next = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

