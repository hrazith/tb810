import { createClient } from "@/lib/supabase/server";
import { getBusinessNow } from "@/server/business-date";
import { getActiveDevTestSessionId, getActiveDevTestSessionSummary, recordDevTestMutation } from "@/server/dev-test-session";
import { getCurrentBuilding } from "@/server/units";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";

type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

export type GasSupplierBillHistoryRow = {
  supplier_name: string;
  invoice_date: string;
  amount: number | string;
  created_at: string;
};

export type GasSupplierBillDraft = {
  supplierName: string;
  invoiceDate: string;
  amount: string;
  notes: string;
};

function parseNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildGasSupplierBillDraft(input: {
  billDate: string;
  history: GasSupplierBillHistoryRow[];
}): QueryResult<GasSupplierBillDraft> {
  const priorBills = [...input.history]
    .filter((bill) => bill.invoice_date < input.billDate)
    .sort((left, right) => right.invoice_date.localeCompare(left.invoice_date) || right.created_at.localeCompare(left.created_at));

  const latestPrior = priorBills[0] ?? null;
  const amount = latestPrior ? parseNumber(latestPrior.amount) : null;

  if (amount === null || amount <= 0) {
    return { data: null, error: "Unable to derive a realistic Gas bill amount." };
  }

  return {
    data: {
      supplierName: latestPrior?.supplier_name ?? "Gas supplier",
      invoiceDate: input.billDate,
      amount: amount.toFixed(2),
      notes: "Gas test bill",
    },
    error: null,
  };
}

export async function addGasSupplierBillForCurrentBusinessMonth(): Promise<QueryResult<{ insertedCount: number; billId: string }>> {
  if (process.env.NODE_ENV !== "development") {
    return { data: null as never, error: "DEV test actions are development-only." };
  }

  const session = await getActiveDevTestSessionSummary();
  if (!session) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) {
    return { data: null as never, error: "Start a DEV test session first." };
  }

  const building = await getCurrentBuilding();
  if (building.error) return { data: null as never, error: building.error };
  if (!building.data) return { data: null as never, error: "Current building not found." };

  const businessNow = await getBusinessNow();
  const billDate = businessNow.toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data: history, error: historyError } = await supabase
    .from("tb810_gas_bills")
    .select("supplier_name, invoice_date, amount, created_at")
    .eq("building_id", building.data.id)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (historyError) return { data: null as never, error: historyError.message };

  const draftResult = buildGasSupplierBillDraft({
    billDate,
    history: (history ?? []).map((row) => ({
      supplier_name: row.supplier_name,
      invoice_date: row.invoice_date,
      amount: row.amount,
      created_at: row.created_at,
    })),
  });

  if (draftResult.error) return { data: null as never, error: draftResult.error };
  if (!draftResult.data) return { data: null as never, error: "Unable to build Gas test bill." };

  const invoiceNumber = `DEV-GAS-${billDate.replaceAll("-", "")}-${sessionId.slice(0, 8)}`;
  const { data, error } = await supabase
    .from("tb810_gas_bills")
    .insert({
      building_id: building.data.id,
      supplier_name: draftResult.data.supplierName,
      invoice_number: invoiceNumber,
      invoice_date: draftResult.data.invoiceDate,
      amount: Number(draftResult.data.amount),
      notes: draftResult.data.notes,
      processed_at: null,
      legacy_table: null,
      legacy_id: null,
      legacy_metadata: {},
    })
    .select("id")
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  const journalResult = await recordDevTestMutation({
    domain: "gas",
    recordType: "utility_bill",
    operation: "create",
    recordIdentity: data.id,
  });
  if (journalResult.error) {
    await supabase.from("tb810_gas_bills").delete().eq("id", data.id);
    return { data: null as never, error: journalResult.error };
  }

  invalidateBuildingMonthFinancialFactsCache(building.data.id);
  return { data: { insertedCount: 1, billId: data.id }, error: null };
}
