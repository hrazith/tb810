import { GasBillsWorkspace } from "./_components/gas-bills-workspace";
import { loadGasBillsWorkspace } from "@/server/gas";

export default async function GasBillsPage() {
  const result = await loadGasBillsWorkspace();
  if (result.error) throw new Error(result.error);
  return <GasBillsWorkspace data={result.data} />;
}
