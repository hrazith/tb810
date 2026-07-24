import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getWaterBillById } from "@/server/water";

type PageProps = {
  params: Promise<{
    utilityBillId: string;
  }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatReading(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function WaterBillDetailPage({ params }: PageProps) {
  const { utilityBillId } = await params;
  const result = await getWaterBillById(utilityBillId);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    notFound();
  }

  const bill = result.data;
  const canEdit = bill.is_editable;
  const statusLabel = canEdit ? "Open" : "Locked";

  return (
    <section className="space-y-6">
      <Panel as="div" className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Common Water Ledger
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              {bill.bill_date}
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600">
              {canEdit
                ? "Open Sedapal common water invoice record."
                : "Finalized Sedapal common water invoice record."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
              {statusLabel}
            </span>
            <div className="flex gap-3">
              <Button asChild variant="secondary" size="sm">
                <Link href="/water">Back to ledger</Link>
              </Button>
              {canEdit ? (
                <Button asChild variant="primary" size="sm">
                  <Link href={`/water/${bill.id}/edit`}>Edit</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">Invoice facts</h2>
          <dl className="mt-4 grid gap-3 text-sm text-zinc-600">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Bill date</dt>
              <dd>{bill.bill_date}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Amount invoiced</dt>
              <dd>{formatMoney(bill.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Status</dt>
              <dd>{bill.status}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Description</dt>
              <dd>{bill.description ?? "Sedapal common water invoice"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Notes</dt>
              <dd>{bill.notes ?? "—"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">
            Automatic calculations
          </h2>
          <dl className="mt-4 grid gap-3 text-sm text-zinc-600">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Previous reading</dt>
              <dd>{formatReading(bill.previous_reading)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Current reading</dt>
              <dd>{formatReading(bill.current_reading)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Total consumption</dt>
              <dd>{formatReading(bill.total_consumption)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-zinc-900">Unit cost</dt>
              <dd>{formatMoney(bill.unit_cost)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel as="section">
        <h2 className="text-lg font-semibold text-zinc-950">Ledger note</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {canEdit
            ? "This record remains editable while its billing month is still open."
            : "This record is locked because its billing month is closed or finalized."}
        </p>
      </Panel>
    </section>
  );
}
