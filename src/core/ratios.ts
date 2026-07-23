export interface PaPlanWeights {
  supplyDemand: number;
  operation: number;
  strategy: number;
}

export interface PaPlanRatioInput {
  supply: number;
  netDemand: number;
  scarcity: number;
  orders: number;
  inventory: number;
  /**
   * Available credit. When unitPrice is omitted this value is assumed to have
   * already been converted to allocation units.
   */
  creditBalance: number;
  unitPrice?: number;
  turnoverWeeks: number;
  wklyRatio: number;
  isBigCustomer: boolean;
  kBig: number;
  isDirectSales: boolean;
  bufferRatio: number;
  weights: PaPlanWeights;
}

export interface PaPlanRatioResult {
  ratio: number;
  breakdown: {
    supplyDemand: number;
    operation: number;
    strategy: number;
  };
  trace: string[];
}

export interface WklyRatioResult {
  /** null means that the large-customer exemption removes this hard ceiling. */
  weeklyCap: number | null;
  planningReference: number;
  exempted: boolean;
  note: string;
}

export interface WeeklyAllocationInput {
  requestedUnits: number;
  creditCapUnits: number;
  monthlyTarget: number;
  wklyRatio: number;
  isBigCustomer: boolean;
  kBig: number;
}

export interface WeeklyAllocationResolution {
  requestedUnits: number;
  allocatedUnits: number;
  weeklyCap: number | null;
  planningReference: number;
  effectiveCap: number;
  exempted: boolean;
  cappedByWeekly: boolean;
  cappedByCredit: boolean;
  note: string;
}

export interface ChannelSequenceInput {
  supply: number;
  directDemand: number;
  bufferRatio: number;
}

export interface ChannelSequenceResult {
  supply: number;
  directAllocated: number;
  bufferReserved: number;
  otherChannelsPool: number;
  totalAccounted: number;
  trace: string[];
}

