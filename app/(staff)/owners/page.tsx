import { Panel } from "@/components/ui/panel";
import { listOwners } from "@/server/owners";

import { OwnersControls } from "./_components/owners-controls";
import { OwnersTable } from "./_components/owners-table";

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
      <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-zinc-950">
          Owners
        </h1>
        <OwnersControls
          initialQuery={params.q ?? ""}
          initialStatus={params.status ?? "active"}
        />
      </div>

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
              <OwnersTable owners={result.data} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
