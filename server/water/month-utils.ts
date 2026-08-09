export function previousMonthKeyFromMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setUTCMonth(parsed.getUTCMonth() - 1);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function countCommonWaterCondoUnits(
  units: Array<{
    unit_type_code: string;
  }>,
) {
  return units.filter((unit) => unit.unit_type_code === "condo").length;
}
