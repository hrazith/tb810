import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { GasImportDialog } from "@/app/(staff)/gas/_components/gas-import-dialog";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { listGasReadings } from "@/server/gas";
import { createGasReadingAction, importGasWorkbookAction } from "@/server/gas/actions";
import { getCurrentBuilding, listUnits } from "@/server/units";

import { GasReadingLedgerPanel, type GasMonthOption, type GasReadingLedgerRow } from "../../_components/gas-reading-ledger-panel";

type PageProps = {
  params: Promise<{
    month: string;
  }>;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function isMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthKeyFromDate(date: string) {
  return date.slice(0, 7);
}

export default async function GasReadingMonthPage({ params }: PageProps) {
  const { month } = await params;
  const selectedMonthKey = isMonthKey(month) ? month : currentMonthKey();
  if (!isMonthKey(month)) {
    redirect(`/gas/readings/month/${selectedMonthKey}`);
  }

  const [buildingResult, unitsResult] = await Promise.all([
    getCurrentBuilding(),
    listUnits(),
  ]);
  if (buildingResult.error) throw new Error(buildingResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (!buildingResult.data) notFound();

  const readingsResult = await listGasReadings(unitsResult.data);
  if (readingsResult.error) throw new Error(readingsResult.error);

  const activeMonthKey = currentMonthKey();
  const monthKeys = new Set<string>([activeMonthKey, selectedMonthKey]);
  for (const reading of readingsResult.data) {
    monthKeys.add(monthKeyFromDate(reading.reading_month));
  }
  const monthOptions: GasMonthOption[] = [...monthKeys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));

  const eligibleUnits = unitsResult.data.filter((unit) => unit.unit_type_code === "condo" && unit.has_gas_service);
  const monthReadings = readingsResult.data.filter((reading) => monthKeyFromDate(reading.reading_month) === selectedMonthKey);
  const previousByUnitId = Object.fromEntries(
    eligibleUnits.map((unit) => {
      const prior = readingsResult.data
        .filter((reading) => reading.unit_id === unit.id && monthKeyFromDate(reading.reading_month) < selectedMonthKey)
        .sort((a, b) => b.reading_month.localeCompare(a.reading_month))[0] ?? null;
      return [unit.id, prior];
    }),
  ) as Record<string, (typeof readingsResult.data)[number] | null>;
  const currentByUnitId = new Map(monthReadings.map((reading) => [reading.unit_id, reading]));

  const rows: GasReadingLedgerRow[] = eligibleUnits.map((unit) => {
    const current = currentByUnitId.get(unit.id) ?? null;
    const previous = previousByUnitId[unit.id] ?? null;
    const currentReading = current ? current.current_reading : null;
    const currentConsumption = current ? current.consumption : null;
    return {
      unit_id: unit.id,
      unit_number: unit.unit_number,
      floor: unit.floor,
      current_reading: currentReading,
      previous_reading: previous?.current_reading ?? null,
      consumption: currentConsumption,
      reading_date: current?.reading_date ?? `${selectedMonthKey}-01`,
      reading_id: current?.id ?? null,
      has_reading: Boolean(current),
    };
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Gas Readings</h1>
        </div>
        <div className="flex items-center gap-3">
          <GasImportDialog action={importGasWorkbookAction} />
          <Button asChild variant="secondary" shape="pill">
            <Link href="/gas/readings">All Readings</Link>
          </Button>
        </div>
      </div>

      <Panel className="p-0">
        <GasReadingLedgerPanel
          action={createGasReadingAction}
          selectedMonthKey={selectedMonthKey}
          monthOptions={monthOptions}
          rows={rows}
        />
      </Panel>
    </section>
  );
}
