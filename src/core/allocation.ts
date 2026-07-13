import type {
  AllocationEvent,
  AllocationParams,
  AllocationPhase,
  AllocationStep,
  AllocationSummary,
  Dealer,
  InventoryHealthTag,
} from "./types";

const EPSILON = 1e-9;

export const SCARCITY_FORMULA =
  "scarcityAdjustedFairRatio = fairBudgetRatio + scarcity × (1 − fairBudgetRatio)";

export const SEASON_FAIR_FORMULA =
  "effectiveFairRatio = clamp(scarcityAdjustedFairRatio + clamp((1 − seasonFactor) × 0.1, −0.1, 0.1), 0, 1)";

export const HEALTH_EFFICIENCY_MULTIPLIER: Readonly<
  Record<InventoryHealthTag, number>
> = {
  stockout_risk: 1.2,
  healthy: 1,
  overstock: 0.65,
};

export const INTEGER_ROUNDING_RULE =
  "池量按四舍五入取整；比例份额先向下取整，尾差按小数余数从大到小分配，余数相同则经销商 ID 升序优先。";

export const FAIR_WATER_LEVEL_FORMULA =
  "fairAlloc_i(λ) = min(demand_i, creditCapUnits_i, λ × demand_i × fulfillWeight_i)";

interface NormalizedDealer extends Dealer {
  demand: number;
  creditCapUnits: number;
  inventory: number;
}

interface FillCandidate {
  dealerId: string;
  weight: number;
  capacity: number;
  capEvent: "DEMAND_CAP_REACHED" | "CREDIT_CAP_REACHED";
}

interface FillContext {
  phase: Extract<AllocationPhase, "fair" | "efficiency">;
  pool: number;
  candidates: FillCandidate[];
  baseAllocations: ReadonlyMap<string, number>;
  pushTrace: (step: Omit<AllocationStep, "step">) => AllocationStep;
}

