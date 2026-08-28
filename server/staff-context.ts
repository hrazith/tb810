import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

type StaffProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  job_title: string | null;
  status: string;
};

type StaffRoleRow = {
  role: {
    key: string;
  } | null;
};

export type StaffContext = {
  user: {
    id: string;
    email: string | null;
  };
  staffProfile: StaffProfileRow;
  roleKeys: string[];
  primaryRoleKey: string | null;
};

const ROLE_PRIORITY = ["super_admin", "building_manager", "reconciliation_specialist", "building_staff", "viewer"] as const;

function pickPrimaryRole(roleKeys: string[]) {
  for (const roleKey of ROLE_PRIORITY) {
    if (roleKeys.includes(roleKey)) {
      return roleKey;
    }
  }

  return roleKeys[0] ?? null;
}

export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  const user = authData.user;
  if (!user) {
    return null;
  }

  const { data: staffProfile, error: profileError } = await supabase
    .from("tb810_staff_profiles")
    .select("id,user_id,display_name,job_title,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!staffProfile) {
    return null;
  }

  const { data: staffRoles, error: rolesError } = await supabase
    .from("tb810_staff_roles")
    .select("role:tb810_roles!inner(key)")
    .eq("staff_profile_id", staffProfile.id);

  if (rolesError) {
    throw rolesError;
  }

  const roleKeys = ((staffRoles ?? []) as StaffRoleRow[])
    .map((row) => row.role?.key ?? null)
    .filter((key): key is string => Boolean(key));

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    staffProfile,
    roleKeys,
    primaryRoleKey: pickPrimaryRole(roleKeys),
  };
});
