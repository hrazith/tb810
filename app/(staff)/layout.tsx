import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { isPerfLoggingEnabled } from "@/server/perf";

import { signOut } from "./actions";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staffStartedAt = process.hrtime.bigint();
  const clientCreatedAt = process.hrtime.bigint();
  const supabase = await createClient();
  const clientCreationMs = Number(process.hrtime.bigint() - clientCreatedAt) / 1_000_000;
  const getUserStartedAt = process.hrtime.bigint();
  const { data } = await supabase.auth.getUser();
  const getUserMs = Number(process.hrtime.bigint() - getUserStartedAt) / 1_000_000;
  const user = data.user;
  const postAuthStartedAt = process.hrtime.bigint();

  if (!user) {
    if (isPerfLoggingEnabled()) {
      const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
      console.info(
        [
          "[STAFF_AUTH_PERF]",
          `client_creation_ms=${clientCreationMs.toFixed(1)}`,
          `get_user_ms=${getUserMs.toFixed(1)}`,
          `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
          `total_ms=${(Number(process.hrtime.bigint() - staffStartedAt) / 1_000_000).toFixed(1)}`,
        ].join(" "),
      );
    }
    redirect("/login");
  }

  if (isPerfLoggingEnabled()) {
    const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
    console.info(
      [
        "[STAFF_AUTH_PERF]",
        `client_creation_ms=${clientCreationMs.toFixed(1)}`,
        `get_user_ms=${getUserMs.toFixed(1)}`,
        `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
        `total_ms=${(Number(process.hrtime.bigint() - staffStartedAt) / 1_000_000).toFixed(1)}`,
      ].join(" "),
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Header userEmail={user.email ?? ""} signOutAction={signOut} />

      <main className="mx-auto w-full max-w-6xl px-6 py-20">{children}</main>
    </div>
  );
}
