import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getGasBillById } from "@/server/gas";

type PageProps = {
  params: Promise<{
    billId: string;
  }>;
};

export default async function GasBillDetailPage({ params }: PageProps) {
  const { billId } = await params;
  const result = await getGasBillById(billId);
  if (result.error) throw new Error(result.error);
  if (!result.data) notFound();
  const bill = result.data;

  return (
    <section className="space-y-6">
      <Panel className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas Bill</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{bill.supplier_name}</h1>
        <div className="space-y-1 text-sm text-zinc-600">
          <p>Invoice number: {bill.invoice_number}</p>
          <p>Invoice date: {bill.invoice_date}</p>
          <p>Amount: {bill.amount.toFixed(2)}</p>
          <p>Status: {bill.status === "processed" ? "Processed" : "Draft"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/gas/bills">Back to bills</Link>
          </Button>
          {bill.status === "draft" ? (
            <Button asChild variant="primary" size="sm">
              <Link href={`/gas/bills/${bill.id}/edit`}>Edit Bill</Link>
            </Button>
          ) : (
            <p className="text-sm text-zinc-600">Processed bills are read-only.</p>
          )}
        </div>
      </Panel>
    </section>
  );
}
