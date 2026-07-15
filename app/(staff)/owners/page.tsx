import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
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
    <section className="">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold text-zinc-900">Owners</h1>
          <p className="mt-2 text-sm text-zinc-700">
            A list of all owners in TB810 including their reference, contact details, status, and unit count.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Button asChild variant="primary" shape="pill">
  <Link href="/owners/new">Add Owner</Link>
</Button>
        </div>
      </div>

      <form
        method="get"
        className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
      >
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search owners"
          className="h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
        />
        <select
          name="status"
          defaultValue={params.status ?? "active"}
          className="h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button className="h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-xs transition hover:border-zinc-950 hover:text-zinc-950">
          Filter
        </button>
      </form>

      {result.error ? (
        <Panel className="mt-6 border-red-200 bg-red-50 text-sm text-red-700">
          {result.error}
        </Panel>
      ) : result.data.length === 0 ? (
        <Panel className="mt-6 border-dashed border-zinc-300 text-center text-sm text-zinc-600">
          No owners found.
        </Panel>
      ) : (
        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="relative min-w-full divide-y divide-zinc-300">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-zinc-900 sm:pl-0"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
                    >
                      Reference
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
                    >
                      Contact
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
                    >
                      Units
                    </th>
                    <th
                      scope="col"
                      className="py-3.5 pr-4 pl-3 sm:pr-0"
                    >
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {result.data.map((owner) => (
                    <tr key={owner.id} className="hover:bg-zinc-50 hover:cursor-pointer test -mx-2">
                      <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-zinc-900 sm:pl-0">
                        {owner.full_name}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
                        {owner.owner_reference}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
                        <div className="space-y-1">
                          <p>{owner.email ?? "No email"}</p>
                          <p>{owner.phone_number ?? "No phone"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            owner.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {owner.active ? "Active" : "Archived"}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
                        {owner.unit_count}
                      </td>
                      <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                        <Link
                          href={`/owners/${owner.id}`}
                          className="text-zinc-950 transition hover:text-zinc-600"
                        >
                          View<span className="sr-only">, {owner.full_name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
