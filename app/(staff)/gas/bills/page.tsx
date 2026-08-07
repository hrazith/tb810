import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { GasImportDialog } from "../_components/gas-import-dialog";
import { importGasWorkbookAction } from "@/server/gas/actions";
import { listGasBills } from "@/server/gas";

export default async function GasBillsPage() {
  const result = await listGasBills();
  if (result.error) throw new Error(result.error);
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Gas</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Supplier Bills</h1>
        </div>
        <div className="flex gap-3">
          <GasImportDialog action={importGasWorkbookAction} />
          <Button asChild variant="primary" shape="pill">
            <Link href="/gas/bills/new">Add Bill</Link>
          </Button>
        </div>
      </div>
      <Panel className="overflow-hidden p-0">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {result.data.map((bill) => (
              <tr key={bill.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3"><Link className="font-medium text-zinc-950" href={`/gas/bills/${bill.id}`}>{bill.supplier_name}</Link></td>
                <td className="px-4 py-3 text-zinc-600">{bill.invoice_number}</td>
                <td className="px-4 py-3 text-zinc-600">{bill.invoice_date}</td>
                <td className="px-4 py-3 text-zinc-600">{bill.amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-zinc-600">{bill.status === "processed" ? "Processed" : "Draft"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
