import { Panel } from "@/components/ui/panel";

export default function OwnersLoading() {
  return (
    <section className="space-y-6">
      <Panel className="h-24 animate-pulse" />
      <Panel className="h-16 animate-pulse" />
      <div className="space-y-4">
        <Panel className="h-24 animate-pulse" />
        <Panel className="h-24 animate-pulse" />
      </div>
    </section>
  );
}
