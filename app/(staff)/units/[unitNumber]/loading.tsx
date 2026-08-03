export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-44 animate-pulse rounded-2xl bg-zinc-100" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    </div>
  );
}
