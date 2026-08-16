import { getCurrentBuilding } from "@/server/units";
import { getOwnerById } from "@/server/owners";
import { getOwnerUnitsForBillingMonth } from "@/server/ownerships";
import type { OwnerSummary } from "@/server/owners/types";
import { getOwnerDirectChargesForObligationMonth } from "@/server/charges";

import { composeMonthlyObligation } from "./core";
import { createMonthlyObligationProviders } from "./providers";
import { composeOwnerMonthlyObligation, type OwnerMonthlyObligationComposition } from "./owner-composition";
import type { MonthlyObligationResult } from "./types";

type QueryResult<T> = {
  data: T;
  error: string | null;
};

export type OwnerMonthlyObligationResult = {
  owner: OwnerSummary;
  obligation: MonthlyObligationResult;
  componentSummary: OwnerMonthlyObligationComposition["componentSummary"];
  ownerDirectCharges: OwnerMonthlyObligationComposition["ownerDirectCharges"];
  total: OwnerMonthlyObligationComposition["total"];
  readiness: OwnerMonthlyObligationComposition["readiness"];
  ownedUnitCount: number;
};

export async function getOwnerMonthlyObligationForBuilding({
  ownerId,
  obligationMonth,
  buildingId,
  buildingName,
}: {
  ownerId: string;
  obligationMonth: string;
  buildingId: string;
  buildingName: string;
}): Promise<QueryResult<OwnerMonthlyObligationResult | null>> {
  const ownerResult = await getOwnerById(ownerId);
  if (ownerResult.error) return { data: null, error: ownerResult.error };
  if (!ownerResult.data) return { data: null, error: "Owner not found." };

  const ownerUnitsResult = await getOwnerUnitsForBillingMonth(ownerId, obligationMonth);
  if (ownerUnitsResult.error) return { data: null, error: ownerUnitsResult.error };
  const units = ownerUnitsResult.data.map((unit) => ({
    unitId: unit.unit_id,
    unitNumber: unit.unit_number,
    unitAccountId: unit.unit_id,
    unitTypeCode: unit.unit_type_code,
    hasMeter: false,
    participationPercentage: null,
  }));

  const obligation = await composeMonthlyObligation(
    {
      obligationMonth,
      buildingId,
      buildingName,
    },
    units,
    createMonthlyObligationProviders(),
  );

  const ownerDirectChargesResult = await getOwnerDirectChargesForObligationMonth(ownerId, obligationMonth);
  if (ownerDirectChargesResult.error) return { data: null, error: ownerDirectChargesResult.error };

  const ownerDirectCharges = ownerDirectChargesResult.data
    ? {
        state: "available" as const,
        amount: ownerDirectChargesResult.data.amount,
        count: ownerDirectChargesResult.data.count,
        reason: null,
        lineItems: ownerDirectChargesResult.data.lineItems,
      }
    : {
        state: "blocked" as const,
        amount: null,
        count: 0,
        reason: "Owner-direct charges unavailable.",
        lineItems: [],
      };

  const ownerConsolidation = composeOwnerMonthlyObligation({
    ownerId: ownerResult.data.id,
    ownerReference: ownerResult.data.owner_reference,
    ownerName: ownerResult.data.full_name,
    obligationMonth,
    units: obligation.units,
    ownerDirectCharges,
  });

  return {
    data: {
      owner: ownerResult.data,
      obligation,
      componentSummary: ownerConsolidation.componentSummary,
      ownerDirectCharges: ownerConsolidation.ownerDirectCharges,
      total: ownerConsolidation.total,
      readiness: ownerConsolidation.readiness,
      ownedUnitCount: ownerUnitsResult.data.length,
    },
    error: null,
  };
}

export async function getOwnerMonthlyObligation({
  ownerId,
  obligationMonth,
}: {
  ownerId: string;
  obligationMonth: string;
}): Promise<QueryResult<OwnerMonthlyObligationResult | null>> {
  const buildingResult = await getCurrentBuilding();
  if (buildingResult.error) return { data: null, error: buildingResult.error };
  if (!buildingResult.data) return { data: null, error: "Current building not found." };

  return getOwnerMonthlyObligationForBuilding({
    ownerId,
    obligationMonth,
    buildingId: buildingResult.data.id,
    buildingName: buildingResult.data.name,
  });
}
