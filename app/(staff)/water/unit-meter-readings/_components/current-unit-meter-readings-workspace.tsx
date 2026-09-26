"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { UnitMeterReadingRow, UnitOption } from "@/server/water/unit-meter-readings";

import {
  createInlineUnitMeterReadingAction,
  deleteUnitMeterReadingAction,
  updateInlineUnitMeterReadingAction,
} from "../actions";
import { CurrentMeterReadingRow } from "./current-meter-reading-row";
import { ExpectedMeterReadingRow } from "./expected-meter-reading-row";
import { DownloadTemplateLink, UploadCompletedTemplateButton } from "./upload-completed-template-button";
import { LEDGER_GRID_CLASS } from "./ledger-layout";
import { MonthLedgerSelector } from "./month-ledger-selector";

type Props = {
  month: string;
  monthOptions: Array<{ key: string; label: string }>;
  units: UnitOption[];
  rows: UnitMeterReadingRow[];
  previousByUnitId: Record<string, { previous_reading: number | null; previous_reading_date: string | null }>;
  deleted?: string;
  historicalEditingAvailable: boolean;
  packageCorrectionAvailable: boolean;
};

export function CurrentUnitMeterReadingsWorkspace({
  month,
  monthOptions,
  units,
  rows,
  previousByUnitId,
  deleted,
  historicalEditingAvailable,
  packageCorrectionAvailable,
}: Props) {
  const [query, setQuery] = useState("");
  const currentRowsByUnitId = new Map(rows.map((row) => [row.unit_id, row]));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUnits = normalizedQuery
    ? units.filter((unit) => `${unit.unit_number} ${unit.floor ?? ""}`.toLowerCase().includes(normalizedQuery))
    : units;
  const completedCount = rows.filter((row) => row.reading_end != null).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 my-12 px-6">
        <div className="space-y-1">
          <MonthLedgerSelector activeMonthKey={month} searchQuery="" monthOptions={monthOptions} />
        </div>
        <div className="flex items-center gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-11 w-full min-w-0 max-w-xs rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 xl:w-[22rem]"
            aria-label="Search Unit Water readings"
          />
          <DownloadTemplateLink />
        </div>
      </div>

      {deleted ? <Panel className="border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{deleted}</Panel> : null}

      <Panel className="space-y-4">
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-zinc-600">{completedCount} of {units.length} complete</p>
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
            {visibleUnits.map((unit) => {
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
            })}
          </div>
        </div>
      </Panel>

      <UploadCompletedTemplateButton
        month={month}
        currentReadingCount={rows.length}
        expectedReadingCount={units.length}
      />
    </section>
  );
}
