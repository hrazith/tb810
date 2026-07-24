import { createClient } from "@/lib/supabase/server";
import { getCurrentBuilding } from "@/server/units";

import type {
  CommonWaterBillInput,
  CommonWaterBillUpdateInput,
} from "./validation";
import { commonWaterBillInputSchema, commonWaterBillUpdateInputSchema } from "./validation";
import type {
  WaterBillFormState,
  WaterBillRecord,
  WaterBillSummary,
} from "./types";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

const WATER_BILL_SELECT =
  "id, building_id, utility_type_id, billing_period_id, supplier_id, bill_date, amount, description, attachment_document_id, status, notes, previous_reading, current_reading, total_consumption, unit_cost, legacy_table, legacy_id, legacy_metadata, created_by, updated_by, created_at, updated_at" as const;

const BILLING_PERIOD_SELECT = "id, status, period_year, period_month" as const;

function toBillRecord(row: WaterBillRecord): WaterBillRecord {
  return row;
}

async function getCommonWaterUtilityTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase
    .from("tb810_utility_types")
    .select("id, code, name")
    .eq("code", "common_water")
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  return { data, error: null };
}

async function getBillingPeriodForBillDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  billDate: string,
) {
  const parsed = new Date(`${billDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { data: null, error: "Bill date is invalid." };
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;

  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("building_id", buildingId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getBillingPeriodStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billingPeriodId: string | null,
) {
  if (!billingPeriodId) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("tb810_billing_periods")
    .select(BILLING_PERIOD_SELECT)
    .eq("id", billingPeriodId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

async function getLatestCommonWaterBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  beforeBillDate?: string,
) {
  let request = supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingId)
    .eq("utility_type_id", utilityTypeId);

  if (beforeBillDate) {
    request = request.lt("bill_date", beforeBillDate);
  }

  const { data, error } = await request
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

function isBillEditable(billingPeriodStatus: string | null | undefined) {
  return billingPeriodStatus !== "closed";
}

async function getCommonWaterReadingContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buildingId: string,
  utilityTypeId: string,
  billDate: string,
) {
  const latestPrior = await getLatestCommonWaterBill(
    supabase,
    buildingId,
    utilityTypeId,
    billDate,
  );

  if (latestPrior.error) {
    return { data: null, error: latestPrior.error };
  }

  if (latestPrior.data) {
    return {
      data: {
        hasPriorBill: true,
        previousReading: latestPrior.data.current_reading,
      },
      error: null,
    };
  }

  const firstBill = await getLatestCommonWaterBill(supabase, buildingId, utilityTypeId);
  if (firstBill.error) {
    return { data: null, error: firstBill.error };
  }

  return {
    data: {
      hasPriorBill: false,
      previousReading: firstBill.data?.previous_reading ?? null,
    },
    error: null,
  };
}

export async function listCommonWaterBills(): Promise<
  QueryResult<WaterBillSummary[]>
> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: [], error: buildingResult.error };
  if (!buildingResult.data) return { data: [], error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: [], error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: [], error: "Common Water utility type is missing." };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows = data ?? [];
  const billingPeriodIds = [
    ...new Set(rows.map((row) => row.billing_period_id).filter(Boolean)),
  ] as string[];
  const billingPeriodById = new Map<string, { status: string }>();

  for (const billingPeriodId of billingPeriodIds) {
    const billingPeriod = await getBillingPeriodStatus(supabase, billingPeriodId);
    if (billingPeriod.error) {
      return { data: [], error: billingPeriod.error };
    }

    if (billingPeriod.data) {
      billingPeriodById.set(billingPeriodId, {
        status: billingPeriod.data.status,
      });
    }
  }

  return {
    data: rows.map((row) => {
      const billingPeriod = billingPeriodById.get(row.billing_period_id ?? "");
      const firstRecord = rows[rows.length - 1];
      const isFirstEverRecord = firstRecord?.id === row.id && rows.length === 1;
      return {
        ...toBillRecord(row),
        utility_type_name: utilityType.name,
        billing_period_status: billingPeriod?.status ?? null,
        is_editable: isBillEditable(billingPeriod?.status),
      };
    }),
    error: null,
  };
}

export async function getWaterBillById(
  billId: string,
): Promise<QueryResult<WaterBillSummary | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: null, error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .select(WATER_BILL_SELECT)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .eq("id", billId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  const billingPeriod = await getBillingPeriodStatus(supabase, data.billing_period_id);
  if (billingPeriod.error) {
    return { data: null, error: billingPeriod.error };
  }

  return {
    data: {
      ...toBillRecord(data),
      utility_type_name: utilityType.name,
      billing_period_status: billingPeriod.data?.status ?? null,
      is_editable: isBillEditable(billingPeriod.data?.status),
    },
    error: null,
  };
}

function parseReading(value: string) {
  return Number(value);
}

function parseMoney(value: string) {
  return Number(value);
}

export async function createCommonWaterBill(
  input: CommonWaterBillInput,
): Promise<QueryResult<WaterBillRecord>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) {
    return { data: null as never, error: buildingResult.error };
  }

  if (!buildingResult.data) {
    return { data: null as never, error: "Current building not found." };
  }

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);

  if (utilityTypeError) {
    return { data: null as never, error: utilityTypeError };
  }

  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const parsed = commonWaterBillInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.",
    };
  }

  const payload = parsed.data;
  const currentReading = parseReading(payload.current_reading);
  const amount = parseMoney(payload.amount);
  const readingContext = await getCommonWaterReadingContext(
    supabase,
    buildingResult.data.id,
    utilityType.id,
    payload.bill_date,
  );

  if (readingContext.error) {
    return { data: null as never, error: readingContext.error };
  }

  const previousReading = readingContext.data?.hasPriorBill
    ? readingContext.data.previousReading ?? 0
    : parseReading(payload.previous_reading);
  const totalConsumption = currentReading - previousReading;
  const unitCost = totalConsumption === 0 ? 0 : Number((amount / totalConsumption).toFixed(4));
  const billingPeriod = await getBillingPeriodForBillDate(
    supabase,
    buildingResult.data.id,
    payload.bill_date,
  );

  if (billingPeriod.error) {
    return { data: null as never, error: billingPeriod.error };
  }

  if (!readingContext.data?.hasPriorBill && previousReading < 0) {
    return { data: null as never, error: "Opening reading must be zero or greater." };
  }

  if (currentReading < previousReading) {
    return {
      data: null as never,
      error: "Current reading must be greater than or equal to previous reading.",
    };
  }

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .insert({
      building_id: buildingResult.data.id,
      utility_type_id: utilityType.id,
      billing_period_id: billingPeriod.data?.id ?? null,
      bill_date: payload.bill_date,
      amount,
      description: payload.description || "Sedapal common water invoice",
      notes: payload.notes || null,
      previous_reading: previousReading,
      current_reading: currentReading,
      total_consumption: totalConsumption,
      unit_cost: unitCost,
      status: "received",
      legacy_table: "tb810_common_water_ledger",
      legacy_id: `${buildingResult.data.id}:${payload.bill_date}`,
      legacy_metadata: {
        slice: "common_water_ledger",
        utility_type_code: "common_water",
        source: "giuiana_monthly_workflow",
      },
    })
    .select(WATER_BILL_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function getLatestPreviousCommonWaterReading() {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null, error: utilityTypeError };
  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const latest = await getLatestCommonWaterBill(
    supabase,
    buildingResult.data.id,
    utilityType.id,
  );
  if (latest.error) return { data: null, error: latest.error };

  return {
    data: latest.data
      ? {
          hasPriorBill: true,
          previousReading: latest.data.current_reading,
        }
      : {
          hasPriorBill: false,
          previousReading: null,
        },
    error: null,
  };
}

export async function getCommonWaterReadingDefaults(billDate?: string) {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: null };

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null, error: utilityTypeError };
  if (!utilityType) {
    return { data: null, error: "Common Water utility type is missing." };
  }

  const latest = billDate
    ? await getLatestCommonWaterBill(
        supabase,
        buildingResult.data.id,
        utilityType.id,
        billDate,
      )
    : await getLatestCommonWaterBill(
        supabase,
        buildingResult.data.id,
        utilityType.id,
      );

  if (latest.error) return { data: null, error: latest.error };

  return {
    data: {
      hasPriorBill: Boolean(latest.data),
      previousReading: latest.data?.current_reading ?? null,
    },
    error: null,
  };
}

export async function updateCommonWaterBill(
  billId: string,
  input: CommonWaterBillUpdateInput,
): Promise<QueryResult<WaterBillRecord>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null as never, error: buildingResult.error };
  if (!buildingResult.data) {
    return { data: null as never, error: "Current building not found." };
  }

  const supabase = await createClient();
  const { data: utilityType, error: utilityTypeError } =
    await getCommonWaterUtilityTypeId(supabase);
  if (utilityTypeError) return { data: null as never, error: utilityTypeError };
  if (!utilityType) {
    return { data: null as never, error: "Common Water utility type is missing." };
  }

  const parsed = commonWaterBillUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.",
    };
  }

  const existing = await getWaterBillById(billId);
  if (existing.error) return { data: null as never, error: existing.error };
  if (!existing.data) return { data: null as never, error: "Common water bill not found." };
  if (!existing.data.is_editable) {
    return { data: null as never, error: "This common water bill is locked." };
  }

  const payload = parsed.data;
  const currentReading = parseReading(payload.current_reading);
  const amount = parseMoney(payload.amount);

  const billingPeriod = await getBillingPeriodForBillDate(
    supabase,
    buildingResult.data.id,
    payload.bill_date,
  );
  if (billingPeriod.error) return { data: null as never, error: billingPeriod.error };

  const readingContext = await getCommonWaterReadingContext(
    supabase,
    buildingResult.data.id,
    utilityType.id,
    payload.bill_date,
  );
  if (readingContext.error) {
    return { data: null as never, error: readingContext.error };
  }

  const allowPreviousReadingEdit = !readingContext.data?.hasPriorBill;
  const previousReading = allowPreviousReadingEdit
    ? parseReading(payload.previous_reading ?? "")
    : existing.data.previous_reading;

  if (allowPreviousReadingEdit && payload.previous_reading === undefined) {
    return { data: null as never, error: "Opening reading is required." };
  }

  if (!allowPreviousReadingEdit && payload.previous_reading !== undefined) {
    return { data: null as never, error: "Previous reading is read-only." };
  }

  if (currentReading < previousReading) {
    return {
      data: null as never,
      error: "Current reading must be greater than or equal to previous reading.",
    };
  }

  const totalConsumption = currentReading - previousReading;
  const unitCost = totalConsumption === 0 ? 0 : Number((amount / totalConsumption).toFixed(4));

  const { data, error } = await supabase
    .from("tb810_utility_bills")
    .update({
      bill_date: payload.bill_date,
      billing_period_id: billingPeriod.data?.id ?? null,
      amount,
      description: payload.description || null,
      notes: payload.notes || null,
      current_reading: currentReading,
      total_consumption: totalConsumption,
      unit_cost: unitCost,
    })
    .eq("id", billId)
    .eq("building_id", buildingResult.data.id)
    .eq("utility_type_id", utilityType.id)
    .select(WATER_BILL_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export type {
  WaterBillFormState,
  WaterBillRecord,
  WaterBillSummary,
} from "./types";

export { commonWaterBillInputSchema } from "./validation";
