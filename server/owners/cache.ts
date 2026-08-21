type CachedOwnerDirectory = {
  elapsedMs: number;
  data: Array<{
    id: string;
    owner_reference: string;
    full_name: string;
    email: string | null;
    phone_number: string | null;
    notes: string | null;
    active: boolean;
    created_at: string;
    updated_at: string;
    unit_count: number;
  }>;
};

const ownerDirectoryCache = new Map<string, CachedOwnerDirectory>();

export function getCachedOwnerDirectory(buildingId: string) {
  return ownerDirectoryCache.get(buildingId) ?? null;
}

export function setCachedOwnerDirectory(
  buildingId: string,
  data: CachedOwnerDirectory["data"],
  elapsedMs: number,
) {
  ownerDirectoryCache.set(buildingId, { data, elapsedMs });
}

export function invalidateOwnerDirectoryCache(buildingId?: string | null) {
  if (buildingId) {
    ownerDirectoryCache.delete(buildingId);
    return;
  }

  ownerDirectoryCache.clear();
}
