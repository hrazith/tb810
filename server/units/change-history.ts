// Unit change history: one event per Unit edit, recorded by tb810_update_unit.
// Stored changes use stable field keys; labels and values are formatted here.

export type UnitChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type UnitChangeEvent = {
  id: string;
  actor_display_name: string;
  reason: string;
  changes: UnitChange[];
  created_at: string;
};

export const UNIT_CHANGE_FIELD_LABELS: Record<string, string> = {
  unit_type: "Type",
  unit_number: "Unit number",
  floor: "Floor",
  registered_area_m2: "Registered area",
  participation_percentage: "Participation percentage",
  has_meter: "Individual water meter",
  has_gas_service: "Gas service",
  notes: "Legacy notes (imported)",
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  condo: "Residential",
  parking: "Parking",
  storage: "Storage",
};

function trimNumber(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

export function formatUnitChangeValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "unit_type") return UNIT_TYPE_LABELS[String(value)] ?? String(value);
  if (field === "participation_percentage" && Number.isFinite(Number(value))) return `${trimNumber(Number(value), 4)}%`;
  if (field === "registered_area_m2" && Number.isFinite(Number(value))) return `${trimNumber(Number(value), 3)} m²`;
  return String(value);
}

export function describeUnitChange(change: UnitChange) {
  return {
    label: UNIT_CHANGE_FIELD_LABELS[change.field] ?? change.field,
    before: formatUnitChangeValue(change.field, change.before),
    after: formatUnitChangeValue(change.field, change.after),
  };
}

export function formatUnitChangeTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(new Date(value));
}
