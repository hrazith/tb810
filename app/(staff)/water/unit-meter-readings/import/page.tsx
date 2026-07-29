import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function UnitMeterReadingsImportPage() {
  return (
    <section className="space-y-6">
      <Panel className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Water</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Upload Completed Template</h1>
        <p className="text-sm text-zinc-600">
          The Excel parser is not installed in this repo yet, so the upload pipeline is present in the UI but not active. This route is the placeholder entry point for the import workflow.
        </p>
      </Panel>
      <Panel className="space-y-4">
        <Button variant="secondary">Download Template</Button>
        <p className="text-sm text-zinc-600">TODO: connect a real `.xlsx` parser when the dependency is available.</p>
      </Panel>
    </section>
  );
}
