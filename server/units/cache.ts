type CachedUnitDirectory = {
  elapsedMs: number;
  data: Array<{
    id: string;
    unit_number: string;
    unit_type_code: string;
    current_owner_name: string | null;
    current_owner_reference: string | null;
    participation_percentage: number | null;
  }>;
};

const unitDirectoryCache = new Map<string, CachedUnitDirectory>();

export function getCachedUnitDirectory(buildingId: string) {
  return unitDirectoryCache.get(buildingId) ?? null;
}

export function setCachedUnitDirectory(
  buildingId: string,
  data: CachedUnitDirectory["data"],
  elapsedMs: number,
) {
  unitDirectoryCache.set(buildingId, { data, elapsedMs });
}

export function invalidateUnitDirectoryCache(buildingId?: string | null) {
  if (buildingId) {
    unitDirectoryCache.delete(buildingId);
    return;
  }

  unitDirectoryCache.clear();
}
