"use client";

import { useTransition } from "react";

type Props = {
  action: () => Promise<void>;
};

export function ArchiveOwnerForm({ action }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirm("Archive this owner?")) {
          return;
        }

        startTransition(() => {
          void action();
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
      >
        Archive
      </button>
    </form>
  );
}
