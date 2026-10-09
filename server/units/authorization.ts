import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export { UNIT_AUTHORIZATION_ERROR, UNIT_REASON_REQUIRED_ERROR, userFacingUnitWriteError } from "./errors";

// The same units.manage permission the database enforces through RLS and
// tb810_update_unit. Hiding UI is convenience; the database is the authority.
export const canManageUnits = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_tb810_permission", { permission_key: "units.manage" });
  return !error && data === true;
});
