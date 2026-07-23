import { describe, expect, it } from "vitest";

import {
  allocateColorVariants,
  isSkipped,
  type ColorVariant,
} from "../src/core/specialMaterials";

const variants: ColorVariant[] = [
  {
    materialCode: "P1",
    modelId: "WH-1000XM6",
    colorName: "曜石黑",
    target: 10,
    doLast3Months: 620,
  },
  {
    materialCode: "P2",
    modelId: "WH-1000XM6",
    colorName: "铂金银",
    target: 10,
    doLast3Months: 410,
  },
];

describe("special material rules", () => {
  it("reproduces P1/P2 = 12/8 and caps only at model total", () => {
    const result = allocateColorVariants(variants, 20, 20);

    expect(result.results).toMatchObject([
      { materialCode: "P1", allocated: 12, exceededOwnTarget: true },
      { materialCode: "P2", allocated: 8, exceededOwnTarget: false },
    ]);
    expect(result.modelTotalCheck).toEqual({
      sum: 20,
      cap: 20,
      passed: true,
    });
    expect(result.unallocatedUnits).toBe(0);
  });

  it("respects both available supply and the model-level target", () => {
    const constrainedBySupply = allocateColorVariants(variants, 20, 10);
    const constrainedByModel = allocateColorVariants(variants, 20, 30);

    expect(constrainedBySupply.results.map((item) => item.allocated)).toEqual([
      6, 4,
    ]);
    expect(constrainedBySupply.modelTotalCheck.sum).toBe(10);
    expect(constrainedByModel.results.map((item) => item.allocated)).toEqual([
      12, 8,
    ]);
    expect(constrainedByModel.unallocatedUnits).toBe(10);
  });

  it("uses deterministic target and equal-share fallbacks when DO is zero", () => {
    const targetFallback = allocateColorVariants(
      variants.map((item, index) => ({
        ...item,
        target: index === 0 ? 3 : 1,
        doLast3Months: 0,
      })),
      4,
      4,
    );
    const equalFallback = allocateColorVariants(
      variants.map((item) => ({
        ...item,
        target: 0,
        doLast3Months: 0,
      })),
      1,
      1,
    );

    expect(targetFallback.results.map((item) => item.allocated)).toEqual([3, 1]);
    expect(equalFallback.results.map((item) => item.allocated)).toEqual([1, 0]);
  });

  it("is deterministic, does not mutate input, and rejects malformed variants", () => {
    const before = JSON.parse(JSON.stringify(variants));
    expect(allocateColorVariants(variants, 20, 20)).toEqual(
      allocateColorVariants(variants, 20, 20),
    );
    expect(variants).toEqual(before);
    expect(() =>
      allocateColorVariants(
        [variants[0], { ...variants[1], materialCode: "p1" }],
        20,
        20,
      ),
    ).toThrow(/duplicate material/);
    expect(() =>
      allocateColorVariants(
        [variants[0], { ...variants[1], modelId: "OTHER" }],
        20,
        20,
      ),
    ).toThrow(/same modelId/);
    expect(() => allocateColorVariants(variants, -1, 20)).toThrow(
      /non-negative/,
    );
  });

  it("matches Skip codes exactly after trim and case normalization", () => {
    const skipList = ["WF-C710N-LTD", "  P2  "];

    expect(isSkipped("wf-c710n-ltd", skipList)).toBe(true);
    expect(isSkipped(" P2 ", skipList)).toBe(true);
    expect(isSkipped("WF-C710N", skipList)).toBe(false);
    expect(isSkipped("", skipList)).toBe(false);
  });
});
