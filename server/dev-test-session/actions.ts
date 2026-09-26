"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resetCurrentMonthlyObligationApprovalForDev } from "@/server/obligations/approval";
import { runMonthlyObligationPulse } from "@/server/obligations/pulse";
import type { HandoffPersistence } from "@/server/obligations/snapshot";
import { SEDAPAL_SOURCE_PDF_BUCKET } from "@/server/water";

import { getActiveDevTestSessionSummary, getDevTestSessionCookieName, startDevTestSession } from "../dev-test-session";

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
  const supabase = await createClient();
  if (!sessionId) {
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

  const { data: storageMutations, error: storageMutationError } = await supabase
    .from("tb810_dev_test_mutations")
    .select("before_state")
    .eq("session_id", sessionId)
    .eq("domain", "water")
    .eq("record_type", "utility_bill")
    .eq("operation", "create");
  if (storageMutationError) {
    redirect(`${returnTo}?error=${encodeURIComponent(storageMutationError.message)}`);
  }

  for (const mutation of storageMutations ?? []) {
    const beforeState = mutation.before_state;
    if (!beforeState || typeof beforeState !== "object" || Array.isArray(beforeState)) continue;
    const storageBucket = typeof beforeState.storage_bucket === "string" ? beforeState.storage_bucket : "";
    const storagePath = typeof beforeState.storage_path === "string" ? beforeState.storage_path : "";
    if (!storageBucket && !storagePath) continue;
    if (storageBucket !== SEDAPAL_SOURCE_PDF_BUCKET || !storagePath) {
      redirect(`${returnTo}?error=${encodeURIComponent("DEV Sedapal Storage ownership is invalid.")}`);
    }
    const { error: storageError } = await supabase.storage
      .from(storageBucket)
      .remove([storagePath]);
    if (storageError && !/not found|does not exist|no such/i.test(storageError.message)) {
      redirect(`${returnTo}?error=${encodeURIComponent(`Storage cleanup failed: ${storageError.message}`)}`);
    }
  }

  const { error: snapshotResetError } = await (supabase as unknown as {
    rpc: (name: string, args: Record<string, string>) => Promise<{ error: { message: string } | null }>;
  }).rpc("tb810_prepare_dev_monthly_obligation_reset", {
    p_session_id: sessionId,
  });
  if (snapshotResetError) {
    redirect(`${returnTo}?error=${encodeURIComponent(snapshotResetError.message)}`);
  }

  const { error } = await supabase.rpc("tb810_reset_dev_test_session", {
    p_session_id: sessionId,
  });
  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

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

export async function runMonthlyObligationPulseAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  if (process.env.NODE_ENV !== "development") {
    redirect(`${returnTo}?error=${encodeURIComponent("DEV obligation pulse is development-only.")}`);
  }
  const session = await getActiveDevTestSessionSummary();
  if (!session) redirect(`${returnTo}?error=${encodeURIComponent("Start a DEV test session first.")}`);

  const persistence: HandoffPersistence = async ({ supabase, buildingId, obligationMonth, operatingMonth }) => {
    const rpc = await (supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { billingPeriodId: string; status: string; obligationRowCount: number } | null; error: { message: string } | null }>;
    }).rpc("tb810_mark_dev_monthly_obligation_ready_for_review", {
      p_session_id: session.id,
      p_building_id: buildingId,
      p_period_year: Number(obligationMonth.slice(0, 4)),
      p_period_month: Number(obligationMonth.slice(5, 7)),
      p_operating_year: Number(operatingMonth.slice(0, 4)),
      p_operating_month: Number(operatingMonth.slice(5, 7)),
    });
    if (rpc.error) return { data: null, error: rpc.error.message, failureKind: "error" as const };
    return { data: rpc.data, error: null };
  };
  const result = await runMonthlyObligationPulse("human", persistence);
  if (result.status === "error") redirect(`${returnTo}?error=${encodeURIComponent(result.reason ?? "Monthly obligation pulse failed.")}`);
  revalidatePath("/", "layout");
  revalidatePath("/obligations");
  redirect(`${returnTo}?pulse=${result.status}`);
}
