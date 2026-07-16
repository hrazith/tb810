import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { listOwners } from "@/server/owners";
import { getTransferDefaults } from "@/server/ownerships";

import { transferOwnershipAction } from "./actions";
import { TransferOwnershipForm } from "./_components/transfer-ownership-form";

type PageProps = {
  params: Promise<{
    unitId: string;
  }>;
};

export default async function TransferOwnershipPage({ params }: PageProps) {
  const { unitId } = await params;
  const [defaultsResult, ownersResult] = await Promise.all([
    getTransferDefaults(unitId),
    listOwners({ status: "active" }),
  ]);

  if (defaultsResult.error) {
    throw new Error(defaultsResult.error);
  }

  if (!defaultsResult.data) {
    notFound();
  }

  if (ownersResult.error) {
    throw new Error(ownersResult.error);
  }

  const defaults = defaultsResult.data;
  const submitLabel = defaults.currentOwnership
    ? "Confirm ownership transfer"
    : "Confirm ownership assignment";

  return (
    <section className="space-y-6">
      <Panel as="div" className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Ownership workflow
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          {defaults.currentOwnership ? "Transfer ownership" : "Assign owner"}
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Ownership changes take effect at the billing-cycle boundary. The Unit
          Account, debt, and invoice history remain unchanged.
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/units/${unitId}`}>Back to unit</Link>
        </Button>
      </Panel>

      <TransferOwnershipForm
        defaults={{ ...defaults, owners: ownersResult.data }}
        action={transferOwnershipAction.bind(null, unitId)}
        submitLabel={submitLabel}
        cancelHref={`/units/${unitId}`}
      />
    </section>
  );
}

