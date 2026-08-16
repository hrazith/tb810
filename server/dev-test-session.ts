import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const DEV_TEST_SESSION_COOKIE = "tb810_dev_test_session_id";

export type DevTestSessionSummary = {
  id: string;
  mutationCount: number;
};

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

export function getDevTestSessionCookieName() {
  return DEV_TEST_SESSION_COOKIE;
}

export async function getActiveDevTestSessionId() {
  if (!isDevelopment()) return null;
  const cookieStore = await cookies();
  return cookieStore.get(DEV_TEST_SESSION_COOKIE)?.value ?? null;
}

export async function getActiveDevTestSessionSummary(): Promise<DevTestSessionSummary | null> {
  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) return null;

  const supabase = await createClient();
  const [{ data: session }, { count }] = await Promise.all([
    supabase
      .from("tb810_dev_test_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("tb810_dev_test_mutations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
  ]);

  if (!session) return null;
  return { id: session.id, mutationCount: count ?? 0 };
}

export async function startDevTestSession() {
  if (!isDevelopment()) {
    return { error: "DEV test sessions are development-only." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_dev_test_sessions")
    .insert({})
    .select("id")
    .single();
  if (error) return { error: error.message };
  const cookieStore = await cookies();
  cookieStore.set(DEV_TEST_SESSION_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return { data: { id: data.id }, error: null };
}

export async function recordDevTestMutation(input: {
  domain: "water" | "charge";
  recordType: "meter_reading" | "charge_series";
  operation: "create" | "update";
  recordIdentity: string;
  beforeState?: Record<string, unknown> | null;
}) {
  if (!isDevelopment()) return { error: "DEV test sessions are development-only." };
  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase.from("tb810_dev_test_mutations").insert({
    session_id: sessionId,
    domain: input.domain,
    record_type: input.recordType,
    operation: input.operation,
    record_identity: input.recordIdentity,
    before_state: input.beforeState ? (input.beforeState as Json) : null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function isRecordCreatedByActiveDevTestSession(args: {
  domain: "water" | "charge";
  recordType: "meter_reading" | "charge_series";
  recordIdentity: string;
}) {
  const sessionId = await getActiveDevTestSessionId();
  if (!sessionId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tb810_dev_test_mutations")
    .select("id")
    .eq("session_id", sessionId)
    .eq("domain", args.domain)
    .eq("record_type", args.recordType)
    .eq("operation", "create")
    .eq("record_identity", args.recordIdentity)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function hasActiveDevTestSession() {
  return Boolean(await getActiveDevTestSessionSummary());
}
