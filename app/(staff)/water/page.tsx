import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatMonthYear } from "@/lib/water-dates";
import { getWaterDomainHome, startNextWaterMonth } from "@/server/water/domain-home";

export default async function WaterDomainHomePage() {
  const result = await getWaterDomainHome();

  if (result.error) {
    throw new Error(result.error);
  }

  const home = result.data;

  async function startMonthAction() {
    "use server";

    const startResult = await startNextWaterMonth();
    if (startResult.error) {
      throw new Error(startResult.error);
    }

    redirect(`/water/${startResult.data.period_key}`);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Water
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Water Domain Home
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600">
          Manage monthly water billing, meter readings, review, and closing.
        </p>
      </div>

      {home.current_month ? (
        <Panel as="section" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Current Month
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                {home.current_month.period_label}
              </h2>
              <p className="text-sm text-zinc-600">{home.current_month.status}</p>
              <p className="text-sm text-zinc-600">{home.current_month.progress_label}</p>
            </div>
          </div>

          <Button asChild variant="primary" shape="pill">
            <Link href={home.current_month.link_href}>Continue</Link>
          </Button>
        </Panel>
      ) : (
        <Panel as="section" className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Current Month
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
              No monthly water ledgers yet.
            </h2>
            <p className="text-sm text-zinc-600">
              Start the first month to begin entering the Sedapal bill and unit meter readings.
            </p>
          </div>

          <form action={startMonthAction}>
            <Button type="submit" variant="primary" shape="pill">
              Start New Month
            </Button>
          </form>
        </Panel>
      )}

      <Panel as="section" className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Previous Months
        </p>

        {home.previous_months.length > 0 ? (
          <div className="divide-y divide-zinc-200">
            {home.previous_months.map((period) => (
              <Link
                key={period.period_key}
                href={period.link_href}
                className="flex items-center justify-between gap-4 py-4 transition hover:text-zinc-950"
              >
                <div className="space-y-1">
                  <p className="font-medium text-zinc-950">{period.period_label}</p>
                  <p className="text-sm text-zinc-600">{period.progress_label}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-950">{period.status}</p>
                  <p className="text-xs text-zinc-500">
                    {formatMonthYear(new Date(`${period.period_start}T00:00:00Z`))}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
            No monthly water ledgers yet.
          </p>
        )}
      </Panel>

      <Panel as="section" className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-950">Start New Month</h2>
          <p className="text-sm text-zinc-600">
            Begin the next Monthly Water Ledger using the latest existing month as the starting point.
          </p>
        </div>

        <form action={startMonthAction}>
          <Button type="submit" variant="secondary" shape="pill">
            Start New Month
          </Button>
        </form>
      </Panel>
    </section>
  );
}
