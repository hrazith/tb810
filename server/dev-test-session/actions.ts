"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getFixedBuildingIdentity } from "@/server/building";
import { invalidateBuildingMonthFinancialFactsCache } from "@/server/obligations/building-month-cache";
import { resetCurrentMonthlyObligationApprovalForDev } from "@/server/obligations/approval";

import { getDevTestSessionCookieName, startDevTestSession } from "../dev-test-session";

function returnToValue(formData: FormData) {
  return String(formData.get("return_to") ?? "/").trim() || "/";
}

export async function startDevTestSessionAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const result = await startDevTestSession();
  if (result.error) {
    redirect(`${returnTo}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/", "layout");
  redirect(returnTo);
}

export async function resetDevTestSessionAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const buildingId = getFixedBuildingIdentity().id;
  const supabase = await createClient();
  if (!sessionId) {
    invalidateBuildingMonthFinancialFactsCache(buildingId);
    revalidatePath("/", "layout");
    redirect(returnTo);
  }

  const { data: session } = await supabase
    .from("tb810_dev_test_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("status", "active")
    .maybeSingle();
  if (!session) {
    const cookieStore = await cookies();
    cookieStore.set(getDevTestSessionCookieName(), "", { path: "/", expires: new Date(0) });
    revalidatePath("/", "layout");
    redirect(returnTo);
  }

  const { error } = await supabase.rpc("tb810_reset_dev_test_session", {
    p_session_id: sessionId,
  });
  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  invalidateBuildingMonthFinancialFactsCache(buildingId);
  revalidatePath("/", "layout");
  const cookieStore = await cookies();
  cookieStore.set(getDevTestSessionCookieName(), "", { path: "/", expires: new Date(0) });
  redirect(returnTo);
}

export async function resetDevMonthlyObligationApprovalAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const result = await resetCurrentMonthlyObligationApprovalForDev();
  if (result.error) {
    redirect(`${returnTo}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/", "layout");
  revalidatePath("/obligations");
  redirect(returnTo);
}
