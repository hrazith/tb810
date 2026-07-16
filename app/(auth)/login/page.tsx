"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui/panel";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signIn, initialState);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        router.replace("/dashboard");
      }
    };

    void checkSession();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
      <Panel as="section" padding="spacious" className="w-full max-w-md">
        <div className="mb-32">
          <Image
            src="/TB810.svg"
            alt="TB810"
            width={105}
            height={27}
            priority
          />
        </div>

        <form action={formAction} className="space-y-6">
          <label className="block space-y-4">
            <span className="text-lg font-medium">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-4 py-4 text-md outline-none transition focus:border-zinc-950"
            />
          </label>

          <label className="block space-y-4">
            <span className="text-lg font-medium text-gray-900">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-4 py-4 text-md outline-none transition focus:border-zinc-950"
            />
          </label>

          {state.error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="hover:cursor-pointer inline-flex h-14 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-lg font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 mt-4"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </Panel>
    </main>
  );
}
