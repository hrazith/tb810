import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getCurrentBuilding } from "@/server/units";
import { listCommonWaterBills } from "@/server/water";

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

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function WaterPage() {
  const [buildingResult, billsResult] = await Promise.all([
    getCurrentBuilding(),
    listCommonWaterBills(),
  ]);

  if (buildingResult.error) {
    throw new Error(buildingResult.error);
  }

  const building = buildingResult.data;

  if (!building) {
    return (
      <Panel className="border-dashed border-zinc-300 text-sm text-zinc-600">
        No building is available for the common water ledger.
      </Panel>
    );
  }

  return (
    <section className="space-y-6">
      
       
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Sedapal monthly bills
            </h1>
           
          </div>
          <Button asChild variant="primary" shape="pill">
            <Link href="/water/new">Add bill</Link>
          </Button>
        </div>
          <p className="max-w-2xl text-sm text-zinc-600">
              {building.name} · Historical common water bills entered by the
              staff team. Open-month records remain editable while closed
              months are locked, and each record keeps automatic consumption
              and unit cost calculations.
            </p>
     

      {billsResult.error ? (
        <Panel className="border-red-200 bg-red-50 text-sm text-red-700">
          {billsResult.error}
        </Panel>
      ) : billsResult.data.length === 0 ? (
        <Panel className="border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No common water bills recorded yet.
        </Panel>
      ) : (
        <div className="grid gap-4">
          {billsResult.data.map((bill) => (
            <Link
              key={bill.id}
              href={`/water/${bill.id}`}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-px hover:border-zinc-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 ">
                    {bill.description ?? "Sedapal Invoice"}
                  </p>
                  <h2 className="text-lg font-semibold text-zinc-950">
                    {formatPeriod(bill.bill_date)}
                  </h2>
                  
                  <div className="flex gap-6 text-sm text-zinc-600  ">
                    <p>
                      <span className="font-medium text-zinc-900">
                        Reading date:
                      </span>{" "}
                      {bill.bill_date}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">
                        Previous:
                      </span>{" "}
                      {formatReading(bill.previous_reading)}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">
                        Current:
                      </span>{" "}
                      {formatReading(bill.current_reading)}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">
                        Consumption:
                      </span>{" "}
                      {formatReading(bill.total_consumption)}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">
                        Unit cost:
                      </span>{" "}
                      {formatMoney(bill.unit_cost)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Total invoiced
                  </p>
                  <p className="mt-2 text-xl font-semibold text-zinc-950">
                    {formatMoney(bill.amount)}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Status: {bill.status}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