export const REFERENCE_TURNOVER_WEEKS = 4;

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function assertRatio(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1`);
  }
}

function toUnits(value: number, field: string): number {
  assertFiniteNonNegative(value, field);
  return Math.floor(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Transparent demo formula for the three RFP dimensions. The RFP specifies the
 * factors but not their mathematical normalization, so every transformation is
 * deliberately exposed in trace rather than presented as a hidden model.
 */
export function computePaPlanRatio(
  input: PaPlanRatioInput,
): PaPlanRatioResult {
  assertFiniteNonNegative(input.supply, "input.supply");
  assertFiniteNonNegative(input.netDemand, "input.netDemand");
  assertRatio(input.scarcity, "input.scarcity");
  assertFiniteNonNegative(input.orders, "input.orders");
  assertFiniteNonNegative(input.inventory, "input.inventory");
  assertFiniteNonNegative(input.creditBalance, "input.creditBalance");
  assertFiniteNonNegative(input.turnoverWeeks, "input.turnoverWeeks");
  assertRatio(input.wklyRatio, "input.wklyRatio");
  assertFiniteNonNegative(input.kBig, "input.kBig");
  if (input.isBigCustomer && input.kBig < 1) {
    throw new RangeError("input.kBig must be at least 1 for a big customer");
  }
  assertRatio(input.bufferRatio, "input.bufferRatio");
  if (input.unitPrice !== undefined) {
    if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) {
      throw new RangeError("input.unitPrice must be a finite positive number");
    }
  }

  const rawWeights = input.weights;
  for (const [key, value] of Object.entries(rawWeights)) {
    assertFiniteNonNegative(value, `input.weights.${key}`);
  }
  const weightTotal =
    rawWeights.supplyDemand + rawWeights.operation + rawWeights.strategy;
  if (weightTotal <= 0) {
    throw new RangeError("at least one PA Plan Ratio weight must be positive");
  }
  const weights: PaPlanWeights = {
    supplyDemand: rawWeights.supplyDemand / weightTotal,
    operation: rawWeights.operation / weightTotal,
    strategy: rawWeights.strategy / weightTotal,
  };

  const coverage =
    input.netDemand === 0 ? 1 : clamp01(input.supply / input.netDemand);
  const tightness = 1 - coverage;
  const supplyDemand = (tightness + input.scarcity) / 2;

  const creditCapUnits =
    input.unitPrice === undefined
      ? input.creditBalance
      : Math.floor(input.creditBalance / input.unitPrice);
  const orderPressure =
    input.netDemand === 0 ? 0 : clamp01(input.orders / input.netDemand);
  const inventoryNeed =
    input.netDemand === 0 ? 0 : 1 - clamp01(input.inventory / input.netDemand);
  const creditCoverage =
    input.netDemand === 0 ? 1 : clamp01(creditCapUnits / input.netDemand);
  const turnoverSpeed =
    1 / (1 + input.turnoverWeeks / REFERENCE_TURNOVER_WEEKS);
  const operation =
    (orderPressure + inventoryNeed + creditCoverage + turnoverSpeed) / 4;

  const bigCustomerMultiplier = input.isBigCustomer ? input.kBig : 1;
  const directSalesMultiplier = input.isDirectSales
    ? 1 + input.bufferRatio
    : 1;
  // Strategy is a relative allocation weight, not a probability, so it may
  // legitimately exceed 1 before sibling ratios are normalized.
  const strategy =
    input.wklyRatio * bigCustomerMultiplier * directSalesMultiplier;

  const ratio =
    supplyDemand * weights.supplyDemand +
    operation * weights.operation +
    strategy * weights.strategy;
  const roundedBreakdown = {
    supplyDemand: round(supplyDemand),
    operation: round(operation),
    strategy: round(strategy),
  };

  return {
    ratio: round(ratio),
    breakdown: roundedBreakdown,
    trace: [
      `供需态势：覆盖率 ${round(coverage)}，紧张度 ${round(
        tightness,
      )}，与 scarcity ${round(input.scarcity)} 等权合成为 ${roundedBreakdown.supplyDemand}。`,
      `经营状态：订单压力 ${round(orderPressure)}、库存需求 ${round(
        inventoryNeed,
      )}、额度覆盖 ${round(creditCoverage)}、周转速度 ${round(
        turnoverSpeed,
      )}，等权合成为 ${roundedBreakdown.operation}。`,
      `策略配置：Wkly Ratio ${round(
        input.wklyRatio,
      )} × 大客户系数 ${round(
        bigCustomerMultiplier,
      )} × 直营/Buffer 系数 ${round(
        directSalesMultiplier,
      )} = ${roundedBreakdown.strategy}。`,
      `三维权重正规化为 ${round(weights.supplyDemand)} / ${round(
        weights.operation,
      )} / ${round(weights.strategy)}，PA Plan Ratio = ${round(ratio)}。`,
    ],
  };
}

export function applyWklyRatio(
  monthlyTarget: number,
  wklyRatio: number,
  isBigCustomer: boolean,
  kBig: number,
): WklyRatioResult {
  const targetUnits = toUnits(monthlyTarget, "monthlyTarget");
  assertRatio(wklyRatio, "wklyRatio");
  assertFiniteNonNegative(kBig, "kBig");
  if (isBigCustomer && kBig < 1) {
    throw new RangeError("kBig must be at least 1 for a big customer");
  }

  const baseWeeklyUnits = Math.floor(targetUnits * wklyRatio);
  if (isBigCustomer) {
    const planningReference = Math.floor(baseWeeklyUnits * kBig);
    return {
      weeklyCap: null,
      planningReference,
      exempted: true,
      note: `大客户豁免 Wkly Ratio 硬上限；${planningReference} 台仅作 k_big 加权后的计划参考，仍受资金额度约束。`,
    };
  }

  return {
    weeklyCap: baseWeeklyUnits,
    planningReference: baseWeeklyUnits,
    exempted: false,
    note: `月度目标 ${targetUnits} × Wkly Ratio ${round(
      wklyRatio,
    )}，本周硬上限 ${baseWeeklyUnits} 台。`,
  };
}

/**
 * Resolves weekly and credit constraints without conflating them. In
 * particular, a big customer removes only the weekly cap; it can never bypass
 * the credit ceiling.
 */
export function resolveWeeklyAllocation(
  input: WeeklyAllocationInput,
): WeeklyAllocationResolution {
  const requestedUnits = toUnits(input.requestedUnits, "input.requestedUnits");
  const creditCapUnits = toUnits(
    input.creditCapUnits,
    "input.creditCapUnits",
  );
  const weekly = applyWklyRatio(
    input.monthlyTarget,
    input.wklyRatio,
    input.isBigCustomer,
    input.kBig,
  );
  const weeklyLimit = weekly.weeklyCap ?? Number.POSITIVE_INFINITY;
  const effectiveCap = Math.min(creditCapUnits, weeklyLimit);
  const allocatedUnits = Math.min(requestedUnits, effectiveCap);
  const cappedByCredit =
    requestedUnits > creditCapUnits && creditCapUnits <= weeklyLimit;
  const cappedByWeekly =
    weekly.weeklyCap !== null &&
    requestedUnits > weekly.weeklyCap &&
    weekly.weeklyCap <= creditCapUnits;

  return {
    requestedUnits,
    allocatedUnits,
    weeklyCap: weekly.weeklyCap,
    planningReference: weekly.planningReference,
    effectiveCap,
    exempted: weekly.exempted,
    cappedByWeekly,
    cappedByCredit,
    note:
      allocatedUnits === requestedUnits
        ? `${weekly.note} 请求量通过全部硬约束。`
        : `${weekly.note} 请求 ${requestedUnits} 台，按有效硬上限收口至 ${allocatedUnits} 台。`,
  };
}

/** Direct sales is calculated first, then Buffer is reserved from the balance. */
export function allocateChannelSequence(
  input: ChannelSequenceInput,
): ChannelSequenceResult {
  const supply = toUnits(input.supply, "input.supply");
  const directDemand = toUnits(input.directDemand, "input.directDemand");
  assertRatio(input.bufferRatio, "input.bufferRatio");

  const directAllocated = Math.min(supply, directDemand);
  const afterDirect = supply - directAllocated;
  const bufferReserved = Math.floor(afterDirect * input.bufferRatio);
  const otherChannelsPool = afterDirect - bufferReserved;
  const totalAccounted =
    directAllocated + bufferReserved + otherChannelsPool;

  return {
    supply,
    directAllocated,
    bufferReserved,
    otherChannelsPool,
    totalAccounted,
    trace: [
      `第一步：直营优先，需求 ${directDemand} 台，先分 ${directAllocated} 台。`,
      `第二步：直营后余量 ${afterDirect} 台，按 Buffer ${round(
        input.bufferRatio,
      )} 预留 ${bufferReserved} 台。`,
      `第三步：其余渠道可分池 = ${afterDirect} − ${bufferReserved} = ${otherChannelsPool} 台。`,
    ],
  };
}
