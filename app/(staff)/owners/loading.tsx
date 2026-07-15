import { Surface } from "@/components/ui/surface";

export default function OwnersLoading() {
  return (
    <section className="space-y-6">
      <Surface className="h-24 animate-pulse" />
      <Surface className="h-16 animate-pulse" />
      <div className="space-y-4">
        <Surface className="h-24 animate-pulse" />
        <Surface className="h-24 animate-pulse" />
      </div>
    </section>
  );
}
