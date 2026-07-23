import { describe, expect, it } from "vitest";

import { allocate } from "../src/core/allocation";
import {
  OFFSEASON_SCENARIO,
  PEAK_SCENARIO,
  PPT_SCENARIO,
  SCENARIOS,
  getScenario,
  getScenarioSku,
  getScenarioSkuOptions,
} from "../src/core/scenarios";

describe("preset scenarios", () => {
  it("provides all three independent deterministic presets", () => {
    expect(SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "ppt",
      "peak",
      "offseason",
    ]);
    const clone = getScenario("ppt");
    clone.dealers[0].demand = 1;
    expect(PPT_SCENARIO.dealers[0].demand).toBe(100);
    clone.skus[0].dealers[0].demand = 2;
    expect(PPT_SCENARIO.skus[0].dealers[0].demand).toBe(100);
  });

  it("exposes multiple independent SKU datasets inside every scenario", () => {
    expect(SCENARIOS.every((scenario) => scenario.skus.length >= 3)).toBe(true);
    expect(getScenarioSkuOptions("ppt").map((item) => item.id)).toEqual([
      "WH-1000XM6",
      "A7M5",
      "PS5-PRO",
      "WF-C710N-LTD",
    ]);

    const headphones = getScenarioSku("ppt", "WH-1000XM6");
    const camera = getScenarioSku("ppt", "A7M5");
    expect(camera.params.supply).not.toBe(headphones.params.supply);
    expect(camera.dealers.length).not.toBe(headphones.dealers.length);
    expect(allocate(camera.dealers, camera.params).results).not.toEqual(
      allocate(headphones.dealers, headphones.params).results,
    );
  });

  it("keeps overlapping SKUs independent across business scenarios", () => {
    const pptPs5 = getScenarioSku("ppt", "PS5-PRO");
    const peakPs5 = getScenarioSku("peak", "PS5-PRO");
    const offseasonPs5 = getScenarioSku("offseason", "PS5-PRO");

    expect([pptPs5.params.supply, peakPs5.params.supply, offseasonPs5.params.supply]).toEqual([
      168,
      150,
      200,
    ]);
    expect(peakPs5.params.scarcity).toBeGreaterThan(pptPs5.params.scarcity);
    expect(offseasonPs5.params.scarcity).toBe(0);
  });

  it("keeps peak supply below 60% of demand and strengthens the fair layer", () => {
    const demand = PEAK_SCENARIO.dealers.reduce(
      (sum, dealer) => sum + dealer.demand,
      0,
    );
    const allocation = allocate(PEAK_SCENARIO.dealers, PEAK_SCENARIO.params);

    expect(PEAK_SCENARIO.params.supply / demand).toBeLessThan(0.6);
    expect(allocation.scarcityAdjustedFairRatio).toBeCloseTo(0.97);
    expect(allocation.effectiveFairRatio).toBeCloseTo(0.945);
    expect(allocation.results.find((row) => row.dealerId === "F")?.effAlloc).toBe(0);
  });

  it("uses the entire offseason supply in fair allocation and meets every demand", () => {
    const allocation = allocate(
      OFFSEASON_SCENARIO.dealers,
      OFFSEASON_SCENARIO.params,
    );

    expect(allocation.efficiencyPoolStart).toBe(0);
    expect(allocation.unallocatedSupply).toBe(0);
    expect(
      allocation.results.every((result) => result.finalAlloc === result.demand),
    ).toBe(true);
  });
});
