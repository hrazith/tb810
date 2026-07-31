import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { parseWaterMonthKey } from "@/server/water/month";
import { getUnitMeterReadingById } from "@/server/water/unit-meter-readings";

type PageProps = {
  params: Promise<{
    month: string;
    readingId: string;
  }>;
};

export default async function UnitMeterReadingDetailPage({ params }: PageProps) {
  const { month, readingId } = await params;
  const monthKey = parseWaterMonthKey(month);
  const result = await getUnitMeterReadingById(readingId);
  if (result.error) throw new Error(result.error);
  if (!result.data) notFound();

  const resolvedMonth = result.data.reading_date.slice(0, 7);
  if (!monthKey || monthKey !== resolvedMonth) {
    redirect(`/water/unit-meter-readings/${resolvedMonth}/reading/${readingId}`);
  }

  const reading = result.data;

  return (
    <section className="space-y-6">
      <Panel className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Unit Water Meter Reading</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{reading.unit_number}</h1>
        <p className="text-sm text-zinc-600">{reading.reading_month_label}</p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel as="div" className="space-y-2">
          <p className="text-sm font-medium text-zinc-500">Reading Date</p>
          <p className="text-zinc-950">{reading.reading_date}</p>
          <p className="text-sm font-medium text-zinc-500">Current Reading</p>
          <p className="text-zinc-950">{reading.reading_end ?? "—"}</p>
          <p className="text-sm font-medium text-zinc-500">Previous Reading</p>
          <p className="text-zinc-950">{reading.previous_reading_label}</p>
        </Panel>
        <Panel as="div" className="space-y-2">
          <p className="text-sm font-medium text-zinc-500">Consumption</p>
          <p className="text-zinc-950">{reading.consumption ?? "—"}</p>
          <p className="text-sm font-medium text-zinc-500">Status</p>
          <p className="text-zinc-950">{reading.status}</p>
          <p className="text-sm font-medium text-zinc-500">Notes</p>
          <p className="text-zinc-950">{reading.notes ?? "—"}</p>
        </Panel>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="secondary">
          <Link href={`/water/unit-meter-readings/${resolvedMonth}`}>Back</Link>
        </Button>
        <Button asChild variant="primary">
          <Link href={`/water/unit-meter-readings/${resolvedMonth}/reading/${reading.id}/edit`}>Edit</Link>
        </Button>
      </div>
    </section>
  );
}

