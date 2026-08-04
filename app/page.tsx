import Link from "next/link";
import { redirect } from "next/navigation";

import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";
import { getSedapalBillCycleState } from "@/server/water";
import { getCurrentReadingMonthCompleteness } from "@/server/water/unit-meter-readings";

const shortcuts = [
  {
    href: "/water/sedapal",
    title: "Sedapal Water Bill",
    description: "You have not started yet.",
  },
] as const;

async function signOut() {
  "use server";

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const [buildingManagerResult, superAdminResult, completenessResult] = await Promise.all([
    supabase.rpc("has_tb810_role", { role_key: "building_manager" }),
    supabase.rpc("has_tb810_role", { role_key: "super_admin" }),
    getCurrentReadingMonthCompleteness(),
  ]);
  const sedapalBillState = await getSedapalBillCycleState();

  const canRenderMeterReadings = Boolean(
    buildingManagerResult.data || superAdminResult.data,
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <Header userEmail={user.email ?? ""} signOutAction={signOut} />

      <section className="mx-auto w-full max-w-3xl space-y-10 px-6 py-16">
        <div className="space-y-4 mt-12">
           
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
              Good morning, Guliana.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600">
              This is the operational home for TB810.
            </p>
          </div>
        <div className="space-y-10 rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {shortcuts.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white"
                >
                  <p className="text-lg font-semibold text-zinc-950">
                    {shortcut.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {sedapalBillState.status === "complete"
                      ? "Sedapal bill entered"
                      : sedapalBillState.status === "in-progress"
                        ? "Bill entered — details incomplete"
                        : shortcut.description}
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-950">
                    {sedapalBillState.status === "complete"
                      ? "Complete"
                      : sedapalBillState.status === "in-progress"
                        ? "In progress"
                        : ""}
                  </p>
                </Link>
              ))}
            </div>

            {canRenderMeterReadings ? (
              <Link
                href={
                  completenessResult.data
                    ? `/water/unit-meter-readings/${completenessResult.data.monthKey}`
                    : "/water/unit-meter-readings"
                }
                className="mt-6 block rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-950 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 sm:p-5"
              >
                <div className="space-y-3">
                  <div>
                    <p className="text-lg  font-semibold   text-zinc-950">
                      Unit Water Readings
                    </p>
                  </div>

                  {completenessResult.error ? (
                    <p className="text-sm text-zinc-600">{completenessResult.error}</p>
                  ) : completenessResult.data ? (
                    completenessResult.data.totalExpectedCount > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-zinc-700">
                          {completenessResult.data.completedCount} of{" "}
                          {completenessResult.data.totalExpectedCount} completed
                        </p>
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-zinc-950 transition-all"
                            style={{
                              width: `${Math.min(100, completenessResult.data.percentage)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600">
                        No expected units are available for the current reading month.
                      </p>
                    )
                  ) : null}
                </div>
              </Link>
            ) : null}
          </div>

          
        </div>
      </section>
    </main>
  );
}

function PanelPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
      Placeholder
    </div>
  );
}
