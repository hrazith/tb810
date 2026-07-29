import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";

import { signOut } from "./actions";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Header userEmail={user.email ?? ""} signOutAction={signOut} />

      <main className="mx-auto w-full max-w-6xl px-6 py-20">{children}</main>
    </div>
  );
}
