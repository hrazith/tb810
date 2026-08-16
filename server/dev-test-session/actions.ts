"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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
  redirect(returnTo);
}

export async function resetDevTestSessionAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const supabase = await createClient();
  if (!sessionId) {
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
    redirect(returnTo);
  }

  const { error } = await supabase.rpc("tb810_reset_dev_test_session", {
    p_session_id: sessionId,
  });
  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(getDevTestSessionCookieName(), "", { path: "/", expires: new Date(0) });
  redirect(returnTo);
}
