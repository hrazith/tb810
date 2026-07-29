import Image from "next/image";
import Link from "next/link";

import { brandConfig, SignOut } from "@/brand";

type HeaderProps = {
  userEmail: string;
  signOutAction: () => Promise<void>;
};

export function Header({ userEmail, signOutAction }: HeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Go to operations home">
            <Image
              src="/TB810.svg"
              alt={brandConfig.shortName}
              width={105}
              height={27}
              priority
            />
          </Link>
          <nav className="ml-12 flex items-center gap-6 text-md font-medium text-zinc-700">
            <Link href="/owners" className="inline-flex items-center gap-2 transition hover:text-zinc-950">
              Owners
            </Link>
            <Link href="/units" className="inline-flex items-center gap-2 transition hover:text-zinc-950">
              Units
            </Link>
            <Link
              href="/water"
              className="inline-flex items-center gap-2 transition hover:text-zinc-950"
            >
              Water
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-6">
          <form action={signOutAction} className="flex items-center gap-3">
            <p className="text-sm text-zinc-600">{userEmail}</p>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 transition hover:cursor-pointer hover:border-zinc-950 hover:text-zinc-950"
            >
              <SignOut aria-hidden size={16} />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
