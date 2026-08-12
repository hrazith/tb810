import { redirect } from "next/navigation";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function GasReadingsPage() {
  redirect(`/gas/readings/month/${currentMonthKey()}`);
}
