import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 ">
      <header className="border-b border-zinc-200 bg-white ">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/TB810.svg"
              alt="TB810"
              width={105}
              height={27}
              priority
            />
            <nav className="flex items-center gap-6 text-md font-medium text-zinc-700 ml-12">
              <Link
                href="/dashboard"
                className="transition hover:text-zinc-950"
              >
                Dashboard
              </Link>
              <Link href="/owners" className="transition hover:text-zinc-950">
                Owners
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <form action={signOut} className="flex items-center gap-3">
              <p className="text-sm text-zinc-600">{user.email}</p>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 hover:cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-16">{children}</main>
    </div>
  );
}
