export interface ColorVariant {
  materialCode: string;
  modelId: string;
  colorName: string;
  target: number;
  doLast3Months: number;
}

export interface ColorAllocationResult {
  materialCode: string;
  allocated: number;
  exceededOwnTarget: boolean;
  exactShare: number;
}

export interface ColorVariantAllocation {
  results: ColorAllocationResult[];
  modelTotalCheck: {
    sum: number;
    cap: number;
    passed: boolean;
  };
  unallocatedUnits: number;
  trace: string[];
}

const EPSILON = 1e-9;

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
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

function normalizeMaterialCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Splits a model-level cap by trailing-three-month DO. Individual colour
 * targets are explanatory markers only; they intentionally do not cap a colour
 * because the RFP constrains the model total rather than each material code.
 */
export function allocateColorVariants(
  inputVariants: readonly ColorVariant[],
  modelTotalTarget: number,
  availableUnits: number,
): ColorVariantAllocation {
  const targetCap = toUnits(modelTotalTarget, "modelTotalTarget");
  const available = toUnits(availableUnits, "availableUnits");
  const cap = Math.min(targetCap, available);
  const seen = new Set<string>();
  let expectedModelId: string | undefined;

  const variants = inputVariants.map((inputVariant, index) => {
    const materialCode = normalizeMaterialCode(inputVariant.materialCode);
    const modelId = inputVariant.modelId.trim();
    const colorName = inputVariant.colorName.trim();
    if (!materialCode) {
      throw new Error(`variants[${index}].materialCode must not be empty`);
    }
    if (!modelId) {
      throw new Error(`variants[${index}].modelId must not be empty`);
    }
    if (!colorName) {
      throw new Error(`variants[${index}].colorName must not be empty`);
    }
    if (seen.has(materialCode)) {
      throw new Error(`duplicate material code: ${materialCode}`);
    }
    seen.add(materialCode);
    if (expectedModelId === undefined) expectedModelId = modelId;
    if (modelId !== expectedModelId) {
      throw new Error("all colour variants must belong to the same modelId");
    }
    assertFiniteNonNegative(inputVariant.target, `variants[${index}].target`);
    assertFiniteNonNegative(
      inputVariant.doLast3Months,
      `variants[${index}].doLast3Months`,
    );
    return {
      ...inputVariant,
      materialCode,
      modelId,
      colorName,
      target: Math.floor(inputVariant.target),
    };
  });

  if (variants.length === 0) {
    return {
      results: [],
      modelTotalCheck: { sum: 0, cap, passed: true },
      unallocatedUnits: available,
      trace: ["没有可参与的颜色物料，全部可分配量保留。"],
    };
  }

  let basis = "过去 3 个月 DO";
  let weights = variants.map((variant) => variant.doLast3Months);
  let totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    basis = "单色目标（DO 全为 0 的回退口径）";
    weights = variants.map((variant) => variant.target);
    totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  }
  if (totalWeight <= 0) {
    basis = "物料等分（DO 与单色目标均为 0 的回退口径）";
    weights = variants.map(() => 1);
    totalWeight = variants.length;
  }

  const working = variants.map((variant, index) => {
    const exactShare = (cap * weights[index]) / totalWeight;
    const allocated = Math.floor(exactShare + EPSILON);
    return {
      variant,
      exactShare,
      fractionalRemainder: Math.max(0, exactShare - allocated),
      allocated,
    };
  });
  let tail =
    cap - working.reduce((sum, item) => sum + item.allocated, 0);
  const tailOrder = [...working].sort((left, right) => {
    const remainderDifference =
      right.fractionalRemainder - left.fractionalRemainder;
    if (Math.abs(remainderDifference) > EPSILON) {
      return remainderDifference;
    }
    return lexicalCompare(
      left.variant.materialCode,
      right.variant.materialCode,
    );
  });
  for (let index = 0; tail > 0; index += 1) {
    tailOrder[index % tailOrder.length].allocated += 1;
    tail -= 1;
  }

  const results = working
    .sort((left, right) =>
      lexicalCompare(left.variant.materialCode, right.variant.materialCode),
    )
    .map((item) => ({
      materialCode: item.variant.materialCode,
      allocated: item.allocated,
      exceededOwnTarget: item.allocated > item.variant.target,
      exactShare: round(item.exactShare),
    }));
  const sum = results.reduce((total, result) => total + result.allocated, 0);

  return {
    results,
    modelTotalCheck: {
      sum,
      cap: targetCap,
      passed: sum <= targetCap,
    },
    unallocatedUnits: available - sum,
    trace: [
      `型号总量收口：min(可分配 ${available}, 型号目标 ${targetCap}) = ${cap} 台。`,
      `按${basis}拆分，整数尾差按小数余数降序、物料代码升序决胜。`,
      `颜色分配合计 ${sum} 台 ≤ 型号整体目标 ${targetCap} 台，校验通过。`,
    ],
  };
}

/** Exact, case-insensitive material-code matching; substring matching is forbidden. */
export function isSkipped(
  materialCode: string,
  skipList: readonly string[],
): boolean {
  const normalized = normalizeMaterialCode(materialCode);
  if (!normalized) return false;
  return new Set(
    skipList
      .map(normalizeMaterialCode)
      .filter((candidate) => candidate.length > 0),
  ).has(normalized);
}
