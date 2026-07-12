import { OwnerForm } from "../_components/owner-form";
import { createOwnerAction } from "../actions";

export default function NewOwnerPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Owners
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Add Owner
        </h1>
      </div>

      <OwnerForm
        action={createOwnerAction}
        submitLabel="Save owner"
        cancelHref="/owners"
      />
    </section>
  );
}

