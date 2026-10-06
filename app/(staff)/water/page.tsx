import { redirect } from "next/navigation";

// The Water domain entry opens the canonical Unit Water intake. The former
// Monthly Water Ledger home was retired (see the decision register).
export default function WaterDomainPage() {
  redirect("/water/unit-meter-readings");
}
