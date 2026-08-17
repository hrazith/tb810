export type MonthlyObligationComponentKey =
  | "fixed_assessment"
  | "metered_water"
  | "common_water"
  | "gas"
  | "other_charge";

export type MonthlyObligationComponentStatus =
  | "available"
  | "missing"
  | "blocked"
  | "not_applicable";

export type MonthlyObligationReadiness = "ready" | "in_progress" | "blocked";

export type MonthlyObligationComponent = {
  key: MonthlyObligationComponentKey;
  label: string;
  status: MonthlyObligationComponentStatus;
  amount: string | null;
  currency: string | null;
  sourceMonth: string | null;
  provenance: string | null;
  blocker: string | null;
  lineItems?: Array<{
    chargeId: string;
    description: string;
    amount: string;
    effectiveFromMonth: string;
    effectiveToMonth: string | null;
  }>;
};

export type UnitMonthlyObligation = {
  unitId: string;
  unitNumber: string;
  unitAccountId: string;
  unitTypeCode: string;
  components: MonthlyObligationComponent[];
  knownTotal: string;
  readiness: MonthlyObligationReadiness;
  missingComponents: MonthlyObligationComponentKey[];
  blockers: string[];
};

export type MonthlyObligationResult = {
  obligationMonth: string;
  buildingId: string;
  buildingName: string;
  units: UnitMonthlyObligation[];
  knownTotal: string;
  readiness: MonthlyObligationReadiness;
  missingComponents: MonthlyObligationComponentKey[];
  blockers: string[];
};

export type MonthlyObligationReadContext = {
  obligationMonth: string;
  buildingId: string;
  buildingName: string;
};

export type MonthlyObligationProviderResult =
  | {
      status: "available";
      amount: string;
      currency: string;
      sourceMonth: string | null;
      provenance: string;
      lineItems?: MonthlyObligationComponent["lineItems"];
    }
  | {
      status: "missing";
      blocker: string;
      sourceMonth?: string | null;
      provenance: string;
    }
  | {
      status: "blocked";
      blocker: string;
      sourceMonth?: string | null;
      provenance: string;
    }
  | {
      status: "not_applicable";
      blocker?: string;
      sourceMonth?: string | null;
      provenance: string;
    };

export type MonthlyObligationProvider = (args: {
  context: MonthlyObligationReadContext;
  unit: {
    unitId: string;
    unitNumber: string;
    unitAccountId: string;
    unitTypeCode: string;
    hasMeter: boolean;
    participationPercentage: number | null;
  };
}) => Promise<MonthlyObligationProviderResult>;
