import { describe, expect, it } from "vitest";

import {
  buildWeeklyConfidenceSeries,
  calibrateInventory,
  classifyInventoryHealth,
  estimateDailyInventory,
  estimateSellThrough,
  inventoryConfidenceInterval,
  inventoryDecisionValue,
} from "../src/core/inventory";

describe("inventory flow and confidence", () => {
  it("uses the proposal's stock-flow equation", () => {
    const result = estimateSellThrough({
      beginningInventory: 100,
      inboundAllocation: 30,
      endingInventory: 80,
    });

    expect(result).toEqual({
      estimatedSellThroughUnits: 50,
      sellThroughRate: 0.5,
      rawFlowUnits: 50,
      anomalous: false,
    });
  });

  it("treats Sony allocation as dealer inbound with a positive sign", () => {
    expect(
      estimateDailyInventory({
        lastTruthInventory: 100,
        cumulativeInboundAllocation: 25,
        cumulativeEstimatedSellThrough: 40,
      }),
    ).toBe(85);
  });

  it("widens the confidence fan with staleness and uses safe decision bounds", () => {
    const monday = inventoryConfidenceInterval({
      estimatedInventory: 40,
      daysSinceTruth: 0,
      estimatedDailySellThrough: 5,
    });
    const friday = inventoryConfidenceInterval({
      estimatedInventory: 32,
      daysSinceTruth: 4,
      estimatedDailySellThrough: 5,
    });

    expect(monday).toMatchObject({ lower: 40, upper: 40, halfWidth: 0 });
    expect(friday.halfWidth).toBeGreaterThan(monday.halfWidth);
    expect(friday.confidence).toBe("low");
    expect(inventoryDecisionValue(friday, "replenishment")).toBe(friday.upper);
    expect(inventoryDecisionValue(friday, "supply_protection")).toBe(friday.lower);
  });

  it("micro-adjusts plausible error and isolates an outlier as untrusted", () => {
    const fasterSales = calibrateInventory({
      estimatedInventory: 50,
      truthInventory: 44,
      previousVelocity: 1,
      thresholdUnits: 10,
      horizonDays: 7,
      learningRate: 0.35,
    });
    const outlier = calibrateInventory({
      estimatedInventory: 50,
      truthInventory: 20,
      previousVelocity: 1,
      thresholdUnits: 10,
    });

    expect(fasterSales.action).toBe("MICRO_ADJUST");
    expect(fasterSales.nextVelocity).toBeGreaterThan(1);
    expect(fasterSales.trusted).toBe(true);
    expect(outlier).toMatchObject({
      action: "MARK_UNTRUSTED",
      confidence: "untrusted",
      trusted: false,
      nextVelocity: 1,
    });
  });

  it("classifies dealer-side stock health from months-of-allocation", () => {
    expect(classifyInventoryHealth(50, 100).tag).toBe("stockout_risk");
    expect(classifyInventoryHealth(100, 100).tag).toBe("healthy");
    expect(classifyInventoryHealth(150, 100).tag).toBe("overstock");
  });

  it("builds a deterministic weekly fan from truth, known inbound and estimated sales", () => {
    const first = buildWeeklyConfidenceSeries({
      truthInventory: 60,
      dailyInboundAllocations: [5, 0, 8, 0, 4, 0],
      estimatedDailySellThrough: 4,
    });
    const second = buildWeeklyConfidenceSeries({
      truthInventory: 60,
      dailyInboundAllocations: [5, 0, 8, 0, 4, 0],
      estimatedDailySellThrough: 4,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(7);
    expect(first[0]).toMatchObject({ estimate: 60, lower: 60, upper: 60 });
    expect(first[6].halfWidth).toBeGreaterThan(first[1].halfWidth);
  });
});