interface FillOutput {
  allocations: Map<string, number>;
  allocated: number;
  remaining: number;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function toUnits(value: number, field: string): number {
  assertFiniteNonNegative(value, field);
  return Math.floor(value);
}

function clamp01(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be finite`);
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeDealers(dealers: readonly Dealer[]): NormalizedDealer[] {
  const seen = new Set<string>();

  return dealers.map((dealer, index) => {
    const prefix = `dealers[${index}]`;
    const id = dealer.id.trim();
    if (!id) {
      throw new Error(`${prefix}.id must not be empty`);
    }
    if (seen.has(id)) {
      throw new Error(`duplicate dealer id: ${id}`);
    }
    seen.add(id);

    assertFiniteNonNegative(dealer.fulfillWeight, `${prefix}.fulfillWeight`);
    assertFiniteNonNegative(dealer.velocity, `${prefix}.velocity`);

    return {
      ...dealer,
      id,
      demand: toUnits(dealer.demand, `${prefix}.demand`),
      creditCapUnits: toUnits(dealer.creditCapUnits, `${prefix}.creditCapUnits`),
      inventory: toUnits(dealer.inventory, `${prefix}.inventory`),
    };
  });
}

function normalizedParams(params: AllocationParams): AllocationParams {
  assertFiniteNonNegative(params.seasonFactor, "params.seasonFactor");
  return {
    supply: toUnits(params.supply, "params.supply"),
    fairBudgetRatio: clamp01(params.fairBudgetRatio, "params.fairBudgetRatio"),
    seasonFactor: params.seasonFactor,
    scarcity: clamp01(params.scarcity, "params.scarcity"),
  };
}

function floorShare(value: number): number {
  return Math.floor(value + EPSILON);
}

function capMessage(
  phase: Extract<AllocationPhase, "fair" | "efficiency">,
  event: FillCandidate["capEvent"],
): string {
  if (event === "CREDIT_CAP_REACHED") {
    return phase === "fair"
      ? "触达额度折算数量上限，封顶出局；未用池量回流给其他经销商。"
      : "效率层触达额度折算数量上限，封顶后余量继续回流。";
  }
  return "公平层达到需求上限，本层封顶；仍可在效率层获得加配。";
}

/**
 * Integer capped weighted fill. A round first assigns each active dealer the
 * floor of its exact weighted share. Caps are removed and their overflow is
 * reflowed. If no cap is hit, tail units follow largest remainder with a
 * dealer-id tie break. This makes conservation and replay deterministic.
 */
function cappedWeightedFill(context: FillContext): FillOutput {
  const { phase, candidates, baseAllocations, pushTrace } = context;
  const allocations = new Map<string, number>(
    candidates.map((candidate) => [candidate.dealerId, 0]),
  );
  let remaining = context.pool;

  while (remaining > 0) {
    const active = candidates
      .filter(
        (candidate) =>
          candidate.weight > 0 &&
          (allocations.get(candidate.dealerId) ?? 0) < candidate.capacity,
      )
      .sort((left, right) => left.dealerId.localeCompare(right.dealerId));

    if (active.length === 0) {
      break;
    }

    const totalWeight = active.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (totalWeight <= 0) {
      break;
    }

    const roundPool = remaining;
    const shares = active.map((candidate) => {
      const exactShare = (roundPool * candidate.weight) / totalWeight;
      const floored = floorShare(exactShare);
      return {
        candidate,
        exactShare,
        floored,
        fractionalRemainder: Math.max(0, exactShare - floored),
      };
    });

    // If the projected share crosses one or more caps, resolve the earliest
    // normalized water level first. This preserves the actual cap chronology
    // (e.g. PPT dealer B reaches its credit ceiling before A reaches demand).
    const earliestCap = shares
      .filter((share) => {
        const current = allocations.get(share.candidate.dealerId) ?? 0;
        const capacityLeft = share.candidate.capacity - current;
        return share.exactShare >= capacityLeft - EPSILON;
      })
      .sort((left, right) => {
        const leftCurrent = allocations.get(left.candidate.dealerId) ?? 0;
        const rightCurrent = allocations.get(right.candidate.dealerId) ?? 0;
        const leftLevel =
          (left.candidate.capacity - leftCurrent) / left.candidate.weight;
        const rightLevel =
          (right.candidate.capacity - rightCurrent) / right.candidate.weight;
        if (Math.abs(leftLevel - rightLevel) > EPSILON) {
          return leftLevel - rightLevel;
        }
        return left.candidate.dealerId.localeCompare(right.candidate.dealerId);
      })[0];

    if (earliestCap) {
      const capCurrent = allocations.get(earliestCap.candidate.dealerId) ?? 0;
      const capWaterLevel =
        (earliestCap.candidate.capacity - capCurrent) /
        earliestCap.candidate.weight;

      // Every active channel rises through the same water-level increment.
      // Recording only the capped dealer would make the animation show B
      // filling alone, which is not the state the solver actually traverses.
      const levelShares = active.map((candidate) => {
        const current = allocations.get(candidate.dealerId) ?? 0;
        const capacityLeft = candidate.capacity - current;
        const exactDelta = Math.min(
          capacityLeft,
          capWaterLevel * candidate.weight,
        );
        const delta = Math.min(capacityLeft, floorShare(exactDelta));
        return {
          candidate,
          current,
          capacityLeft,
          exactDelta,
          delta,
          fractionalRemainder: Math.max(0, exactDelta - delta),
        };
      });

      const trancheTarget = Math.min(
        remaining,
        Math.floor(
          levelShares.reduce((sum, share) => sum + share.exactDelta, 0) + 0.5,
        ),
      );
      let trancheAssigned = levelShares.reduce(
        (sum, share) => sum + share.delta,
        0,
      );
      let trancheTail = Math.max(0, trancheTarget - trancheAssigned);

      for (const share of [...levelShares].sort((left, right) => {
        const remainderDifference =
          right.fractionalRemainder - left.fractionalRemainder;
        if (Math.abs(remainderDifference) > EPSILON) {
          return remainderDifference;
        }
        return left.candidate.dealerId.localeCompare(right.candidate.dealerId);
      })) {
        if (trancheTail <= 0) break;
        if (share.delta >= share.capacityLeft) continue;
        share.delta += 1;
        trancheTail -= 1;
        trancheAssigned += 1;
      }

      for (const share of levelShares.sort((left, right) =>
        left.candidate.dealerId.localeCompare(right.candidate.dealerId),
      )) {
        if (share.delta <= 0) continue;
        const next = share.current + share.delta;
        allocations.set(share.candidate.dealerId, next);
        remaining -= share.delta;
        const base = baseAllocations.get(share.candidate.dealerId) ?? 0;

        pushTrace({
          phase,
          event: "PROPORTIONAL_FILL",
          dealerId: share.candidate.dealerId,
          deltaUnits: share.delta,
          dealerPhaseTotal: next,
          dealerFinalTotal: base + next,
          poolRemaining: remaining,
          weight: share.candidate.weight,
          exactShare: share.exactDelta,
          fractionalRemainder: share.fractionalRemainder,
          message: `${phase === "fair" ? "公平满足率水位" : "效率水位"}同步上升至下一封顶点，注入 ${share.delta} 台。`,
          details: {
            roundPool,
            totalWeight,
            capWaterLevel,
            trancheTarget,
            trancheAssigned,
            capDealerId: earliestCap.candidate.dealerId,
            capacity: share.candidate.capacity,
          },
        });
      }

      const capNext =
        allocations.get(earliestCap.candidate.dealerId) ?? capCurrent;
      const capBase =
        baseAllocations.get(earliestCap.candidate.dealerId) ?? 0;
      pushTrace({
        phase,
        event: earliestCap.candidate.capEvent,
        dealerId: earliestCap.candidate.dealerId,
        deltaUnits: 0,
        dealerPhaseTotal: capNext,
        dealerFinalTotal: capBase + capNext,
        poolRemaining: remaining,
        weight: earliestCap.candidate.weight,
        message: capMessage(phase, earliestCap.candidate.capEvent),
        details: {
          capUnits: earliestCap.candidate.capacity,
          capWaterLevel,
        },
      });
      continue;
    }

    for (const share of shares) {
      if (remaining <= 0) {
        break;
      }

      const current = allocations.get(share.candidate.dealerId) ?? 0;
      const capacityLeft = share.candidate.capacity - current;
      const delta = Math.min(capacityLeft, share.floored, remaining);
      if (delta <= 0) {
        continue;
      }

      const next = current + delta;
      allocations.set(share.candidate.dealerId, next);
      remaining -= delta;
      const base = baseAllocations.get(share.candidate.dealerId) ?? 0;

      pushTrace({
        phase,
        event: "PROPORTIONAL_FILL",
        dealerId: share.candidate.dealerId,
        deltaUnits: delta,
        dealerPhaseTotal: next,
        dealerFinalTotal: base + next,
        poolRemaining: remaining,
        weight: share.candidate.weight,
        exactShare: share.exactShare,
        fractionalRemainder: share.fractionalRemainder,
        message: `${phase === "fair" ? "公平" : "效率"}层按权重比例注入 ${delta} 台。`,
        details: {
          roundPool,
          totalWeight,
          capacity: share.candidate.capacity,
        },
      });

      if (next >= share.candidate.capacity) {
        pushTrace({
          phase,
          event: share.candidate.capEvent,
          dealerId: share.candidate.dealerId,
          deltaUnits: 0,
          dealerPhaseTotal: next,
          dealerFinalTotal: base + next,
          poolRemaining: remaining,
          weight: share.candidate.weight,
          message: capMessage(phase, share.candidate.capEvent),
          details: { capUnits: share.candidate.capacity },
        });
      }
    }

    if (remaining > 0) {
      const tailOrder = [...shares].sort((left, right) => {
        const remainderDifference =
          right.fractionalRemainder - left.fractionalRemainder;
        if (Math.abs(remainderDifference) > EPSILON) {
          return remainderDifference;
        }
        return left.candidate.dealerId.localeCompare(right.candidate.dealerId);
      });

      let assignedInTail = 0;
      for (const share of tailOrder) {
        if (remaining <= 0) {
          break;
        }
        const current = allocations.get(share.candidate.dealerId) ?? 0;
        if (current >= share.candidate.capacity) {
          continue;
        }

        const next = current + 1;
        allocations.set(share.candidate.dealerId, next);
        remaining -= 1;
        assignedInTail += 1;
        const base = baseAllocations.get(share.candidate.dealerId) ?? 0;

        pushTrace({
          phase,
          event: "TAIL_UNIT_ASSIGNED",
          dealerId: share.candidate.dealerId,
          deltaUnits: 1,
          dealerPhaseTotal: next,
          dealerFinalTotal: base + next,
          poolRemaining: remaining,
          weight: share.candidate.weight,
          exactShare: share.exactShare,
          fractionalRemainder: share.fractionalRemainder,
          message: "整数尾差按最大余数分配；余数相同则经销商 ID 升序优先。",
          details: { tieBreak: "fractionalRemainder desc, dealerId asc" },
        });

        if (next >= share.candidate.capacity) {
          pushTrace({
            phase,
            event: share.candidate.capEvent,
            dealerId: share.candidate.dealerId,
            deltaUnits: 0,
            dealerPhaseTotal: next,
            dealerFinalTotal: base + next,
            poolRemaining: remaining,
            weight: share.candidate.weight,
            message: capMessage(phase, share.candidate.capEvent),
            details: { capUnits: share.candidate.capacity },
          });
        }
      }

      if (assignedInTail === 0) {
        break;
      }
    }
  }

  return {
    allocations,
    allocated: context.pool - remaining,
    remaining,
  };
}

/**
 * Deterministic two-layer allocation engine.
 *
 * - scarcity formula: beta + scarcity * (1 - beta)
 * - season > 1 moves up to 10 percentage points toward efficiency; season < 1
 *   moves up to 10 points toward fair supply protection
 * - fair layer: weighted satisfaction water level, where the effective weight
 *   is demand * fulfillWeight and the cap is min(demand, creditCapUnits)
 * - efficiency layer: trusted dealers only, weighted by velocity * seasonFactor
 * - efficiency may exceed demand, but never creditCapUnits
 */
export function allocate(
  inputDealers: readonly Dealer[],
  inputParams: AllocationParams,
): AllocationSummary {
  const dealers = normalizeDealers(inputDealers);
  const params = normalizedParams(inputParams);
  const trace: AllocationStep[] = [];
  let sequence = 0;
  const pushTrace = (step: Omit<AllocationStep, "step">): AllocationStep => {
    const completed = { ...step, step: ++sequence };
    trace.push(completed);
    return completed;
  };

  const scarcityAdjustedFairRatio =
    params.fairBudgetRatio + params.scarcity * (1 - params.fairBudgetRatio);
  const seasonFairAdjustment = Math.min(
    0.1,
    Math.max(-0.1, (1 - params.seasonFactor) * 0.1),
  );
  const effectiveFairRatio = Math.min(
    1,
    Math.max(0, scarcityAdjustedFairRatio + seasonFairAdjustment),
  );
  const fairPoolTarget = Math.min(
    params.supply,
    Math.floor(params.supply * effectiveFairRatio + 0.5),
  );

  pushTrace({
    phase: "precheck",
    event: "POOL_CREATED",
    deltaUnits: 0,
    dealerPhaseTotal: 0,
    dealerFinalTotal: 0,
    poolRemaining: fairPoolTarget,
    message: `缺货度先将公平比例调至 ${scarcityAdjustedFairRatio.toFixed(3)}，淡旺季再调整 ${seasonFairAdjustment.toFixed(3)}，公平池四舍五入为 ${fairPoolTarget} 台。`,
    details: {
      supply: params.supply,
      fairBudgetRatio: params.fairBudgetRatio,
      scarcity: params.scarcity,
      scarcityAdjustedFairRatio,
      seasonFairAdjustment,
      effectiveFairRatio,
    },
  });

  const fairCandidates: FillCandidate[] = [];
  for (const dealer of dealers) {
    const fairCap = Math.min(dealer.demand, dealer.creditCapUnits);
    const fairEffectiveWeight = dealer.demand * dealer.fulfillWeight;
    const eligible = fairCap > 0 && fairEffectiveWeight > 0;
    pushTrace({
      phase: "precheck",
      event: eligible ? "ELIGIBLE" : "INELIGIBLE",
      dealerId: dealer.id,
      deltaUnits: 0,
      dealerPhaseTotal: 0,
      dealerFinalTotal: 0,
      poolRemaining: fairPoolTarget,
      weight: fairEffectiveWeight,
      message: eligible
        ? `公平满足率权重 = 需求 ${dealer.demand} × 履约权重 ${dealer.fulfillWeight} = ${fairEffectiveWeight}；上限 min(需求, 额度) = ${fairCap} 台。`
        : "公平层不可参与：需求、额度折算量或履约权重为 0。",
      details: {
        demand: dealer.demand,
        fulfillWeight: dealer.fulfillWeight,
        fairEffectiveWeight,
        creditCapUnits: dealer.creditCapUnits,
        fairCap,
        inventoryConfidence: dealer.inventoryConfidence,
      },
    });
    if (eligible) {
      fairCandidates.push({
        dealerId: dealer.id,
        weight: fairEffectiveWeight,
        capacity: fairCap,
        capEvent:
          dealer.creditCapUnits < dealer.demand
            ? "CREDIT_CAP_REACHED"
            : "DEMAND_CAP_REACHED",
      });
    }
  }

  const zeroBase = new Map(dealers.map((dealer) => [dealer.id, 0]));
  const fairFill = cappedWeightedFill({
    phase: "fair",
    pool: fairPoolTarget,
    candidates: fairCandidates,
    baseAllocations: zeroBase,
    pushTrace,
  });

  pushTrace({
    phase: "fair",
    event: "POOL_EXHAUSTED",
    deltaUnits: 0,
    dealerPhaseTotal: 0,
    dealerFinalTotal: fairFill.allocated,
    poolRemaining: fairFill.remaining,
    message:
      fairFill.remaining === 0
        ? `公平池 ${fairPoolTarget} 台已分配完毕。`
        : `公平层封顶后剩余 ${fairFill.remaining} 台，并入效率池。`,
    details: { allocated: fairFill.allocated, carriedToEfficiency: fairFill.remaining },
  });

  const efficiencyPoolStart = params.supply - fairFill.allocated;
  pushTrace({
    phase: "efficiency",
    event: "POOL_CREATED",
    deltaUnits: 0,
    dealerPhaseTotal: 0,
    dealerFinalTotal: fairFill.allocated,
    poolRemaining: efficiencyPoolStart,
    message: `效率池 = 总供给 ${params.supply} − 公平层实配 ${fairFill.allocated} = ${efficiencyPoolStart} 台。`,
    details: {
      seasonFactor: params.seasonFactor,
      weightFormula: "velocity × seasonFactor × healthMultiplier",
      stockoutRiskMultiplier: HEALTH_EFFICIENCY_MULTIPLIER.stockout_risk,
      healthyMultiplier: HEALTH_EFFICIENCY_MULTIPLIER.healthy,
      overstockMultiplier: HEALTH_EFFICIENCY_MULTIPLIER.overstock,
    },
  });

  const efficiencyCandidates: FillCandidate[] = [];
  for (const dealer of dealers) {
    const fairAlloc = fairFill.allocations.get(dealer.id) ?? 0;
    const remainingCredit = dealer.creditCapUnits - fairAlloc;
    const healthMultiplier = HEALTH_EFFICIENCY_MULTIPLIER[dealer.healthTag];
    const efficiencyWeight =
      dealer.velocity * params.seasonFactor * healthMultiplier;
    const exclusion =
      dealer.inventoryConfidence === "untrusted"
        ? "库存估算不可信，本轮只走公平层。"
        : remainingCredit <= 0
          ? "已触达额度折算数量上限。"
          : efficiencyWeight <= 0
            ? "动销效率权重为 0。"
            : undefined;

    if (exclusion) {
      pushTrace({
        phase: "efficiency",
        event: "EFFICIENCY_EXCLUDED",
        dealerId: dealer.id,
        deltaUnits: 0,
        dealerPhaseTotal: 0,
        dealerFinalTotal: fairAlloc,
        poolRemaining: efficiencyPoolStart,
        weight: efficiencyWeight,
        message: exclusion,
        details: {
          remainingCredit,
          inventoryConfidence: dealer.inventoryConfidence,
        },
      });
      continue;
    }

    pushTrace({
      phase: "efficiency",
      event: "ELIGIBLE",
      dealerId: dealer.id,
      deltaUnits: 0,
      dealerPhaseTotal: 0,
      dealerFinalTotal: fairAlloc,
      poolRemaining: efficiencyPoolStart,
      weight: efficiencyWeight,
      message: `效率层权重 = 动销 ${dealer.velocity} × 淡旺季 ${params.seasonFactor} × 库存健康倍率 ${healthMultiplier} = ${efficiencyWeight}。`,
      details: {
        remainingCredit,
        healthTag: dealer.healthTag,
        healthMultiplier,
      },
    });
    efficiencyCandidates.push({
      dealerId: dealer.id,
      weight: efficiencyWeight,
      capacity: remainingCredit,
      capEvent: "CREDIT_CAP_REACHED",
    });
  }

  const efficiencyFill = cappedWeightedFill({
    phase: "efficiency",
    pool: efficiencyPoolStart,
    candidates: efficiencyCandidates,
    baseAllocations: fairFill.allocations,
    pushTrace,
  });

  pushTrace({
    phase: "efficiency",
    event: "POOL_EXHAUSTED",
    deltaUnits: 0,
    dealerPhaseTotal: 0,
    dealerFinalTotal: fairFill.allocated + efficiencyFill.allocated,
    poolRemaining: efficiencyFill.remaining,
    message:
      efficiencyFill.remaining === 0
        ? `效率池 ${efficiencyPoolStart} 台已分配完毕。`
        : `所有可参与者封顶后，仍有 ${efficiencyFill.remaining} 台未分配。`,
    details: { allocated: efficiencyFill.allocated },
  });

  if (efficiencyFill.remaining > 0) {
    pushTrace({
      phase: "finalize",
      event: "UNALLOCATED",
      deltaUnits: 0,
      dealerPhaseTotal: 0,
      dealerFinalTotal: fairFill.allocated + efficiencyFill.allocated,
      poolRemaining: efficiencyFill.remaining,
      message: "剩余供给没有满足额度与可信度硬约束的去向，保留在可分配池。",
      details: { unallocatedSupply: efficiencyFill.remaining },
    });
  }

  const results = dealers.map((dealer) => {
    const fairAlloc = fairFill.allocations.get(dealer.id) ?? 0;
    const effAlloc = efficiencyFill.allocations.get(dealer.id) ?? 0;
    const finalAlloc = fairAlloc + effAlloc;
    const notes: string[] = [];
    if (dealer.creditCapUnits === 0) {
      notes.push("额度折算数量为 0，不参与占货");
    }
    if (dealer.inventoryConfidence === "untrusted") {
      notes.push("库存不可信，仅参与公平层");
    }
    if (finalAlloc >= dealer.creditCapUnits && dealer.creditCapUnits > 0) {
      notes.push("额度触顶");
    }
    if (finalAlloc > dealer.demand) {
      notes.push(`效率加配超需求 ${finalAlloc - dealer.demand} 台`);
    }

    pushTrace({
      phase: "finalize",
      event: "RESULT",
      dealerId: dealer.id,
      deltaUnits: 0,
      dealerPhaseTotal: effAlloc,
      dealerFinalTotal: finalAlloc,
      poolRemaining: efficiencyFill.remaining,
      message: `最终分配 ${finalAlloc} 台 = 公平层 ${fairAlloc} + 效率层 ${effAlloc}。`,
      details: {
        demand: dealer.demand,
        creditCapUnits: dealer.creditCapUnits,
      },
    });

    return {
      dealerId: dealer.id,
      fairAlloc,
      effAlloc,
      finalAlloc,
      demand: dealer.demand,
      creditCapUnits: dealer.creditCapUnits,
      satisfactionRate: dealer.demand === 0 ? 1 : finalAlloc / dealer.demand,
      cappedByCredit:
        dealer.creditCapUnits > 0 && finalAlloc >= dealer.creditCapUnits,
      efficiencyEligible:
        dealer.inventoryConfidence !== "untrusted" &&
        dealer.velocity *
          params.seasonFactor *
          HEALTH_EFFICIENCY_MULTIPLIER[dealer.healthTag] >
          0,
      trace: [] as AllocationStep[],
      notes,
    };
  });

  for (const result of results) {
    result.trace = trace.filter(
      (step) => step.dealerId === undefined || step.dealerId === result.dealerId,
    );
  }

  const totalAllocated = fairFill.allocated + efficiencyFill.allocated;
  const trustedRemainingCapacity = efficiencyCandidates.reduce(
    (sum, candidate) => sum + candidate.capacity,
    0,
  );
  const conservationFeasible =
    fairFill.allocated + trustedRemainingCapacity >= params.supply;

  return {
    results,
    trace,
    requestedSupply: params.supply,
    totalAllocated,
    unallocatedSupply: params.supply - totalAllocated,
    scarcityAdjustedFairRatio,
    seasonFairAdjustment,
    effectiveFairRatio,
    fairPoolTarget,
    fairAllocated: fairFill.allocated,
    efficiencyPoolStart,
    efficiencyAllocated: efficiencyFill.allocated,
    invariants: {
      withinSupply: totalAllocated <= params.supply,
      supplyConservedWhenFeasible:
        !conservationFeasible || totalAllocated === params.supply,
      creditCapsRespected: results.every(
        (result) => result.finalAlloc <= result.creditCapUnits,
      ),
      allInteger: results.every(
        (result) =>
          Number.isInteger(result.fairAlloc) &&
          Number.isInteger(result.effAlloc) &&
          Number.isInteger(result.finalAlloc),
      ),
    },
    roundingRule: INTEGER_ROUNDING_RULE,
    scarcityFormula: `${SCARCITY_FORMULA}; ${SEASON_FAIR_FORMULA}`,
    fairWaterLevelFormula: FAIR_WATER_LEVEL_FORMULA,
  };
}

export function allocationByDealerId(
  summary: AllocationSummary,
): ReadonlyMap<string, AllocationSummary["results"][number]> {
  return new Map(summary.results.map((result) => [result.dealerId, result]));
}

export function hasTraceEvent(
  summary: AllocationSummary,
  dealerId: string,
  event: AllocationEvent,
): boolean {
  return summary.trace.some(
    (step) => step.dealerId === dealerId && step.event === event,
  );
}
