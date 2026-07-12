import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveOwnerAction } from "../actions";
import { ArchiveOwnerForm } from "../_components/archive-owner-form";
import { getOwnerById } from "@/server/owners";

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

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
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
            <ArchiveOwnerForm action={archiveOwnerAction.bind(null, owner.id)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Notes</h2>
          <p className="mt-3 text-sm text-zinc-600">{owner.notes ?? "No notes added."}</p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Ownership summary</h2>
          <p className="mt-3 text-sm text-zinc-600">Placeholder for ownership summary.</p>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Unit accounts</h2>
          <p className="mt-3 text-sm text-zinc-600">Placeholder for unit account summary.</p>
        </section>

        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-950">Future sections</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600">
            <li>Invoices</li>
            <li>Payments</li>
            <li>Receipts</li>
            <li>Documents</li>
            <li>Activity</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
