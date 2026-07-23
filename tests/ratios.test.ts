import { describe, expect, it } from "vitest";

import {
  allocateChannelSequence,
  applyWklyRatio,
  computePaPlanRatio,
  resolveWeeklyAllocation,
  type PaPlanRatioInput,
} from "../src/core/ratios";

function ratioInput(
  overrides: Partial<PaPlanRatioInput> = {},
): PaPlanRatioInput {
  return {
    supply: 60,
    netDemand: 100,
    scarcity: 0.4,
    orders: 50,
    inventory: 20,
    creditBalance: 8_000,
    unitPrice: 100,
    turnoverWeeks: 4,
    wklyRatio: 0.25,
    isBigCustomer: true,
    kBig: 1.2,
    isDirectSales: true,
    bufferRatio: 0.1,
    weights: { supplyDemand: 4, operation: 3, strategy: 3 },
    ...overrides,
  };
}

describe("PA Plan Ratio and weekly constraints", () => {
  it("computes a transparent three-dimension weighted ratio", () => {
    const result = computePaPlanRatio(ratioInput());

    expect(result.breakdown).toEqual({
      supplyDemand: 0.4,
      operation: 0.65,
      strategy: 0.33,
    });
    expect(result.ratio).toBe(0.454);
    expect(result.trace).toHaveLength(4);
    expect(result.trace.join(" ")).toContain("额度覆盖");
  });

  it("normalizes dimension weights and is pure deterministic", () => {
    const input = ratioInput();
    const before = JSON.parse(JSON.stringify(input));
    const first = computePaPlanRatio(input);
    const scaled = computePaPlanRatio(
      ratioInput({
        weights: { supplyDemand: 0.4, operation: 0.3, strategy: 0.3 },
      }),
    );

    expect(first).toEqual(computePaPlanRatio(input));
    expect(input).toEqual(before);
    expect(first.ratio).toBe(scaled.ratio);
    expect(() =>
      computePaPlanRatio(
        ratioInput({
          weights: { supplyDemand: 0, operation: 0, strategy: 0 },
        }),
      ),
    ).toThrow(/at least one/);
  });

  it("caps a normal customer by Wkly Ratio", () => {
    expect(applyWklyRatio(101, 0.25, false, 1)).toMatchObject({
      weeklyCap: 25,
      planningReference: 25,
      exempted: false,
    });
    expect(
      resolveWeeklyAllocation({
        requestedUnits: 80,
        creditCapUnits: 70,
        monthlyTarget: 101,
        wklyRatio: 0.25,
        isBigCustomer: false,
        kBig: 1,
      }),
    ).toMatchObject({
      allocatedUnits: 25,
      weeklyCap: 25,
      effectiveCap: 25,
      cappedByWeekly: true,
      cappedByCredit: false,
    });
  });

  it("exempts a big customer from weekly cap but never from credit cap", () => {
    expect(applyWklyRatio(101, 0.25, true, 1.2)).toMatchObject({
      weeklyCap: null,
      planningReference: 30,
      exempted: true,
    });
    expect(
      resolveWeeklyAllocation({
        requestedUnits: 80,
        creditCapUnits: 70,
        monthlyTarget: 101,
        wklyRatio: 0.25,
        isBigCustomer: true,
        kBig: 1.2,
      }),
    ).toMatchObject({
      allocatedUnits: 70,
      weeklyCap: null,
      effectiveCap: 70,
      exempted: true,
      cappedByWeekly: false,
      cappedByCredit: true,
    });
  });

  it("executes direct sales, Buffer and other channels in a conserved sequence", () => {
    const result = allocateChannelSequence({
      supply: 100,
      directDemand: 30,
      bufferRatio: 0.2,
    });

    expect(result).toMatchObject({
      supply: 100,
      directAllocated: 30,
      bufferReserved: 14,
      otherChannelsPool: 56,
      totalAccounted: 100,
    });
    expect(result.trace).toHaveLength(3);
  });

  it("rejects invalid ratios and a non-boosting big-customer coefficient", () => {
    expect(() => applyWklyRatio(100, 1.1, false, 1)).toThrow(
      /between 0 and 1/,
    );
    expect(() => applyWklyRatio(100, 0.25, true, 0.9)).toThrow(
      /at least 1/,
    );
    expect(() =>
      allocateChannelSequence({
        supply: 100,
        directDemand: 30,
        bufferRatio: -0.1,
      }),
    ).toThrow(/between 0 and 1/);
  });
});
