import type {
  DailyInventoryInput,
  InventoryCalibrationInput,
  InventoryCalibrationResult,
  InventoryDecision,
  InventoryHealthTag,
  InventoryInterval,
  InventoryIntervalInput,
  SellThroughEstimate,
  SellThroughInput,
} from "./types";

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * Inventory flow method from the proposal:
 * sell-through = beginning inventory + inbound allocation - ending inventory.
 * A negative flow is reported as an anomaly and conservatively clamped to zero.
 */
export function estimateSellThrough(input: SellThroughInput): SellThroughEstimate {
  assertFiniteNonNegative(input.beginningInventory, "input.beginningInventory");
  assertFiniteNonNegative(input.inboundAllocation, "input.inboundAllocation");
  assertFiniteNonNegative(input.endingInventory, "input.endingInventory");

  const rawFlowUnits = round(
    input.beginningInventory + input.inboundAllocation - input.endingInventory,
  );
  const estimatedSellThroughUnits = Math.max(0, rawFlowUnits);
  const sellThroughRate =
    input.beginningInventory === 0
      ? 0
      : estimatedSellThroughUnits / input.beginningInventory;

  return {
    estimatedSellThroughUnits: round(estimatedSellThroughUnits),
    sellThroughRate: round(sellThroughRate),
    rawFlowUnits,
    anomalous: rawFlowUnits < 0,
  };
}

/**
 * Dealer-side stock-flow conservation. Sony allocations are dealer inbound, so
 * they add to stock; estimated sell-through subtracts from it.
 */
export function estimateDailyInventory(input: DailyInventoryInput): number {
  assertFiniteNonNegative(input.lastTruthInventory, "input.lastTruthInventory");
  assertFiniteNonNegative(
    input.cumulativeInboundAllocation,
    "input.cumulativeInboundAllocation",
  );
  assertFiniteNonNegative(
    input.cumulativeEstimatedSellThrough,
    "input.cumulativeEstimatedSellThrough",
  );

  return round(
    Math.max(
      0,
      input.lastTruthInventory +
        input.cumulativeInboundAllocation -
        input.cumulativeEstimatedSellThrough,
    ),
  );
}

/**
 * Explicit uncertainty function used by the confidence fan:
 *
 * width(0) = 0 (fresh weekly truth)
 * width(d) = ceil(base + d * max(1, dailySellThrough * uncertaintyRate)), d > 0
 */
export function inventoryConfidenceInterval(
  input: InventoryIntervalInput,
): InventoryInterval {
  assertFiniteNonNegative(input.estimatedInventory, "input.estimatedInventory");
  assertFiniteNonNegative(input.daysSinceTruth, "input.daysSinceTruth");
  assertFiniteNonNegative(
    input.estimatedDailySellThrough,
    "input.estimatedDailySellThrough",
  );
  const baseUncertaintyUnits = input.baseUncertaintyUnits ?? 2;
  const dailyUncertaintyRate = input.dailyUncertaintyRate ?? 0.2;
  assertFiniteNonNegative(baseUncertaintyUnits, "input.baseUncertaintyUnits");
  assertFiniteNonNegative(dailyUncertaintyRate, "input.dailyUncertaintyRate");

  const daysSinceTruth = Math.floor(input.daysSinceTruth);
  const halfWidth =
    daysSinceTruth === 0
      ? 0
      : Math.ceil(
          baseUncertaintyUnits +
            daysSinceTruth *
              Math.max(
                1,
                input.estimatedDailySellThrough * dailyUncertaintyRate,
              ),
        );
  const confidence =
    daysSinceTruth <= 1 ? "high" : daysSinceTruth <= 3 ? "mid" : "low";

  return {
    estimate: round(input.estimatedInventory),
    lower: round(Math.max(0, input.estimatedInventory - halfWidth)),
    upper: round(input.estimatedInventory + halfWidth),
    halfWidth,
    daysSinceTruth,
    confidence,
  };
}

/** Replenishment is conservative at the upper bound; supply protection uses the lower bound. */
export function inventoryDecisionValue(
  interval: InventoryInterval,
  decision: InventoryDecision,
): number {
  return decision === "replenishment" ? interval.upper : interval.lower;
}

/**
 * Weekly truth calibration. Small errors adjust velocity in the direction that
 * explains the observed stock. Outliers are isolated as untrusted and do not
 * alter velocity in the current round.
 */
