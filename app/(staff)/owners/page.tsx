import Link from "next/link";

import { listOwners } from "@/server/owners";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: "active" | "archived" | "all";
  }>;
};

export default async function OwnersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const result = await listOwners({
    query: params.q,
    status: params.status,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4     sm:flex-row sm:items-end sm:justify-between">
        <div>
          
          <h1 className="text-3xl font-semibold text-zinc-900">
            Owners
          </h1>
        </div>
        <div className=" flex items-center ">
          <form
        method="get"
        className="grid gap-3 rounded-2xl    p-4  sm:grid-cols-[1fr_auto_auto]"
      >
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search owners"
          className="h-11 rounded-full border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
        />
        <select
          name="status"
          defaultValue={params.status ?? "active"}
          className="h-11 rounded-full border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button className="h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950">
          Filter
        </button>
      </form>
      <Link
          href="/owners/new"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-8 text-md font-semibold text-white transition hover:bg-zinc-800"
        >
          Add Owner
        </Link>
          </div>
        

        
      </div>

      

      {result.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {result.error}
        </div>
      ) : result.data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-600">
          No owners found.
        </div>
      ) : (
        <div className="grid gap-4">
          {result.data.map((owner) => (
            <Link
              key={owner.id}
              href={`/owners/${owner.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-400"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-zinc-950">{owner.full_name}</h2>
                  <p className="text-sm text-zinc-600">
                    {owner.email ?? "No email"} · {owner.phone_number ?? "No phone"}
                  </p>
                  <p className="text-sm text-zinc-500">
                    Reference: {owner.owner_reference}
                  </p>
                </div>
                <div className="space-y-1 text-sm text-zinc-600 sm:text-right">
                  <p>Status: {owner.active ? "Active" : "Archived"}</p>
                  <p>Units owned: {owner.unit_count}</p>
                  <p>Updated: {new Date(owner.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
