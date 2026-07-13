import { describe, expect, it } from "vitest";

import {
  HEALTH_EFFICIENCY_MULTIPLIER,
  allocate,
  allocationByDealerId,
  hasTraceEvent,
} from "../src/core/allocation";
import { PPT_SCENARIO } from "../src/core/scenarios";
import type { Dealer } from "../src/core/types";

function dealer(overrides: Partial<Dealer> & Pick<Dealer, "id">): Dealer {
  return {
    id: overrides.id,
    name: overrides.name ?? `经销商-${overrides.id}`,
    demand: overrides.demand ?? 100,
    creditCapUnits: overrides.creditCapUnits ?? 100,
    fulfillWeight: overrides.fulfillWeight ?? 1,
    velocity: overrides.velocity ?? 1,
    inventory: overrides.inventory ?? 20,
    inventoryConfidence: overrides.inventoryConfidence ?? "high",
    healthTag: overrides.healthTag ?? "healthy",
  };
}

describe("allocate", () => {
  it("strictly reproduces the PPT A/B/C = 108/50/52 narrative", () => {
    const summary = allocate(PPT_SCENARIO.dealers, PPT_SCENARIO.params);
    const byId = allocationByDealerId(summary);

    expect([...byId.values()].map((row) => row.finalAlloc)).toEqual([108, 50, 52]);
    expect(byId.get("A")).toMatchObject({ fairAlloc: 100, effAlloc: 8 });
    expect(byId.get("B")).toMatchObject({
      fairAlloc: 50,
      effAlloc: 0,
      cappedByCredit: true,
    });
    expect(byId.get("C")).toMatchObject({ fairAlloc: 48, effAlloc: 4 });
    expect(byId.get("A")?.finalAlloc).toBeGreaterThan(
      PPT_SCENARIO.dealers[0].demand,
    );
    expect(hasTraceEvent(summary, "B", "CREDIT_CAP_REACHED")).toBe(true);
    expect(
      summary.trace.some(
        (step) =>
          step.dealerId === "B" &&
          step.phase === "fair" &&
          step.event === "CREDIT_CAP_REACHED",
      ),
    ).toBe(true);

    const bCapIndex = summary.trace.findIndex(
      (step) =>
        step.dealerId === "B" &&
        step.phase === "fair" &&
        step.event === "CREDIT_CAP_REACHED",
    );
    const fairBeforeBCap = summary.trace.slice(0, bCapIndex);
    const cumulativeFairFill = (dealerId: string) =>
      fairBeforeBCap
        .filter(
          (step) =>
            step.phase === "fair" &&
            step.event === "PROPORTIONAL_FILL" &&
            step.dealerId === dealerId,
        )
        .reduce((sum, step) => sum + step.deltaUnits, 0);

    expect({
      A: cumulativeFairFill("A"),
      B: cumulativeFairFill("B"),
      C: cumulativeFairFill("C"),
    }).toEqual({ A: 94, B: 50, C: 30 });
    expect(summary.trace[bCapIndex].poolRemaining).toBe(24);
    expect(summary).toMatchObject({
      totalAllocated: 210,
      unallocatedSupply: 0,
      fairPoolTarget: 198,
      fairAllocated: 198,
      efficiencyAllocated: 12,
    });
    expect(summary.invariants).toEqual({
      withinSupply: true,
      supplyConservedWhenFeasible: true,
      creditCapsRespected: true,
      allInteger: true,
    });
  });

  it("reflows a credit-capped dealer's overflow and conserves every unit", () => {
    const summary = allocate(
      [
        dealer({ id: "A", demand: 10, creditCapUnits: 2 }),
        dealer({ id: "B", demand: 10, creditCapUnits: 10 }),
      ],
      { supply: 12, fairBudgetRatio: 1, scarcity: 0, seasonFactor: 1 },
    );
    const byId = allocationByDealerId(summary);

    expect(byId.get("A")?.finalAlloc).toBe(2);
    expect(byId.get("B")?.finalAlloc).toBe(10);
    expect(summary.totalAllocated).toBe(12);
    expect(summary.trace.some((step) => step.message.includes("回流"))).toBe(true);
  });

  it("lets untrusted inventory participate in fair allocation but never efficiency", () => {
    const summary = allocate(
      [
        dealer({
          id: "U",
          velocity: 100,
          inventoryConfidence: "untrusted",
        }),
        dealer({ id: "T", velocity: 1 }),
      ],
      { supply: 10, fairBudgetRatio: 0.5, scarcity: 0, seasonFactor: 1 },
    );
    const byId = allocationByDealerId(summary);

    expect(byId.get("U")?.fairAlloc).toBeGreaterThan(0);
    expect(byId.get("U")?.effAlloc).toBe(0);
    expect(byId.get("T")?.effAlloc).toBe(5);
    expect(
      byId
        .get("U")
        ?.trace.some((step) => step.event === "EFFICIENCY_EXCLUDED"),
    ).toBe(true);
    expect(summary.totalAllocated).toBe(10);
  });

  it("allows efficiency allocation above demand but never above creditCapUnits", () => {
    const summary = allocate(
      [
        dealer({
          id: "A",
          demand: 2,
          creditCapUnits: 10,
          velocity: 10,
        }),
        dealer({ id: "B", demand: 10, creditCapUnits: 10, velocity: 1 }),
      ],
      { supply: 15, fairBudgetRatio: 0.2, scarcity: 0, seasonFactor: 1 },
    );
    const byId = allocationByDealerId(summary);

    expect(byId.get("A")?.finalAlloc).toBe(10);
    expect(byId.get("A")?.finalAlloc).toBeGreaterThan(2);
    expect(byId.get("A")?.cappedByCredit).toBe(true);
    expect(summary.results.every((row) => row.finalAlloc <= row.creditCapUnits)).toBe(
      true,
    );
    expect(summary.totalAllocated).toBe(15);
  });

  it("uses scarcity and seasonFactor in an explicit, observable fair-pool formula", () => {
    const dealers = [dealer({ id: "A" }), dealer({ id: "B" })];
    const peak = allocate(dealers, {
      supply: 20,
      fairBudgetRatio: 0.7,
      scarcity: 0,
      seasonFactor: 1.5,
    });
    const offSeason = allocate(dealers, {
      supply: 20,
      fairBudgetRatio: 0.7,
      scarcity: 0,
      seasonFactor: 0.5,
    });
    const scarce = allocate(dealers, {
      supply: 20,
      fairBudgetRatio: 0.7,
      scarcity: 0.5,
      seasonFactor: 1,
    });

    expect(peak.effectiveFairRatio).toBeCloseTo(0.65);
    expect(peak.fairPoolTarget).toBe(13);
    expect(offSeason.effectiveFairRatio).toBeCloseTo(0.75);
    expect(offSeason.fairPoolTarget).toBe(15);
    expect(scarce.scarcityAdjustedFairRatio).toBeCloseTo(0.85);
    expect(scarce.fairPoolTarget).toBe(17);
  });

  it("applies transparent stockout/healthy/overstock multipliers to efficiency", () => {
    const summary = allocate(
      [
        dealer({ id: "S", healthTag: "stockout_risk" }),
        dealer({ id: "O", healthTag: "overstock" }),
      ],
      { supply: 20, fairBudgetRatio: 0, scarcity: 0, seasonFactor: 1 },
    );
    const byId = allocationByDealerId(summary);

    expect(HEALTH_EFFICIENCY_MULTIPLIER).toEqual({
      stockout_risk: 1.2,
      healthy: 1,
      overstock: 0.65,
    });
    expect(byId.get("S")?.finalAlloc).toBe(13);
    expect(byId.get("O")?.finalAlloc).toBe(7);
    expect(
      byId
        .get("S")
        ?.trace.some(
          (step) =>
            step.phase === "efficiency" && step.details?.healthMultiplier === 1.2,
        ),
    ).toBe(true);
  });

  it("uses largest remainder and dealer id for a deterministic one-unit tail", () => {
    const summary = allocate(
      [dealer({ id: "B" }), dealer({ id: "A" })],
      { supply: 1, fairBudgetRatio: 1, scarcity: 0, seasonFactor: 1 },
    );
    const byId = allocationByDealerId(summary);

    expect(byId.get("A")?.finalAlloc).toBe(1);
    expect(byId.get("B")?.finalAlloc).toBe(0);
    expect(summary.trace.find((step) => step.event === "TAIL_UNIT_ASSIGNED")).toMatchObject(
      { dealerId: "A", deltaUnits: 1 },
    );
  });

  it("is a pure deterministic function and reports genuinely unallocatable supply", () => {
    const inputs = [
      dealer({
        id: "U",
        demand: 3,
        creditCapUnits: 100,
        inventoryConfidence: "untrusted",
      }),
    ];
    const params = {
      supply: 10,
      fairBudgetRatio: 0.5,
      scarcity: 0,
      seasonFactor: 1,
    };
    const before = JSON.parse(JSON.stringify(inputs));
    const first = allocate(inputs, params);
    const second = allocate(inputs, params);

    expect(first).toEqual(second);
    expect(inputs).toEqual(before);
    expect(first.totalAllocated).toBe(3);
    expect(first.unallocatedSupply).toBe(7);
    expect(first.trace.some((step) => step.event === "UNALLOCATED")).toBe(true);
  });
});
