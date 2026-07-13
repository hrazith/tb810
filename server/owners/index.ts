import { createClient } from "@/lib/supabase/server";

import type {
  OwnerFilters,
  OwnerInput,
  OwnerRecord,
  OwnerSummary,
} from "./types";
import { ownerInputSchema } from "./validation";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

function normalizeStatusFilter(status?: OwnerFilters["status"]) {
  if (status === "archived" || status === "all") {
    return status;
  }

  return "active";
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function mapOwnerRow(row: {
  id: string;
  full_name: string;
  owner_reference: string;
  email: string | null;
  phone_number: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}): OwnerRecord {
  return row;
}

function selectOwnerFields() {
  return OWNER_SELECT;
}

const OWNER_SELECT =
  "id, owner_reference, full_name, email, phone_number, notes, active, created_at, updated_at" as const;

export async function listOwners(
  filters: OwnerFilters = {},
): Promise<QueryResult<OwnerSummary[]>> {
  const supabase = await createClient();
  const query = normalizeText(filters.query).toLowerCase();
  const status = normalizeStatusFilter(filters.status);

  let request = supabase
    .from("tb810_owners")
    .select(OWNER_SELECT)
    .order("full_name", { ascending: true });

  if (status === "active") {
    request = request.eq("active", true);
  } else if (status === "archived") {
    request = request.eq("active", false);
  }

  if (query) {
    request = request.or(
      `full_name.ilike.%${query}%,owner_reference.ilike.%${query}%,email.ilike.%${query}%,phone_number.ilike.%${query}%`,
    );
  }

  const { data: owners, error } = await request;
  if (error) {
    return { data: [], error: error.message };
  }

  const ownerIds = owners.map((owner) => owner.id);
  const unitCounts = new Map<string, number>();

  if (ownerIds.length > 0) {
    const { data: ownerships, error: ownershipError } = await supabase
      .from("tb810_ownerships")
      .select("owner_id")
      .in("owner_id", ownerIds);

    if (ownershipError) {
      return { data: [], error: ownershipError.message };
    }

    for (const ownership of ownerships ?? []) {
      unitCounts.set(
        ownership.owner_id,
        (unitCounts.get(ownership.owner_id) ?? 0) + 1,
      );
    }
  }

  return {
    data: owners.map((owner) => ({
      ...mapOwnerRow(owner),
      unit_count: unitCounts.get(owner.id) ?? 0,
    })),
    error: null,
  };
}

export async function getOwnerById(
  ownerId: string,
): Promise<QueryResult<OwnerSummary | null>> {
  const supabase = await createClient();

  const { data: owner, error } = await supabase
    .from("tb810_owners")
    .select(OWNER_SELECT)
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!owner) {
    return { data: null, error: null };
  }

  const { data: ownerships, error: ownershipError } = await supabase
    .from("tb810_ownerships")
    .select("owner_id")
    .eq("owner_id", owner.id);

  if (ownershipError) {
    return { data: null, error: ownershipError.message };
  }

  return {
    data: {
      ...owner,
      unit_count: ownerships?.length ?? 0,
    },
    error: null,
  };
}

export async function createOwner(
  input: OwnerInput,
): Promise<QueryResult<OwnerRecord>> {
  const supabase = await createClient();
  const parsed = ownerInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Invalid owner input",
    };
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("tb810_owners")
    .insert({
      full_name: payload.full_name,
      email: payload.email,
      phone_number: payload.phone_number,
      notes: payload.notes,
    })
    .select(OWNER_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function updateOwner(
  ownerId: string,
  input: OwnerInput,
): Promise<QueryResult<OwnerRecord>> {
  const supabase = await createClient();
  const parsed = ownerInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      data: null as never,
      error: parsed.error.issues[0]?.message ?? "Invalid owner input",
    };
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("tb810_owners")
    .update({
      full_name: payload.full_name,
      email: payload.email,
      phone_number: payload.phone_number,
      notes: payload.notes,
    })
    .eq("id", ownerId)
    .select(OWNER_SELECT)
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function archiveOwner(
  ownerId: string,
): Promise<QueryResult<OwnerRecord>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tb810_owners")
    .update({ active: false })
    .eq("id", ownerId)
    .select(selectOwnerFields())
    .single();

  if (error) {
    return { data: null as never, error: error.message };
  }

  return { data, error: null };
}

export async function getOwnerFormDefaults(
  ownerId?: string,
): Promise<OwnerInput | null> {
  if (!ownerId) {
    return null;
  }

  const result = await getOwnerById(ownerId);
  if (result.error || !result.data) {
    return null;
  }

  return {
    full_name: result.data.full_name,
    email: result.data.email,
    phone_number: result.data.phone_number,
    notes: result.data.notes,
  };
}
