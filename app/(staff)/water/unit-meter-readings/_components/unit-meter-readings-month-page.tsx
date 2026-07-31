import { Panel } from "@/components/ui/panel";
import {
  getActiveReadingMonth,
  getUnitOptions,
  listUnitMeterReadingMonths,
  listUnitMeterReadings,
} from "@/server/water/unit-meter-readings";

import {
  createInlineUnitMeterReadingAction,
  deleteUnitMeterReadingAction,
  updateInlineUnitMeterReadingAction,
} from "../actions";
import { AddMeterReadingRow } from "./add-meter-reading-row";
import { CurrentMeterReadingRow } from "./current-meter-reading-row";
import { UploadCompletedTemplateButton } from "./upload-completed-template-button";
import { LEDGER_GRID_CLASS } from "./ledger-layout";
import { MonthLedgerSelector } from "./month-ledger-selector";

type Props = {
  month: string;
  query?: string;
  deleted?: string;
};

export async function UnitMeterReadingsMonthPage({ month, query, deleted }: Props) {
  const activeMonth = getActiveReadingMonth();
  const [result, units] = await Promise.all([
    listUnitMeterReadings({ query, month }),
    getUnitOptions(),
  ]);
  const monthsResult = await listUnitMeterReadingMonths();
  const monthOptions = monthsResult.error
    ? [{ key: activeMonth.key, label: activeMonth.label }]
    : monthsResult.data;

  const isActiveMonth = month === activeMonth.key;
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
        </div>
        <div className="flex items-center gap-3">
          <form action={`/water/unit-meter-readings/${month}`} method="get" className="flex items-center gap-3">
            <input
              name="q"
              defaultValue={query ?? ""}
              placeholder="Search readings"
              className="h-11 min-w-56 rounded-xl border border-zinc-300 px-3 text-sm"
            />
          </form>
          {isActiveMonth ? <UploadCompletedTemplateButton /> : null}
        </div>
      </div>

      <MonthLedgerSelector activeMonthKey={month} searchQuery={query ?? ""} monthOptions={monthOptions} />

      {result.error ? <Panel className="border-red-200 bg-red-50 text-sm text-red-700">{result.error}</Panel> : null}
      {deleted ? <Panel className="border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{deleted}</Panel> : null}

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
            {isActiveMonth ? (
              <AddMeterReadingRow
                action={createInlineUnitMeterReadingAction}
                units={units.data}
                readingDate={activeMonth.start}
                previousByUnitId={previousByUnitId}
              />
            ) : null}
            {result.data.map((row) => (
              <CurrentMeterReadingRow
                key={row.id}
                row={row}
                action={updateInlineUnitMeterReadingAction}
                deleteAction={deleteUnitMeterReadingAction}
                readOnly={!isActiveMonth}
              />
            ))}
            {!result.data.length ? (
              <div className="px-4 py-6 text-sm text-zinc-600">No meter readings found for {month}.</div>
            ) : null}
          </div>
        </div>
      </Panel>
    </section>
  );
}
