import type { BuildingMonthFinancialFacts } from "./owner-facts";

type CachedBuildingMonthFinancialFacts = {
  elapsedMs: number;
  data: BuildingMonthFinancialFacts;
};

const buildingMonthFinancialFactsCache = new Map<string, CachedBuildingMonthFinancialFacts>();

function cacheKey(buildingId: string, obligationMonth: string) {
  return `${buildingId}:${obligationMonth}`;
}

export function getCachedBuildingMonthFinancialFacts(
  buildingId: string,
  obligationMonth: string,
) {
  return buildingMonthFinancialFactsCache.get(cacheKey(buildingId, obligationMonth)) ?? null;
}

export function setCachedBuildingMonthFinancialFacts(
  buildingId: string,
  obligationMonth: string,
  data: BuildingMonthFinancialFacts,
  elapsedMs: number,
) {
  buildingMonthFinancialFactsCache.set(cacheKey(buildingId, obligationMonth), {
    data,
    elapsedMs,
  });
}

export function invalidateBuildingMonthFinancialFactsCache(
  buildingId?: string | null,
  obligationMonth?: string | null,
) {
  if (!buildingId) {
    buildingMonthFinancialFactsCache.clear();
    return;
  }

  if (obligationMonth) {
    buildingMonthFinancialFactsCache.delete(cacheKey(buildingId, obligationMonth));
    return;
  }

  for (const key of buildingMonthFinancialFactsCache.keys()) {
    if (key.startsWith(`${buildingId}:`)) {
      buildingMonthFinancialFactsCache.delete(key);
    }
  }
}
