export type LegacyUnitTypeRow = {
  id?: string | number | null;
  name?: string | null;
};

export type LegacyUnitImportRow = {
  legacy_id?: string | number | null;
  building_id?: string | number | null;
  building_legacy_id?: string | number | null;
  unit_number?: string | number | null;
  unit_type_id?: string | number | null;
  unit_type?: string | null;
  unit_type_code?: string | null;
  unit_type_name?: string | null;
  floor?: string | number | null;
  unit_percentage?: string | number | null;
  filename?: string | null;
  has_meter?: boolean | number | string | null;
  bill_adjustment?: string | number | null;
  comments?: string | null;
  registered_area_m2?: string | number | null;
};

export type CanonicalUnitTypeSeed = {
  code: "condo" | "parking" | "storage";
  name: string;
  sort_order: number;
};

export type ParticipationScale = "fraction" | "percentage_points" | "unknown";

export type ParticipationScaleDetection = {
  scale: ParticipationScale;
  sampleCount: number;
  minimum: number | null;
  maximum: number | null;
  sum: number | null;
};

export type NormalizedUnitImportRow = {
  sourceRow: LegacyUnitImportRow;
  legacyId: string;
  unitNumber: string;
  canonicalUnitNumber: string;
  unitTypeCode: CanonicalUnitTypeSeed["code"];
  floor: string | null;
  participationPercentage: number;
  displayName: string;
  registeredAreaM2: number | null;
  hasMeter: boolean | null;
  displayOrder: number;
  legacyMetadata: Record<string, unknown>;
};

export type PrototypeCleanupCandidate = {
  unitId: string;
  unitNumber: string;
  legacyId: string | null;
  legacyTable: string | null;
  reason: string;
};

export type UnitImportReport = {
  sourceFile: string;
  detectedParticipationScale: ParticipationScaleDetection;
  totalSourceRows: number;
  totalImportedRows: number;
  totalSkippedRows: number;
  totalWarnings: number;
  warnings: string[];
  missingLegacyIds: string[];
  invalidParticipationPercentages: string[];
  unknownUnitTypes: string[];
  duplicateUnitNumbers: string[];
  missingBuildingReferences: string[];
  prototypeCleanupCandidates: PrototypeCleanupCandidate[];
};

const UNIT_TYPE_LOOKUP: Record<string, CanonicalUnitTypeSeed["code"]> = {
  condo: "condo",
  residential: "condo",
  apartment: "condo",
  departamento: "condo",
  parking: "parking",
  estacionamiento: "parking",
  storage: "storage",
  deposito: "storage",
};

export const canonicalUnitTypeSeeds: CanonicalUnitTypeSeed[] = [
  { code: "condo", name: "Residential", sort_order: 1 },
  { code: "parking", name: "Parking", sort_order: 2 },
  { code: "storage", name: "Storage", sort_order: 3 },
];

function asText(value: LegacyUnitImportRow[keyof LegacyUnitImportRow]) {
  if (value == null) return "";
  return String(value).trim();
}

function parseNumeric(value: LegacyUnitImportRow[keyof LegacyUnitImportRow]) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveUnitTypeCode(row: LegacyUnitImportRow) {
  const source = [row.unit_type_id, row.unit_type_code, row.unit_type_name, row.unit_type]
    .map((value) => asText(value).toLowerCase())
    .find(Boolean);

  if (!source) return null;

  if (source === "1") return "condo";
  if (source === "2") return "parking";
  if (source === "3") return "storage";

  return UNIT_TYPE_LOOKUP[source] ?? null;
}

export function detectParticipationScale(rows: LegacyUnitImportRow[]): ParticipationScaleDetection {
  const values = rows
    .map((row) => parseNumeric(row.unit_percentage))
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return {
      scale: "unknown",
      sampleCount: 0,
      minimum: null,
      maximum: null,
      sum: null,
    };
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const sum = values.reduce((accumulator, value) => accumulator + value, 0);

  if (maximum <= 1 && sum <= 1.5) {
    return {
      scale: "fraction",
      sampleCount: values.length,
      minimum,
      maximum,
      sum,
    };
  }

  return {
    scale: "percentage_points",
    sampleCount: values.length,
    minimum,
    maximum,
    sum,
  };
}

