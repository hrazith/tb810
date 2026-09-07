import { redirect } from "next/navigation";

import { Header } from "@/components/header";
import { getStaffContext } from "@/server/staff-context";

import { signOut } from "./actions";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staffContext = await getStaffContext();

  if (!staffContext) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Header
        userEmail={staffContext.user.email ?? ""}
        primaryRoleKey={staffContext.primaryRoleKey}
        signOutAction={signOut}
      />

      <main className="mx-auto w-full max-w-6xl">{children}</main>
    </div>
  );
}