export function calibrateInventory(
  input: InventoryCalibrationInput,
): InventoryCalibrationResult {
  assertFiniteNonNegative(input.estimatedInventory, "input.estimatedInventory");
  assertFiniteNonNegative(input.truthInventory, "input.truthInventory");
  assertFiniteNonNegative(input.previousVelocity, "input.previousVelocity");
  assertFiniteNonNegative(input.thresholdUnits, "input.thresholdUnits");
  const horizonDays = input.horizonDays ?? 7;
  const learningRate = input.learningRate ?? 0.25;
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) {
    throw new RangeError("input.horizonDays must be a finite positive number");
  }
  if (!Number.isFinite(learningRate) || learningRate < 0 || learningRate > 1) {
    throw new RangeError("input.learningRate must be between 0 and 1");
  }

  const signedError = round(input.truthInventory - input.estimatedInventory);
  const absoluteError = Math.abs(signedError);
  if (absoluteError > input.thresholdUnits) {
    return {
      absoluteError,
      signedError,
      nextVelocity: input.previousVelocity,
      confidence: "untrusted",
      trusted: false,
      action: "MARK_UNTRUSTED",
      message: `真值偏差 ${absoluteError} 台超过阈值 ${input.thresholdUnits}，标记不可信；本轮只走公平层。`,
    };
  }

  // estimated > truth means actual sales were faster, therefore velocity rises.
  const velocityAdjustment =
    learningRate * (-signedError / horizonDays);
  const nextVelocity = round(Math.max(0, input.previousVelocity + velocityAdjustment));
  const errorRatio =
    input.thresholdUnits === 0 ? 0 : absoluteError / input.thresholdUnits;
  const confidence = errorRatio <= 0.35 ? "high" : errorRatio <= 0.7 ? "mid" : "low";

  return {
    absoluteError,
    signedError,
    nextVelocity,
    confidence,
    trusted: true,
    action: "MICRO_ADJUST",
    message: `偏差在阈值内，动销参数由 ${input.previousVelocity} 微调为 ${nextVelocity}。`,
  };
}

export interface InventoryHealthThresholds {
  stockoutRiskBelow?: number;
  overstockAbove?: number;
}

export interface InventoryHealthResult {
  ratio: number;
  tag: InventoryHealthTag;
}

export function classifyInventoryHealth(
  currentInventory: number,
  trailingThreeMonthAverageAllocation: number,
  thresholds: InventoryHealthThresholds = {},
): InventoryHealthResult {
  assertFiniteNonNegative(currentInventory, "currentInventory");
  assertFiniteNonNegative(
    trailingThreeMonthAverageAllocation,
    "trailingThreeMonthAverageAllocation",
  );
  const stockoutRiskBelow = thresholds.stockoutRiskBelow ?? 0.6;
  const overstockAbove = thresholds.overstockAbove ?? 1.4;
  assertFiniteNonNegative(stockoutRiskBelow, "thresholds.stockoutRiskBelow");
  assertFiniteNonNegative(overstockAbove, "thresholds.overstockAbove");
  if (stockoutRiskBelow >= overstockAbove) {
    throw new RangeError("stockoutRiskBelow must be less than overstockAbove");
  }

  const ratio =
    trailingThreeMonthAverageAllocation === 0
      ? currentInventory === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : currentInventory / trailingThreeMonthAverageAllocation;
  const tag =
    ratio < stockoutRiskBelow
      ? "stockout_risk"
      : ratio > overstockAbove
        ? "overstock"
        : "healthy";
  return { ratio: round(ratio), tag };
}

export interface WeeklyConfidencePoint extends InventoryInterval {
  day: number;
  inboundToDate: number;
}

export interface WeeklyConfidenceInput {
  truthInventory: number;
  dailyInboundAllocations: readonly number[];
  estimatedDailySellThrough: number;
  baseUncertaintyUnits?: number;
  dailyUncertaintyRate?: number;
}

export function buildWeeklyConfidenceSeries(
  input: WeeklyConfidenceInput,
): WeeklyConfidencePoint[] {
  assertFiniteNonNegative(input.truthInventory, "input.truthInventory");
  assertFiniteNonNegative(
    input.estimatedDailySellThrough,
    "input.estimatedDailySellThrough",
  );
  let inboundToDate = 0;

  return [0, ...input.dailyInboundAllocations].map((inbound, day) => {
    if (day > 0) {
      assertFiniteNonNegative(inbound, `input.dailyInboundAllocations[${day - 1}]`);
      inboundToDate += inbound;
    }
    const estimate = estimateDailyInventory({
      lastTruthInventory: input.truthInventory,
      cumulativeInboundAllocation: inboundToDate,
      cumulativeEstimatedSellThrough: input.estimatedDailySellThrough * day,
    });
    return {
      day,
      inboundToDate: round(inboundToDate),
      ...inventoryConfidenceInterval({
        estimatedInventory: estimate,
        daysSinceTruth: day,
        estimatedDailySellThrough: input.estimatedDailySellThrough,
        baseUncertaintyUnits: input.baseUncertaintyUnits,
        dailyUncertaintyRate: input.dailyUncertaintyRate,
      }),
    };
  });
}
