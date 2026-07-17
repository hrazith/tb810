import Link from "next/link";
import { notFound } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { archiveOwnerAction } from "../actions";
import { ArchiveOwnerForm } from "../_components/archive-owner-form";
import { getOwnerById } from "@/server/owners";
import { getOwnerUnitsSnapshot } from "@/server/ownerships";

type PageProps = {
  params: Promise<{
    ownerId: string;
  }>;
};

export default async function OwnerDetailPage({ params }: PageProps) {
  const { ownerId } = await params;
  const result = await getOwnerById(ownerId);

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.data) {
    notFound();
  }

  const owner = result.data;
  const ownershipResult = await getOwnerUnitsSnapshot(ownerId);

  if (ownershipResult.error) {
    throw new Error(ownershipResult.error);
  }

  const ownerships = ownershipResult.data;

  return (
    <section className="space-y-6">
      <Panel as="div">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Owner
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              {owner.full_name}
            </h1>
            <div className="text-sm text-zinc-600">
              <p>Reference: {owner.owner_reference}</p>
              <p>{owner.email ?? "No email"}</p>
              <p>{owner.phone_number ?? "No phone"}</p>
              <p>Status: {owner.active ? "Active" : "Archived"}</p>
              <p>Units owned: {owner.unit_count}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/owners/${owner.id}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Edit
            </Link>
            <ArchiveOwnerForm
              action={archiveOwnerAction.bind(null, owner.id)}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">Notes</h2>
          <p className="mt-3 text-sm text-zinc-600">
            {owner.notes ?? "No notes added."}
          </p>
        </Panel>

        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">
            Ownership summary
          </h2>
          <p className="mt-3 text-sm text-zinc-600">
            {ownerships.currentUnits.length +
              ownerships.scheduledUnits.length +
              ownerships.pastUnits.length} total
            ownership records.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">
            Currently owned Units
          </h2>
          {ownerships.currentUnits.length ? (
            <div className="mt-3 space-y-3">
              {ownerships.currentUnits.map((item) => (
                <div
                  key={item.unit_id}
                  className="rounded-xl border border-zinc-200 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-zinc-950">
                        {item.unit_number}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {item.unit_type_name}
                      </p>
                      <p className="text-sm text-zinc-600">
                        Starts: {item.ownership_start_date}
                      </p>
                    </div>
                    <Link
                      href={`/units/${item.unit_id}`}
                      className="text-sm font-medium text-zinc-950 underline-offset-4 transition hover:underline"
                    >
                      View unit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">No current units.</p>
          )}
        </Panel>

        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">
            Scheduled Units
          </h2>
          {ownerships.scheduledUnits.length ? (
            <div className="mt-3 space-y-3">
              {ownerships.scheduledUnits.map((item) => (
                <div
                  key={item.unit_id}
                  className="rounded-xl border border-zinc-200 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-zinc-950">
                        {item.unit_number}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {item.unit_type_name}
                      </p>
                      <p className="text-sm text-zinc-600">
                        Starts: {item.ownership_start_date}
                      </p>
                    </div>
                    <Link
                      href={`/units/${item.unit_id}`}
                      className="text-sm font-medium text-zinc-950 underline-offset-4 transition hover:underline"
                    >
                      View unit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">No scheduled units.</p>
          )}
        </Panel>

        <Panel as="section">
          <h2 className="text-lg font-semibold text-zinc-950">Past Units</h2>
          {ownerships.pastUnits.length ? (
            <div className="mt-3 space-y-3">
              {ownerships.pastUnits.map((item) => (
                <div
                  key={`${item.unit_id}-${item.ownership_start_date}-${item.ownership_end_date}`}
                  className="rounded-xl border border-zinc-200 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-zinc-950">
                        {item.unit_number}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {item.unit_type_name}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {item.ownership_start_date} to{" "}
                        {item.ownership_end_date ?? "Current"}
                      </p>
                    </div>
                    <Link
                      href={`/units/${item.unit_id}`}
                      className="text-sm font-medium text-zinc-950 underline-offset-4 transition hover:underline"
                    >
                      View unit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">No past units.</p>
          )}
        </Panel>
      </div>
    </section>
  );
}
