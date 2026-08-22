import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/database.types";
import { isPerfLoggingEnabled } from "@/server/perf";

function createProxySupabase(request: NextRequest, response: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase middleware environment variables.");
  }

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

export async function proxy(request: NextRequest) {
  const proxyStartedAt = process.hrtime.bigint();
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/assets") ||
    pathname.match(/\.[a-z0-9]+$/i)
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const clientCreatedAt = process.hrtime.bigint();
  const supabase = createProxySupabase(request, response);
  const clientCreationMs = Number(process.hrtime.bigint() - clientCreatedAt) / 1_000_000;

  const getUserStartedAt = process.hrtime.bigint();
  const { data } = await supabase.auth.getUser();
  const getUserMs = Number(process.hrtime.bigint() - getUserStartedAt) / 1_000_000;
  const user = data.user;
  const postAuthStartedAt = process.hrtime.bigint();

  if (pathname === "/login") {
    if (user) {
      const responseAfterRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      if (isPerfLoggingEnabled()) {
        const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
        console.info(
          [
            "[PROXY_AUTH_PERF]",
            `client_creation_ms=${clientCreationMs.toFixed(1)}`,
            `get_user_ms=${getUserMs.toFixed(1)}`,
            `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
            `total_ms=${(Number(process.hrtime.bigint() - proxyStartedAt) / 1_000_000).toFixed(1)}`,
          ].join(" "),
        );
      }
      return responseAfterRedirect;
    }

    if (isPerfLoggingEnabled()) {
      const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
      console.info(
        [
          "[PROXY_AUTH_PERF]",
          `client_creation_ms=${clientCreationMs.toFixed(1)}`,
          `get_user_ms=${getUserMs.toFixed(1)}`,
          `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
          `total_ms=${(Number(process.hrtime.bigint() - proxyStartedAt) / 1_000_000).toFixed(1)}`,
        ].join(" "),
      );
    }
    return response;
  }

  if (pathname === "/auth/callback") {
    if (isPerfLoggingEnabled()) {
      const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
      console.info(
        [
          "[PROXY_AUTH_PERF]",
          `client_creation_ms=${clientCreationMs.toFixed(1)}`,
          `get_user_ms=${getUserMs.toFixed(1)}`,
          `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
          `total_ms=${(Number(process.hrtime.bigint() - proxyStartedAt) / 1_000_000).toFixed(1)}`,
        ].join(" "),
      );
    }
    return response;
  }

  if (!user) {
    const responseAfterRedirect = NextResponse.redirect(new URL("/login", request.url));
    if (isPerfLoggingEnabled()) {
      const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
      console.info(
        [
          "[PROXY_AUTH_PERF]",
          `client_creation_ms=${clientCreationMs.toFixed(1)}`,
          `get_user_ms=${getUserMs.toFixed(1)}`,
          `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
          `total_ms=${(Number(process.hrtime.bigint() - proxyStartedAt) / 1_000_000).toFixed(1)}`,
        ].join(" "),
      );
    }
    return responseAfterRedirect;
  }

  if (isPerfLoggingEnabled()) {
    const postAuthProcessingMs = Number(process.hrtime.bigint() - postAuthStartedAt) / 1_000_000;
    console.info(
      [
        "[PROXY_AUTH_PERF]",
        `client_creation_ms=${clientCreationMs.toFixed(1)}`,
        `get_user_ms=${getUserMs.toFixed(1)}`,
        `post_auth_processing_ms=${postAuthProcessingMs.toFixed(1)}`,
        `total_ms=${(Number(process.hrtime.bigint() - proxyStartedAt) / 1_000_000).toFixed(1)}`,
      ].join(" "),
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
