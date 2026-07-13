import { allocate } from "./allocation";
import type {
  AllocationMetrics,
  AllocationParams,
  AllocationPlanComparison,
  AllocationPlanId,
  AllocationSummary,
  Dealer,
} from "./types";

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/** Metrics are derived only from a completed deterministic allocation. */
export function calculateAllocationMetrics(
  dealers: readonly Dealer[],
  allocation: AllocationSummary,
): AllocationMetrics {
  const dealersById = new Map(dealers.map((dealer) => [dealer.id, dealer]));
  const totalAllocated = allocation.results.reduce(
    (sum, result) => sum + result.finalAlloc,
    0,
  );
  const totalDemand = dealers.reduce(
    (sum, dealer) => sum + Math.max(0, dealer.demand),
    0,
  );
  const demandSatisfied = allocation.results.reduce((sum, result) => {
    const dealer = dealersById.get(result.dealerId);
    if (!dealer) {
      throw new Error(`allocation references unknown dealer: ${result.dealerId}`);
    }
    return sum + Math.min(result.finalAlloc, Math.max(0, dealer.demand));
  }, 0);
  const overallSatisfactionRate =
    totalDemand === 0 ? 1 : demandSatisfied / totalDemand;

  const maxVelocity = dealers.reduce(
    (maximum, dealer) => Math.max(maximum, Math.max(0, dealer.velocity)),
    0,
  );
  const velocityWeightedUnits = allocation.results.reduce((sum, result) => {
    const dealer = dealersById.get(result.dealerId);
    return sum + result.finalAlloc * Math.max(0, dealer?.velocity ?? 0);
  }, 0);
  const turnoverIndex =
    totalAllocated === 0 || maxVelocity === 0
      ? 0
      : velocityWeightedUnits / (totalAllocated * maxVelocity);

  const concentrationIndex =
    totalAllocated === 0
      ? 0
      : allocation.results.reduce(
          (sum, result) => sum + (result.finalAlloc / totalAllocated) ** 2,
          0,
        );
  const totalCreditCap = dealers.reduce(
    (sum, dealer) => sum + Math.max(0, Math.floor(dealer.creditCapUnits)),
    0,
  );

  return {
    coveredDealerCount: allocation.results.filter((result) => result.finalAlloc > 0)
      .length,
    totalAllocated,
    overallSatisfactionRate: round(overallSatisfactionRate),
    expectedShortageRate: round(Math.max(0, 1 - overallSatisfactionRate)),
    turnoverIndex: round(turnoverIndex),
    concentrationIndex: round(concentrationIndex),
    fairShareRatio: round(
      totalAllocated === 0 ? 0 : allocation.fairAllocated / totalAllocated,
    ),
    creditUtilizationRate: round(
      totalCreditCap === 0 ? 0 : totalAllocated / totalCreditCap,
    ),
  };
}

interface PlanDefinition {
  id: AllocationPlanId;
  name: string;
  fairBudgetRatio: number;
  recommended: boolean;
  conclusion: string;
}

const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    id: "fair",
    name: "方案 A · 偏公平",
    fairBudgetRatio: 0.9,
    recommended: false,
    conclusion: "中小经销商覆盖最全，头部满足率略降。",
  },
  {
    id: "balanced",
    name: "方案 C · 均衡",
    fairBudgetRatio: 0.7,
    recommended: true,
    conclusion: "公平与效率兼顾，综合指标最优。",
  },
  {
    id: "efficiency",
    name: "方案 B · 偏效率",
    fairBudgetRatio: 0.5,
    recommended: false,
    conclusion: "动销预期最高，但分货集中度上升。",
  },
];

/** Runs all three proposal plans synchronously using the same white-box engine. */
export function generatePlanComparisons(
  dealers: readonly Dealer[],
  baseParams: AllocationParams,
): AllocationPlanComparison[] {
  return PLAN_DEFINITIONS.map((definition) => {
    const params: AllocationParams = {
      ...baseParams,
      fairBudgetRatio: definition.fairBudgetRatio,
    };
    const allocation = allocate(dealers, params);
    return {
      id: definition.id,
      name: definition.name,
      recommended: definition.recommended,
      conclusion: definition.conclusion,
      params,
      allocation,
      metrics: calculateAllocationMetrics(dealers, allocation),
    };
  });
}

export function compareScenarios(
  dealers: readonly Dealer[],
  baseParams: AllocationParams,
): AllocationPlanComparison[] {
  return generatePlanComparisons(dealers, baseParams);
}
