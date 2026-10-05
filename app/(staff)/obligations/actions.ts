"use server";

import { revalidatePath } from "next/cache";

import { approveMonthlyObligation } from "@/server/obligations/approval";
import { getCarlosObligationReviewDetail } from "@/server/dashboard";
import { getStaffContext } from "@/server/staff-context";

export type ApprovalActionState = {
  data: {
    status: string;
    obligationMonth: string;
    obligationRowCount: number;
    total: string | null;
  } | null;
  error: string | null;
  obligationMonth?: string;
};

export async function loadCarlosObligationReviewAction(obligationMonth: string) {
  const staffContext = await getStaffContext();
  if (!staffContext || staffContext.primaryRoleKey !== "super_admin") {
    return { data: null, error: "Only Carlos can review Monthly Obligations." };
  }

  return getCarlosObligationReviewDetail(obligationMonth);
}

export async function approveMonthlyObligationAction(_previousState: ApprovalActionState, formData: FormData): Promise<ApprovalActionState> {
  const billingPeriodId = String(formData.get("billingPeriodId") ?? "");
  const reviewFingerprint = String(formData.get("reviewFingerprint") ?? "").trim() || undefined;
  const obligationMonth = String(formData.get("obligationMonth") ?? "");
  const result = await approveMonthlyObligation({ billingPeriodId, reviewFingerprint });
  if (result.error) {
    return { data: null, error: result.error, obligationMonth };
  }

  revalidatePath("/", "layout");
  revalidatePath("/obligations");
  return { data: result.data, error: null };
}