export function normalizeParticipationPercentage(
  value: LegacyUnitImportRow["unit_percentage"],
  scale: ParticipationScaleDetection["scale"],
) {
  const parsed = parseNumeric(value);
  if (parsed == null || parsed < 0) return null;
  if (scale === "fraction") return parsed * 100;
  return parsed;
}

export function normalizeRegisteredArea(value: LegacyUnitImportRow["registered_area_m2"]) {
  const parsed = parseNumeric(value);
  if (parsed == null || parsed < 0) return null;
  return parsed;
}

export function normalizeHasMeter(value: LegacyUnitImportRow["has_meter"]) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
}

export function buildDisplayName(row: LegacyUnitImportRow) {
  const unitNumber = asText(row.unit_number);
  const floor = asText(row.floor);
  if (!unitNumber) return "";
  return floor ? `Unit ${unitNumber} - Floor ${floor}` : `Unit ${unitNumber}`;
}

export function buildCanonicalUnitNumber(row: LegacyUnitImportRow, unitTypeCode: CanonicalUnitTypeSeed["code"]) {
  const unitNumber = asText(row.unit_number);
  const filename = asText(row.filename);
  if (unitTypeCode === "condo") return unitNumber;
  if (filename) return filename;
  return unitNumber;
}

export function buildLegacyMetadata(
  row: LegacyUnitImportRow,
  extras: Record<string, unknown> = {},
) {
  const metadata: Record<string, unknown> = {
    source_row: row,
    ...extras,
  };

  if (row.filename != null) metadata.filename = row.filename;
  if (row.bill_adjustment != null) metadata.bill_adjustment = row.bill_adjustment;
  if (row.has_meter != null) metadata.has_meter = row.has_meter;
  if (row.unit_type_code != null) metadata.unit_type_code = row.unit_type_code;
  if (row.unit_type_name != null) metadata.unit_type_name = row.unit_type_name;
  if (row.unit_type != null) metadata.unit_type = row.unit_type;
  if (row.unit_type_id != null) metadata.legacy_unit_type_id = row.unit_type_id;
  if (row.building_legacy_id != null) metadata.building_legacy_id = row.building_legacy_id;

  return metadata;
}

export function normalizeUnitImportRow(
  row: LegacyUnitImportRow,
  displayOrder: number,
  participationScale: ParticipationScaleDetection["scale"],
): NormalizedUnitImportRow | { error: string } {
  const unitNumber = asText(row.unit_number);
  if (!unitNumber) return { error: "Missing unit number." };

  const legacyId = asText(row.legacy_id);
  if (!legacyId) return { error: `Missing legacy id for unit ${unitNumber}.` };

  const unitTypeCode = resolveUnitTypeCode(row);
  if (!unitTypeCode) return { error: `Unknown unit type for unit ${unitNumber}.` };

  const participationPercentage = normalizeParticipationPercentage(row.unit_percentage, participationScale);
  if (participationPercentage == null) {
    return { error: `Invalid participation percentage for unit ${unitNumber}.` };
  }

  return {
    sourceRow: row,
    legacyId,
    unitNumber,
    canonicalUnitNumber: buildCanonicalUnitNumber(row, unitTypeCode),
    unitTypeCode,
    floor: asText(row.floor) || null,
    participationPercentage,
    displayName: buildDisplayName(row),
    registeredAreaM2: normalizeRegisteredArea(row.registered_area_m2),
    hasMeter: normalizeHasMeter(row.has_meter),
    displayOrder,
    legacyMetadata: buildLegacyMetadata(row, {
      source_legacy_id: row.legacy_id,
    }),
  };
}

export function buildUnitImportReport(
  input: {
    sourceFile: string;
    detectedParticipationScale: ParticipationScaleDetection;
    totalSourceRows: number;
    totalImportedRows: number;
    totalSkippedRows: number;
    warnings: string[];
    missingLegacyIds: string[];
    invalidParticipationPercentages: string[];
    unknownUnitTypes: string[];
    duplicateUnitNumbers: string[];
    missingBuildingReferences: string[];
    prototypeCleanupCandidates: PrototypeCleanupCandidate[];
  },
): UnitImportReport {
  return {
    ...input,
    totalWarnings: input.warnings.length,
  };
}
