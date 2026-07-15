"use client";

type Props = {
  action: () => Promise<void>;
};

export function ArchiveUnitForm({ action }: Props) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
      >
        Deactivate
      </button>
    </form>
  );
}
