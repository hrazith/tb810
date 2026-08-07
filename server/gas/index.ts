import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding, listUnits } from "@/server/units";
import { parseGasWorkbookWorkbook } from "./import";

import type {
  GasBillInput,
  GasBillRecord,
  GasBillSummary,
  GasReadingInput,
  GasReadingRecord,
  GasReadingSummary,
} from "./types";

type QueryResult<T> = { data: T; error: string | null };

type GasWorkbookImportResult = {
  importedBillCount: number;
  importedReadingCount: number;
};

const GAS_BILL_SELECT =
  "id, building_id, supplier_name, invoice_number, invoice_date, amount, notes, processed_at, legacy_table, legacy_id, legacy_metadata, created_at, updated_at" as const;
const GAS_READING_SELECT =
  "id, building_id, unit_id, reading_month, reading_date, previous_reading, current_reading, consumption, notes, legacy_table, legacy_id, legacy_metadata, created_at, updated_at" as const;

function statusFromBill(row: GasBillRecord) {
  return row.processed_at ? "processed" : "draft";
}

function normalizeUnitType(unitTypeCode: string) {
  return unitTypeCode === "condo";
}

export async function getGasCurrentBuilding() {
  return getCurrentBuilding();
}

export async function listGasBills(): Promise<QueryResult<GasBillSummary[]>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: [], error: building.error };
  if (!building.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .select(GAS_BILL_SELECT)
    .eq("building_id", building.data.id)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => ({ ...row, status: statusFromBill(row) })), error: null };
}

export async function getGasBillById(id: string): Promise<QueryResult<GasBillSummary | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tb810_gas_bills").select(GAS_BILL_SELECT).eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: { ...data, status: statusFromBill(data) }, error: null };
}

export async function createGasBill(input: GasBillInput): Promise<QueryResult<GasBillRecord>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .insert({ ...input, processed_at: null })
    .select(GAS_BILL_SELECT)
    .single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function updateGasBill(id: string, input: GasBillInput): Promise<QueryResult<GasBillRecord>> {
  const supabase = await createClient();
  const bill = await getGasBillById(id);
  if (bill.error) return { data: null as never, error: bill.error };
  if (!bill.data) return { data: null as never, error: "Bill not found." };
  if (bill.data.processed_at) return { data: null as never, error: "Processed bills are read-only." };
  const { data, error } = await supabase.from("tb810_gas_bills").update(input).eq("id", id).select(GAS_BILL_SELECT).single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function deleteGasBill(id: string): Promise<QueryResult<{ id: string }>> {
  const supabase = await createClient();
  const bill = await getGasBillById(id);
  if (bill.error) return { data: null as never, error: bill.error };
  if (!bill.data) return { data: null as never, error: "Bill not found." };
  if (bill.data.processed_at) return { data: null as never, error: "Processed bills cannot be deleted." };
  const { error } = await supabase.from("tb810_gas_bills").delete().eq("id", id);
  if (error) return { data: null as never, error: error.message };
  return { data: { id }, error: null };
}

export async function listGasReadings(): Promise<QueryResult<GasReadingSummary[]>> {
  const building = await getCurrentBuilding();
  if (building.error) return { data: [], error: building.error };
  if (!building.data) return { data: [], error: null };
  const supabase = await createClient();
  const [{ data: readings, error }, unitsResult] = await Promise.all([
    supabase.from("tb810_gas_readings").select(GAS_READING_SELECT).eq("building_id", building.data.id).order("reading_month", { ascending: false }),
    listUnits(),
  ]);
  if (error) return { data: [], error: error.message };
  if (unitsResult.error) return { data: [], error: unitsResult.error };
  const unitById = new Map(unitsResult.data.filter((unit) => normalizeUnitType(unit.unit_type_code) && unit.has_gas_service).map((unit) => [unit.id, unit]));
  return {
    data: (readings ?? [])
      .map((row) => {
        const unit = unitById.get(row.unit_id);
        if (!unit) return null;
        return { ...row, unit_number: unit.unit_number, floor: unit.floor, unit_type_code: unit.unit_type_code };
      })
      .filter(Boolean) as GasReadingSummary[],
    error: null,
  };
}

export async function getGasReadingById(id: string): Promise<QueryResult<GasReadingSummary | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tb810_gas_readings").select(GAS_READING_SELECT).eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const units = await listUnits();
  if (units.error) return { data: null, error: units.error };
  const unit = units.data.find((item) => item.id === data.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) return { data: null, error: null };
  return { data: { ...data, unit_number: unit.unit_number, floor: unit.floor, unit_type_code: unit.unit_type_code }, error: null };
}

