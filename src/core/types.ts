export type InventoryConfidence = "high" | "mid" | "low" | "untrusted";

export type InventoryHealthTag = "healthy" | "overstock" | "stockout_risk";

/**
 * All quantities in the allocation engine are units, never currency.
 * `creditCapUnits` is the already-converted hard credit ceiling.
 */
export interface Dealer {
  id: string;
  name: string;
  demand: number;
  creditCapUnits: number;
  fulfillWeight: number;
  velocity: number;
  inventory: number;
  inventoryConfidence: InventoryConfidence;
  healthTag: InventoryHealthTag;
}

export interface AllocationParams {
  supply: number;
  fairBudgetRatio: number;
  seasonFactor: number;
  scarcity: number;
}

export type AllocationPhase = "precheck" | "fair" | "efficiency" | "finalize";

export type AllocationEvent =
  | "POOL_CREATED"
  | "ELIGIBLE"
  | "INELIGIBLE"
  | "PROPORTIONAL_FILL"
  | "TAIL_UNIT_ASSIGNED"
  | "DEMAND_CAP_REACHED"
  | "CREDIT_CAP_REACHED"
  | "EFFICIENCY_EXCLUDED"
  | "POOL_EXHAUSTED"
  | "UNALLOCATED"
  | "RESULT";

export interface AllocationStep {
  step: number;
  phase: AllocationPhase;
  event: AllocationEvent;
  dealerId?: string;
  deltaUnits: number;
  dealerPhaseTotal: number;
  dealerFinalTotal: number;
  poolRemaining: number;
  weight?: number;
  exactShare?: number;
  fractionalRemainder?: number;
  message: string;
  details?: Readonly<Record<string, string | number | boolean>>;
}

export interface AllocationResult {
  dealerId: string;
  fairAlloc: number;
  effAlloc: number;
  finalAlloc: number;
  demand: number;
  creditCapUnits: number;
  satisfactionRate: number;
  cappedByCredit: boolean;
  efficiencyEligible: boolean;
  trace: AllocationStep[];
  notes: string[];
}

export interface AllocationInvariants {
  withinSupply: boolean;
  supplyConservedWhenFeasible: boolean;
  creditCapsRespected: boolean;
  allInteger: boolean;
}

export interface AllocationSummary {
  results: AllocationResult[];
  trace: AllocationStep[];
  requestedSupply: number;
  totalAllocated: number;
  unallocatedSupply: number;
  scarcityAdjustedFairRatio: number;
  seasonFairAdjustment: number;
  effectiveFairRatio: number;
  fairPoolTarget: number;
  fairAllocated: number;
  efficiencyPoolStart: number;
  efficiencyAllocated: number;
  invariants: AllocationInvariants;
  roundingRule: string;
  scarcityFormula: string;
  fairWaterLevelFormula: string;
}

export type AllocationScenarioId = "ppt" | "peak" | "offseason";

/**
 * One scenario can contain multiple SKU datasets.  A profile is the complete
 * deterministic input snapshot for a SKU inside a business scenario; changing
 * it must therefore change supply, dealers, constraints and solver output.
 */
export interface ScenarioSkuProfile {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  story: string;
  params: AllocationParams;
  dealers: Dealer[];
}

export interface AllocationScenario {
  id: AllocationScenarioId;
  name: string;
  description: string;
  /** Default SKU id. Kept as `sku` for compatibility with the demo presets. */
  sku: string;
  /** Default SKU input snapshot. */
  params: AllocationParams;
  dealers: Dealer[];
  /** All selectable SKU datasets available under this scenario. */
  skus: ScenarioSkuProfile[];
  narrative: string[];
}

export type LockStatus =
  | "ALLOCATED"
  | "SOFT_LOCKED"
  | "CONFIRMED"
  | "WAIVED"
  | "RELEASED";

export type LockReleaseReason =
  | "NONE"
  | "CREDIT_PARTIAL"
  | "CREDIT_REJECTED"
  | "ACTIVE_WAIVER"
  | "PAYMENT_TIMEOUT";

export interface LockAuditEntry {
  sequence: number;
  at: number;
  event: LockEvent["type"] | "CREATED";
  from: LockStatus;
  to: LockStatus;
  units: number;
  releasedUnits: number;
  scoreDelta: number;
  message: string;
}

export interface LockOrder {
  id: string;
  dealerId: string;
  dealerName: string;
  sku: string;
  allocatedUnits: number;
  lockedUnits: number;
  releasedUnits: number;
  creditCapUnitsAtCheck: number;
  status: LockStatus;
  releaseReason: LockReleaseReason;
  softLockExpiresAt?: number;
  scoreDelta: number;
  auditTrail: LockAuditEntry[];
}

export type LockEvent =
  | {
      type: "REQUEST_LOCK";
      now: number;
      creditCapUnits: number;
      ttlMs?: number;
    }
  | { type: "CONFIRM_PAYMENT"; now: number }
  | { type: "WAIVE"; now: number }
  | { type: "TICK"; now: number };

export interface LockTransitionResult {
  order: LockOrder;
  accepted: boolean;
  releasedToSupply: number;
  message: string;
}

export interface SellThroughInput {
  beginningInventory: number;
  inboundAllocation: number;
  endingInventory: number;
}

export interface SellThroughEstimate {
  estimatedSellThroughUnits: number;
  sellThroughRate: number;
  rawFlowUnits: number;
  anomalous: boolean;
}

export interface DailyInventoryInput {
  lastTruthInventory: number;
  cumulativeInboundAllocation: number;
  cumulativeEstimatedSellThrough: number;
}

export type InventoryDecision = "replenishment" | "supply_protection";

export interface InventoryIntervalInput {
  estimatedInventory: number;
  daysSinceTruth: number;
  estimatedDailySellThrough: number;
  baseUncertaintyUnits?: number;
  dailyUncertaintyRate?: number;
}

export interface InventoryInterval {
  estimate: number;
  lower: number;
  upper: number;
  halfWidth: number;
  daysSinceTruth: number;
  confidence: Exclude<InventoryConfidence, "untrusted">;
}

export interface InventoryCalibrationInput {
  estimatedInventory: number;
  truthInventory: number;
  previousVelocity: number;
  thresholdUnits: number;
  horizonDays?: number;
  learningRate?: number;
}

export interface InventoryCalibrationResult {
  absoluteError: number;
  signedError: number;
  nextVelocity: number;
  confidence: InventoryConfidence;
  trusted: boolean;
  action: "MICRO_ADJUST" | "MARK_UNTRUSTED";
  message: string;
}

export interface AllocationMetrics {
  coveredDealerCount: number;
  totalAllocated: number;
  overallSatisfactionRate: number;
  expectedShortageRate: number;
  turnoverIndex: number;
  concentrationIndex: number;
  fairShareRatio: number;
  creditUtilizationRate: number;
}

export type AllocationPlanId = "fair" | "balanced" | "efficiency";

export interface AllocationPlanComparison {
  id: AllocationPlanId;
  name: string;
  recommended: boolean;
  conclusion: string;
  params: AllocationParams;
  allocation: AllocationSummary;
  metrics: AllocationMetrics;
}
