"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { OwnerFormState, OwnerInput } from "@/server/owners/types";

type Props = {
  initialValues?: Partial<OwnerInput> | null;
  action: (prevState: OwnerFormState, formData: FormData) => Promise<OwnerFormState>;
  submitLabel: string;
  cancelHref: string;
};

const initialState: OwnerFormState = {};

function fieldError(field: string, state: OwnerFormState) {
  return state.fieldErrors?.[field as keyof NonNullable<OwnerFormState["fieldErrors"]>];
}

export function OwnerForm({
  initialValues,
  action,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initialValues ?? {};

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-lg font-medium text-gray-900">Full name</span>
          <input
            name="full_name"
            defaultValue={values.full_name ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-950"
            required
          />
          {fieldError("full_name", state) ? (
            <p className="text-sm text-red-600">{fieldError("full_name", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-gray-900">Email</span>
          <input
            name="email"
            type="email"
            defaultValue={values.email ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-950"
          />
          {fieldError("email", state) ? (
            <p className="text-sm text-red-600">{fieldError("email", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-gray-900">Telephone</span>
          <input
            name="phone_number"
            defaultValue={values.phone_number ?? ""}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-950"
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="block text-lg font-medium text-gray-900">Notes</span>
        <textarea
          name="notes"
          rows={5}
          defaultValue={values.notes ?? ""}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-950"
        />
      </label>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