export async function createGasReading(input: GasReadingInput): Promise<QueryResult<GasReadingRecord>> {
  const supabase = await createClient();
  const unitResult = await listUnits();
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  const unit = unitResult.data.find((item) => item.id === input.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) {
    return { data: null as never, error: "Only gas-enabled condo Units may receive Gas readings." };
  }
  if (input.current_reading < (input.previous_reading ?? 0)) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }
  const payload = { ...input, consumption: input.current_reading - (input.previous_reading ?? 0) };
  const { data, error } = await supabase.from("tb810_gas_readings").insert(payload).select(GAS_READING_SELECT).single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function updateGasReading(id: string, input: GasReadingInput): Promise<QueryResult<GasReadingRecord>> {
  const supabase = await createClient();
  const existing = await getGasReadingById(id);
  if (existing.error) return { data: null as never, error: existing.error };
  if (!existing.data) return { data: null as never, error: "Reading not found." };
  const unitResult = await listUnits();
  if (unitResult.error) return { data: null as never, error: unitResult.error };
  const unit = unitResult.data.find((item) => item.id === input.unit_id);
  if (!unit || unit.unit_type_code !== "condo" || !unit.has_gas_service) {
    return { data: null as never, error: "Only gas-enabled condo Units may receive Gas readings." };
  }
  if (input.current_reading < (input.previous_reading ?? 0)) {
    return { data: null as never, error: "Current reading must be greater than or equal to previous reading." };
  }
  const payload = { ...input, consumption: input.current_reading - (input.previous_reading ?? 0) };
  const { data, error } = await supabase.from("tb810_gas_readings").update(payload).eq("id", id).select(GAS_READING_SELECT).single();
  if (error) return { data: null as never, error: error.message };
  return { data, error: null };
}

export async function deleteGasReading(id: string): Promise<QueryResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("tb810_gas_readings").delete().eq("id", id);
  if (error) return { data: null as never, error: error.message };
  return { data: { id }, error: null };
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function readingMonthFromDate(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export async function importGasWorkbook(file: File): Promise<QueryResult<GasWorkbookImportResult>> {
  const rows = await parseGasWorkbookWorkbook(file);
  if (!rows.length) {
    return { data: { importedBillCount: 0, importedReadingCount: 0 }, error: null };
  }

  const supabase = await createClient();
  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Building not found." };

  const unitsResult = await listUnits();
  if (unitsResult.error) return { data: null as never, error: unitsResult.error };
  const condoByNumber = new Map(
    unitsResult.data
      .filter((unit) => unit.unit_type_code === "condo" && unit.has_gas_service)
      .map((unit) => [unit.unit_number, unit]),
  );

  let importedBillCount = 0;
  let importedReadingCount = 0;

  for (const row of rows) {
    if (row.kind === "bill") {
      const supplier_name = normalizeText(row.data["Supplier"] ?? row.data["Supplier Name"] ?? row.data["Proveedor"]);
      const invoice_number = normalizeText(row.data["Invoice Number"] ?? row.data["Invoice"] ?? row.data["Nro Factura"]);
      const invoice_date = normalizeText(row.data["Invoice Date"] ?? row.data["Date"] ?? row.data["Fecha"]);
      const amount = Number(normalizeText(row.data["Amount"] ?? row.data["Importe"] ?? row.data["Monto"]));
      if (!supplier_name || !invoice_number || !invoice_date || !Number.isFinite(amount)) continue;
      const { error } = await supabase.from("tb810_gas_bills").upsert(
        {
          building_id: building.data.id,
          supplier_name,
          invoice_number,
          invoice_date,
          amount,
          notes: normalizeText(row.data["Notes"] ?? row.data["Comentarios"]) || null,
          legacy_table: "gas_spreadsheet",
          legacy_id: `${row.sourceRowNumber}`,
          legacy_metadata: { source_row_number: row.sourceRowNumber, worksheet_row: row.data },
        },
        { onConflict: "building_id,invoice_number" },
      );
      if (error) return { data: null as never, error: error.message };
      importedBillCount += 1;
      continue;
    }

    const unitNumber = normalizeText(row.data["Unit"] ?? row.data["Unidad"] ?? row.data["Unit Number"]);
    const readingDate = normalizeText(row.data["Reading Date"] ?? row.data["Fecha"] ?? row.data["Date"]);
    const currentReading = Number(normalizeText(row.data["Current Reading"] ?? row.data["Lectura"] ?? row.data["Reading"]));
    const previousReadingRaw = normalizeText(row.data["Previous Reading"] ?? row.data["Lectura anterior"] ?? row.data["Previous"]);
    const previousReading = previousReadingRaw ? Number(previousReadingRaw) : null;
    if (!unitNumber || !readingDate || !Number.isFinite(currentReading)) continue;
    const unit = condoByNumber.get(unitNumber);
    if (!unit) continue;
    const { error } = await supabase.from("tb810_gas_readings").upsert(
      {
        building_id: building.data.id,
        unit_id: unit.id,
        reading_month: readingMonthFromDate(readingDate),
        reading_date: readingDate,
        previous_reading: previousReading,
        current_reading: currentReading,
        consumption: previousReading == null ? null : currentReading - previousReading,
        notes: normalizeText(row.data["Notes"] ?? row.data["Comentarios"]) || null,
        legacy_table: "gas_spreadsheet",
        legacy_id: `${row.sourceRowNumber}`,
        legacy_metadata: { source_row_number: row.sourceRowNumber, worksheet_row: row.data },
      },
      { onConflict: "building_id,unit_id,reading_month" },
    );
    if (error) return { data: null as never, error: error.message };
    importedReadingCount += 1;
  }

  return { data: { importedBillCount, importedReadingCount }, error: null };
}
