import { describe, expect, it } from "vitest";

import {
  buildWeeklyConfidenceSeries,
  calibrateInventory,
  classifyInventoryHealth,
  computeTurnoverWeeks,
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

  it("uses SSP PSI sellout as the primary flat/peak turnover measure", () => {
    const history = [
      { week: 1, sellout: 10, isPeakSeason: false },
      { week: 2, sellout: 14, isPeakSeason: false },
      { week: 3, sellout: 24, isPeakSeason: true },
      { week: 4, sellout: 16, isPeakSeason: true },
    ];
    const flat = computeTurnoverWeeks({
      psiHistory12M: history,
      currentPsiInventory: 120,
      activeSeason: "flat",
    });
    const peak = computeTurnoverWeeks({
      psiHistory12M: history,
      currentPsiInventory: 120,
      activeSeason: "peak",
    });

    expect(flat).toMatchObject({
      avgWeeklySelloutFlat: 12,
      avgWeeklySelloutPeak: 20,
      selectedAverageWeeklySellout: 12,
      turnoverWeeks: 10,
    });
    expect(peak).toMatchObject({
      selectedAverageWeeklySellout: 20,
      turnoverWeeks: 6,
    });
    expect(flat.trace).toHaveLength(3);
  });

  it("reports uncomputable PSI turnover as null instead of zero or Infinity", () => {
    expect(
      computeTurnoverWeeks({
        psiHistory12M: [
          { week: 1, sellout: 0, isPeakSeason: false },
        ],
        currentPsiInventory: 30,
        activeSeason: "flat",
      }).turnoverWeeks,
    ).toBeNull();
    expect(
      computeTurnoverWeeks({
        psiHistory12M: [
          { week: 1, sellout: 8, isPeakSeason: false },
        ],
        currentPsiInventory: 30,
        activeSeason: "peak",
      }),
    ).toMatchObject({
      avgWeeklySelloutPeak: null,
      turnoverWeeks: null,
    });
    expect(
      computeTurnoverWeeks({
        psiHistory12M: [],
        currentPsiInventory: 0,
        activeSeason: "peak",
      }).turnoverWeeks,
    ).toBe(0);
  });

  it("keeps PSI calculation deterministic and validates weekly history", () => {
    const input = {
      psiHistory12M: [
        { week: 1, sellout: 10, isPeakSeason: false },
        { week: 2, sellout: 20, isPeakSeason: true },
      ],
      currentPsiInventory: 50,
      activeSeason: "flat" as const,
    };
    const before = JSON.parse(JSON.stringify(input));

    expect(computeTurnoverWeeks(input)).toEqual(computeTurnoverWeeks(input));
    expect(input).toEqual(before);
    expect(() =>
      computeTurnoverWeeks({
        ...input,
        psiHistory12M: [
          { week: 1, sellout: 10, isPeakSeason: false },
          { week: 1, sellout: 20, isPeakSeason: true },
        ],
      }),
    ).toThrow(/duplicate PSI week/);
    expect(() =>
      computeTurnoverWeeks({
        ...input,
        psiHistory12M: [
          { week: 1, sellout: -1, isPeakSeason: false },
        ],
      }),
    ).toThrow(/non-negative/);
  });
});
