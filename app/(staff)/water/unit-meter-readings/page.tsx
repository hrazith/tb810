import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  getActiveReadingMonth,
  getUnitOptions,
  listUnitMeterReadings,
} from "@/server/water/unit-meter-readings";

import {
  createInlineUnitMeterReadingAction,
  updateInlineUnitMeterReadingAction,
} from "./actions";
import { AddMeterReadingRow } from "./_components/add-meter-reading-row";
import { CurrentMeterReadingRow } from "./_components/current-meter-reading-row";
import { LEDGER_GRID_CLASS } from "./_components/ledger-layout";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    unitId?: string;
    status?: "all" | "recorded" | "reviewed" | "approved" | "void";
    month?: string;
  }>;
};

export default async function UnitMeterReadingsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const activeMonth = getActiveReadingMonth();
  const month = params.month ?? activeMonth.key;
  const [result, units] = await Promise.all([
    listUnitMeterReadings({
      query: params.q,
      unitId: params.unitId,
      status: params.status ?? "all",
      month,
    }),
    getUnitOptions(),
  ]);

  const currentRows = result.data.filter((row) => row.current_month_editable);
  const historicalRows = result.data.filter((row) => !row.current_month_editable);
  const previousByUnitId = Object.fromEntries(
    result.data.map((row) => [
      row.unit_id,
      {
        previous_reading: row.previous_reading,
        previous_reading_date: row.previous_reading_date,
      },
    ]),
  );

  return (
    <section className="space-y-6 ">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Unit Water Meter Readings</h1>
          <p className="text-sm text-zinc-600">Primary operational ledger for {activeMonth.label}</p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="secondary" shape="pill">
            <a href="/water/unit-meter-readings/import">Import</a>
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap gap-3  rounded-2xl border border-zinc-200 bg-white p-4" method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search units"
          className="h-11 min-w-56 rounded-xl border border-zinc-300 px-3 text-sm"
        />
        <input
          name="month"
          defaultValue={params.month ?? activeMonth.key}
          type="month"
          className="h-11 rounded-xl border border-zinc-300 px-3 text-sm"
        />
        <select
          name="unitId"
          defaultValue={params.unitId ?? ""}
          className="h-11 min-w-56 rounded-xl border border-zinc-300 px-3 text-sm"
        >
          <option value="">All units</option>
          {units.data.map((unit) => {
            const label = `${unit.unit_number}${unit.floor ? ` - Floor ${unit.floor}` : ""}`;
            return (
              <option key={unit.id} value={unit.id}>
                {label}
              </option>
            );
          })}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? "all"}
          className="h-11 rounded-xl border border-zinc-300 px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="recorded">Recorded</option>
          <option value="reviewed">Reviewed</option>
          <option value="approved">Approved</option>
          <option value="void">Void</option>
        </select>
        <Button variant="secondary" shape="pill" type="submit">
          Apply
        </Button>
      </form>

      {result.error ? <Panel className="border-red-200 bg-red-50 text-sm text-red-700">{result.error}</Panel> : null}

      <Panel className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Operational Ledger</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-950`}>
              <div>Unit</div>
              <div>Current</div>
              <div>Previous</div>
              <div>Consumption</div>
              <div>Reading Date</div>
              <div />
            </div>
            <AddMeterReadingRow
              action={createInlineUnitMeterReadingAction}
              units={units.data}
              readingDate={activeMonth.start}
              previousByUnitId={previousByUnitId}
            />
            {currentRows.map((row) => (
              <CurrentMeterReadingRow key={row.id} row={row} action={updateInlineUnitMeterReadingAction} />
            ))}
          </div>
        </div>
      </Panel>

      
    </section>
  );
}
