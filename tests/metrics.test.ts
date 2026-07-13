import { describe, expect, it } from "vitest";

import { allocate } from "../src/core/allocation";
import {
  calculateAllocationMetrics,
  compareScenarios,
  generatePlanComparisons,
} from "../src/core/metrics";
import { PPT_SCENARIO } from "../src/core/scenarios";

describe("allocation metrics and plan rehearsal", () => {
  it("derives coverage, shortage, turnover and concentration from actual results", () => {
    const allocation = allocate(PPT_SCENARIO.dealers, PPT_SCENARIO.params);
    const metrics = calculateAllocationMetrics(PPT_SCENARIO.dealers, allocation);

    expect(metrics.coveredDealerCount).toBe(3);
    expect(metrics.totalAllocated).toBe(210);
    expect(metrics.overallSatisfactionRate).toBeCloseTo(202 / 240, 4);
    expect(metrics.expectedShortageRate).toBeCloseTo(38 / 240, 4);
    expect(metrics.turnoverIndex).toBeGreaterThan(0);
    expect(metrics.turnoverIndex).toBeLessThanOrEqual(1);
    expect(metrics.concentrationIndex).toBeGreaterThanOrEqual(1 / 3);
    expect(metrics.fairShareRatio).toBe(0.9429);
  });

  it("runs three plans synchronously and marks balanced as the recommendation", () => {
    const first = generatePlanComparisons(
      PPT_SCENARIO.dealers,
      PPT_SCENARIO.params,
    );
    const second = compareScenarios(PPT_SCENARIO.dealers, PPT_SCENARIO.params);

    expect(first).toEqual(second);
    expect(first.map((plan) => plan.id)).toEqual([
      "fair",
      "balanced",
      "efficiency",
    ]);
    expect(first.filter((plan) => plan.recommended).map((plan) => plan.id)).toEqual([
      "balanced",
    ]);
    expect(first.map((plan) => plan.params.fairBudgetRatio)).toEqual([0.9, 0.7, 0.5]);
    expect(first.every((plan) => plan.params.seasonFactor === PPT_SCENARIO.params.seasonFactor)).toBe(
      true,
    );
    expect(first.every((plan) => plan.allocation.invariants.creditCapsRespected)).toBe(
      true,
    );
  });
});
