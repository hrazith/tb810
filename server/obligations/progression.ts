import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { ObligationPackageLifecycle } from "./package-selection";

export type GiulianaPackageProgression = {
  activePackage: ObligationPackageLifecycle;
  mostRecentHandoff: {
    obligationMonth: string;
    status: string;
  } | null;
};

export async function loadGiulianaPackageProgression({
  buildingId,
  startMonth,
  client,
}: {
  buildingId: string;
  startMonth: string;
  client?: SupabaseClient<Database>;
}): Promise<{ data: GiulianaPackageProgression | null; error: string | null; requestCount: number }> {
  const supabase = client ?? await createClient();
  const rpc = await (supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("tb810_get_giuliana_package_progression", {
    p_building_id: buildingId,
    p_start_year: Number(startMonth.slice(0, 4)),
    p_start_month: Number(startMonth.slice(5, 7)),
  });

  if (rpc.error) return { data: null, error: rpc.error.message, requestCount: 1 };
  if (!rpc.data) return { data: null, error: "Giuliana package progression unavailable.", requestCount: 1 };

  const payload = rpc.data as {
    activePackage?: { obligationMonth?: string; mode?: "live" | "snapshotted"; status?: string | null };
    mostRecentHandoff?: { obligationMonth?: string; status?: string } | null;
  };
  if (!payload.activePackage?.obligationMonth) {
    return { data: null, error: "Active Giuliana package unavailable.", requestCount: 1 };
  }

  return {
    data: {
      activePackage: {
        obligationMonth: payload.activePackage.obligationMonth,
        mode: payload.activePackage.mode === "snapshotted" ? "snapshotted" : "live",
        status: payload.activePackage.status ?? null,
      },
      mostRecentHandoff: payload.mostRecentHandoff?.obligationMonth && payload.mostRecentHandoff.status
        ? {
            obligationMonth: payload.mostRecentHandoff.obligationMonth,
            status: payload.mostRecentHandoff.status,
          }
        : null,
    },
    error: null,
    requestCount: 1,
  };
}
