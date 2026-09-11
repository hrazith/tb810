"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { approveMonthlyObligation } from "@/server/obligations/approval";

export async function approveMonthlyObligationAction(formData: FormData) {
  const billingPeriodId = String(formData.get("billingPeriodId") ?? "");
  const result = await approveMonthlyObligation({ billingPeriodId });
  if (result.error) {
    redirect(`/?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/obligations");
  redirect("/");
}
