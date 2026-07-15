export default function Loading() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="h-6 w-28 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-zinc-100" />
      <div className="mt-6 grid gap-3">
        <div className="h-11 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    </div>
  );
}
