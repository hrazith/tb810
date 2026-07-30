import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getReadingDefaults, getUnitMeterReadingById, getUnitOptions } from "@/server/water/unit-meter-readings";

import { updateUnitMeterReadingAction } from "../../actions";
import { UnitMeterReadingForm } from "../../_components/unit-meter-reading-form";

type PageProps = { params: Promise<{ readingId: string }> };

export default async function EditUnitMeterReadingPage({ params }: PageProps) {
  const { readingId } = await params;
  const [readingResult, unitsResult] = await Promise.all([
    getUnitMeterReadingById(readingId),
    getUnitOptions(),
  ]);
  if (readingResult.error) throw new Error(readingResult.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (!readingResult.data) notFound();
  const defaults = await getReadingDefaults(readingResult.data.reading_date);
  if (defaults.error) throw new Error(defaults.error);
  return (
    <section className="space-y-6">
      <Panel><h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Edit Unit Water Meter Reading</h1></Panel>
      <UnitMeterReadingForm
        action={updateUnitMeterReadingAction}
        submitLabel="Update Reading"
        units={unitsResult.data}
        readingDefaults={defaults.data}
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
