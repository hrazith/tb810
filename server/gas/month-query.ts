type GasReadingsQueryResult = {
  data: Array<{
    id: string;
    unit_id: string;
    reading_month: string;
    current_reading: number;
    previous_reading: number | null;
    consumption: number | null;
  }> | null;
  error: { message: string } | null;
};

type GasReadingsQueryChain = {
  eq(column: string, value: string): GasReadingsQueryChain & PromiseLike<GasReadingsQueryResult>;
  then<TResult1 = GasReadingsQueryResult, TResult2 = never>(
    onfulfilled?: ((value: GasReadingsQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type GasReadingsQueryBuilder = {
  select(columns: string): GasReadingsQueryChain;
};

export async function listGasReadingsForMonth(
  supabase: {
    from(table: string): GasReadingsQueryBuilder;
  },
  buildingId: string,
  sourceReadingMonth: string,
) {
  const { data, error } = await supabase
    .from("tb810_gas_readings")
    .select("id, unit_id, reading_month, current_reading, previous_reading, consumption")
    .eq("building_id", buildingId)
    .eq("reading_month", `${sourceReadingMonth}-01`);

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}
