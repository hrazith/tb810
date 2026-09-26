import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { isPerfLoggingEnabled } from "@/server/perf";
import {
  getActiveReadingMonth,
  getPreviousMeterReadingsForMonth,
  getWaterReadingUnits,
  listUnitMeterReadingMonths,
  listUnitMeterReadings,
} from "@/server/water/unit-meter-readings";

import {
  createInlineUnitMeterReadingAction,
  deleteUnitMeterReadingAction,
  updateInlineUnitMeterReadingAction,
} from "../actions";
import { CurrentMeterReadingRow } from "./current-meter-reading-row";
import { CurrentUnitMeterReadingsWorkspace } from "./current-unit-meter-readings-workspace";
import { ExpectedMeterReadingRow } from "./expected-meter-reading-row";
import { DownloadTemplateLink, UploadCompletedTemplateButton } from "./upload-completed-template-button";
import { HistoricalEditingBanner } from "./historical-editing-banner";
import { LEDGER_GRID_CLASS } from "./ledger-layout";
import { MonthLedgerSelector } from "./month-ledger-selector";

type Props = {
  month: string;
  query?: string;
  deleted?: string;
  historicalEditingAvailable: boolean;
  packageCorrectionAvailable: boolean;
};

export async function UnitMeterReadingsMonthPage({ month, query, deleted, historicalEditingAvailable, packageCorrectionAvailable }: Props) {
  const activeMonth = getActiveReadingMonth();
  const isActiveMonth = month === activeMonth.key;
  const pageStartedAt = process.hrtime.bigint();
  const populationPromise = (async () => {
    const startedAt = process.hrtime.bigint();
    const result = await getWaterReadingUnits();
    return { result, elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000 };
  })();

  const monthsPromise = (async () => {
    const startedAt = process.hrtime.bigint();
    const result = await listUnitMeterReadingMonths();
    return { result, elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000 };
  })();

  const resultPromise = populationPromise.then(async ({ result: populationResult }) => {
    if (populationResult.error) return { result: { data: [], error: populationResult.error }, elapsedMs: 0 };
    const startedAt = process.hrtime.bigint();
    const result = await listUnitMeterReadings({ query: isActiveMonth ? undefined : query, month }, populationResult.data ?? []);
    return { result, elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000 };
  });
  const previousPromise = isActiveMonth
    ? populationPromise.then(() => getPreviousMeterReadingsForMonth(month))
    : Promise.resolve({ data: {}, error: null });

  const [{ result: units, elapsedMs: populationElapsedMs }, { result, elapsedMs: readingsElapsedMs }, { result: monthsResult, elapsedMs: monthsElapsedMs }, previousResult] =
    await Promise.all([populationPromise, resultPromise, monthsPromise, previousPromise]);
  const pageElapsedMs = Number(process.hrtime.bigint() - pageStartedAt) / 1_000_000;
  const monthOptions = monthsResult.error
    ? [{ key: activeMonth.key, label: activeMonth.label }]
    : monthsResult.data;

  const previousByUnitId = isActiveMonth ? previousResult.data as Record<string, { previous_reading: number | null; previous_reading_date: string | null }> : Object.fromEntries(
    result.data.map((row) => [row.unit_id, { previous_reading: row.previous_reading, previous_reading_date: row.previous_reading_date }]),
  );
  const currentRowsByUnitId = new Map(result.data.map((row) => [row.unit_id, row]));
  const visibleUnits = query
    ? units.data.filter((unit) => `${unit.unit_number} ${unit.floor ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : units.data;
  const completedCount = isActiveMonth ? result.data.filter((row) => row.reading_end != null).length : null;

  if (isPerfLoggingEnabled()) {
    console.info(
      [
        "[UNIT_METER_READINGS_PERF]",
        `month=${month}`,
        `data_remote_requests=5`,
        `elapsed_ms=${pageElapsedMs.toFixed(1)}`,
        `population_ms=${populationElapsedMs.toFixed(1)}`,
        `readings_ms=${readingsElapsedMs.toFixed(1)}`,
        `months_ms=${monthsElapsedMs.toFixed(1)}`,
      ].join(" "),
    );
  }

  if (isActiveMonth) {
    return (
      <CurrentUnitMeterReadingsWorkspace
        month={month}
        monthOptions={monthOptions}
        units={units.data}
        rows={result.data}
        previousByUnitId={previousByUnitId}
        deleted={deleted}
        historicalEditingAvailable={historicalEditingAvailable}
        packageCorrectionAvailable={packageCorrectionAvailable}
      />
    );
  }

  return (
    <section className="space-y-6 ">
      <div className="flex flex-wrap items-start justify-between gap-4 my-12 px-6">
        <div className="space-y-1">
          <MonthLedgerSelector activeMonthKey={month} searchQuery={query ?? ""} monthOptions={monthOptions} />
        </div>
        <div className="flex items-center gap-3">
          <form action={`/water/unit-meter-readings/${month}`} method="get" className="flex items-center gap-3">
            <Input
              name="q"
              defaultValue={query ?? ""}
              placeholder="Search"
              className="h-11 w-full min-w-0 max-w-xs rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-[22rem]"
            />
          </form>
          {isActiveMonth ? <DownloadTemplateLink /> : null}
        </div>
      </div>

      

      {result.error ? <Panel className="border-red-200 bg-red-50 text-sm text-red-700">{result.error}</Panel> : null}
      {deleted ? <Panel className="border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{deleted}</Panel> : null}
      <HistoricalEditingBanner historicalEditingAvailable={historicalEditingAvailable} isHistoricalMonth={!isActiveMonth} />

      <Panel className="space-y-4 ">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950">Operational Ledger</h2>
          {completedCount != null ? <p className="text-sm text-zinc-600">{completedCount} of {units.data.length} complete</p> : null}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${LEDGER_GRID_CLASS} border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-950`}>
              <div>Unit</div>
              <div>Previous</div>
              <div>Current</div>
              <div>Consumption</div>
              <div>Reading Date</div>
              <div />
            </div>
            {isActiveMonth ? visibleUnits.map((unit) => {
              const row = currentRowsByUnitId.get(unit.id);
              return row ? (
                <CurrentMeterReadingRow
                  key={row.id}
                  row={row}
                  action={updateInlineUnitMeterReadingAction}
                  deleteAction={deleteUnitMeterReadingAction}
                  readOnly={false}
                  historicalEditingAvailable={historicalEditingAvailable}
                  packageCorrectionAvailable={packageCorrectionAvailable}
                  isHistoricalMonth={false}
                />
              ) : (
                <ExpectedMeterReadingRow
                  key={unit.id}
                  unitId={unit.id}
                  unitNumber={unit.unit_number}
                  floor={unit.floor}
                  previousReading={previousByUnitId[unit.id]?.previous_reading ?? null}
                  action={createInlineUnitMeterReadingAction}
                />
              );
            }) : result.data.map((row) => (
              <CurrentMeterReadingRow key={row.id} row={row} action={updateInlineUnitMeterReadingAction} deleteAction={deleteUnitMeterReadingAction} readOnly historicalEditingAvailable={historicalEditingAvailable} packageCorrectionAvailable={packageCorrectionAvailable} isHistoricalMonth />
            ))}
            {!result.data.length && !isActiveMonth ? (
              <div className="px-4 py-6 text-sm text-zinc-600">No meter readings found for {month}.</div>
            ) : null}
          </div>
        </div>
      </Panel>
      {isActiveMonth ? (
        <UploadCompletedTemplateButton
          month={month}
          currentReadingCount={result.data.length}
          expectedReadingCount={units.data.length}
        />
      ) : null}
    </section>
  );
}
