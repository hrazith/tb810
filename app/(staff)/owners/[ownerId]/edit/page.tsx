import { notFound } from "next/navigation";

import { ArchiveOwnerForm } from "../../_components/archive-owner-form";
import { OwnerForm } from "../../_components/owner-form";
import { archiveOwnerAction, updateOwnerAction } from "../../actions";
import { getOwnerFormDefaults } from "@/server/owners";

type PageProps = {
  params: Promise<{
    ownerId: string;
  }>;
};

export default async function EditOwnerPage({ params }: PageProps) {
  const { ownerId } = await params;
  const defaults = await getOwnerFormDefaults(ownerId);

  if (!defaults) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Owners
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Edit Owner
        </h1>
      </div>

      <OwnerForm
        initialValues={defaults}
        action={updateOwnerAction.bind(null, ownerId)}
        submitLabel="Save changes"
        cancelHref={`/owners/${ownerId}`}
      />

      <div className="flex justify-start">
        <ArchiveOwnerForm action={archiveOwnerAction.bind(null, ownerId)} />
      </div>
    </section>
  );
}
