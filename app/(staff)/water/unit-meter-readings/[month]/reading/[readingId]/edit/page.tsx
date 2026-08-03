import { notFound, redirect } from "next/navigation";

import { getReadingDefaults, getUnitMeterReadingById, getUnitOptions } from "@/server/water/unit-meter-readings";
import { getActiveReadingMonth } from "@/server/water/unit-meter-readings";
import { parseWaterMonthKey } from "@/server/water/month";

import { updateUnitMeterReadingAction } from "../../../../actions";
import { UnitMeterReadingForm } from "../../../../_components/unit-meter-reading-form";

type PageProps = {
  params: Promise<{
    month: string;
    readingId: string;
  }>;
};

export default async function EditUnitMeterReadingPage({ params }: PageProps) {
  const { month, readingId } = await params;
  const monthKey = parseWaterMonthKey(month);
  const [readingResult, unitsResult] = await Promise.all([getUnitMeterReadingById(readingId), getUnitOptions()]);
  if (readingResult.error) throw new Error(readingResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (!readingResult.data) notFound();

  const resolvedMonth = readingResult.data.reading_date.slice(0, 7);
  if (!monthKey || monthKey !== resolvedMonth) {
    redirect(`/water/unit-meter-readings/${resolvedMonth}/reading/${readingId}/edit`);
  }

  const defaults = await getReadingDefaults(readingResult.data.reading_date);
  if (defaults.error) throw new Error(defaults.error);
  const historicalEditingAvailable =
    process.env.NODE_ENV === "development" &&
    process.env.TB810_ALLOW_HISTORICAL_READING_EDITS === "true";
  const isHistoricalMonth = readingResult.data.reading_date.slice(0, 7) !== getActiveReadingMonth().key;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Unit Water Meter Reading</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Edit Reading</h1>
      </div>
      <UnitMeterReadingForm
        action={updateUnitMeterReadingAction}
        submitLabel="Update Reading"
        units={unitsResult.data}
        readingDefaults={defaults.data}
        historicalEditingAvailable={historicalEditingAvailable}
        isHistoricalMonth={isHistoricalMonth}
        initialValues={{
          reading_id: readingResult.data.id,
          unit_id: readingResult.data.unit_id,
          reading_date: readingResult.data.reading_date,
          reading_end: String(readingResult.data.reading_end ?? ""),
          reading_start: String(readingResult.data.reading_start ?? ""),
          status: readingResult.data.status,
          notes: readingResult.data.notes ?? "",
        }}
      />
    </section>
  );
}
