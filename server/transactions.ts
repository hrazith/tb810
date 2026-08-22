import { createClient } from "@/lib/supabase/server";
import { isPerfLoggingEnabled } from "@/server/perf";

type FinancialActivity = {
  id: string;
  created_at: string;
  transaction_type: string;
  amount: number;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
};

export async function getSelectedUnitTransactionsForUnit(
  unitId: string,
): Promise<FinancialActivity[]> {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data } = await supabase
    .from("tb810_account_transactions")
    .select(
      "id, created_at, transaction_type, amount, notes, reference_type, reference_id, tb810_unit_accounts!inner(unit_id)",
    )
    .eq("tb810_unit_accounts.unit_id", unitId)
    .order("created_at", { ascending: false })
    .limit(10);

  const elapsedMs = Date.now() - startedAt;
  if (isPerfLoggingEnabled()) {
    console.info(
      [
        "[SELECTED_UNIT_TRANSACTIONS_PERF]",
        `unit_id=${unitId}`,
        `data_remote_requests=1`,
        `elapsed_ms=${elapsedMs}`,
      ].join(" "),
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    transaction_type: row.transaction_type,
    amount: row.amount,
    notes: row.notes,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
  }));
}
