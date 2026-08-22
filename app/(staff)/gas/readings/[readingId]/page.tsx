import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getGasReadingById, listGasReadings } from "@/server/gas";
import { deleteGasReadingAction } from "@/server/gas/actions";
import { listUnits } from "@/server/units";

import { GasReadingForm } from "../../_components/gas-reading-form";
import { updateGasReadingAction } from "@/server/gas/actions";

type PageProps = {
  params: Promise<{
    readingId: string;
  }>;
};

export default async function GasReadingDetailPage({ params }: PageProps) {
  const { readingId } = await params;
  const [result, unitsResult] = await Promise.all([getGasReadingById(readingId), listUnits()]);
  if (result.error) throw new Error(result.error);
  if (unitsResult.error) throw new Error(unitsResult.error);
  if (!result.data) notFound();

  const readingsResult = await listGasReadings(unitsResult.data);
  if (readingsResult.error) throw new Error(readingsResult.error);

  return (
    <section className="space-y-6">
      <Panel className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas Reading</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{result.data.unit_number}</h1>
        <div className="space-y-1 text-sm text-zinc-600">
          <p>Reading month: {result.data.reading_month.slice(0, 7)}</p>
          <p>Reading date: {result.data.reading_date}</p>
          <p>Current reading: {result.data.current_reading.toFixed(3)}</p>
          <p>Consumption: {result.data.consumption == null ? "—" : result.data.consumption.toFixed(3)}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/gas/readings">Back to readings</Link>
        </Button>
      </Panel>

      <GasReadingForm
        action={updateGasReadingAction}
        units={unitsResult.data}
        readings={readingsResult.data}
        submitLabel="Save Reading"
        initialMonth={result.data.reading_month.slice(0, 7)}
      />
      <form action={deleteGasReadingAction}>
        <input type="hidden" name="reading_id" value={result.data.id} />
        <Button type="submit" variant="secondary" size="sm">
          Delete Reading
        </Button>
      </form>
    </section>
  );
}
