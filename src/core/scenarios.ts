import type {
  AllocationParams,
  AllocationScenario,
  AllocationScenarioId,
  Dealer,
  InventoryConfidence,
  InventoryHealthTag,
  ScenarioSkuProfile,
} from "./types";

const DEALER_NAMES: Readonly<Record<string, string>> = {
  A: "华东数码-A",
  B: "中原电子-B",
  C: "南方声学-C",
  D: "西部影音-D",
  E: "北方通讯-E",
  F: "东南家电-F",
};

function dealer(
  id: string,
  demand: number,
  creditCapUnits: number,
  fulfillWeight: number,
  velocity: number,
  inventory: number,
  inventoryConfidence: InventoryConfidence,
  healthTag: InventoryHealthTag,
): Dealer {
  return {
    id,
    name: DEALER_NAMES[id] ?? `经销商-${id}`,
    demand,
    creditCapUnits,
    fulfillWeight,
    velocity,
    inventory,
    inventoryConfidence,
    healthTag,
  };
}

function profile(
  id: string,
  name: string,
  category: string,
  unitPrice: number,
  story: string,
  params: AllocationParams,
  dealers: Dealer[],
): ScenarioSkuProfile {
  return { id, name, category, unitPrice, story, params, dealers };
}

const PPT_WH = profile(
  "WH-1000XM6",
  "WH-1000XM6",
  "旗舰降噪耳机",
  3_499,
  "经典三渠道白盒案例：额度封顶、货量回流与效率加配会在同一轮发生。",
  {
    supply: 210,
    fairBudgetRatio: 0.7,
    seasonFactor: 1,
    // beta + scarcity * (1-beta) = 33/35, so fair pool = 198.
    scarcity: 17 / 21,
  },
  [
    dealer("A", 100, 120, 1.5, 1.3, 18, "high", "stockout_risk"),
    dealer("B", 80, 50, 1, 1, 32, "mid", "healthy"),
    dealer("C", 60, 80, 0.8, 1.2, 46, "high", "overstock"),
  ],
);

const PPT_ALPHA = profile(
  "A7M5",
  "Alpha 7 V",
  "全画幅微单",
  18_999,
  "高客单价 SKU 的额度约束更紧，四家渠道会呈现不同于耳机的覆盖与加配结构。",
  { supply: 105, fairBudgetRatio: 0.65, seasonFactor: 1.05, scarcity: 0.55 },
  [
    dealer("A", 45, 52, 1.4, 1.15, 9, "high", "stockout_risk"),
    dealer("B", 38, 24, 1.05, 0.9, 18, "mid", "healthy"),
    dealer("C", 32, 44, 0.85, 0.74, 30, "high", "overstock"),
    dealer("D", 28, 36, 1.2, 1.28, 12, "mid", "stockout_risk"),
  ],
);

const PPT_PS5 = profile(
  "PS5-PRO",
  "PS5 Pro",
  "游戏主机",
  6_999,
  "五渠道新品首发：供给紧张且头部动销突出，效率层倾斜会更明显。",
  { supply: 168, fairBudgetRatio: 0.72, seasonFactor: 1.18, scarcity: 0.76 },
  [
    dealer("A", 70, 82, 1.5, 1.45, 8, "high", "stockout_risk"),
    dealer("B", 58, 38, 1, 1.05, 22, "mid", "healthy"),
    dealer("C", 50, 65, 0.9, 0.72, 41, "high", "overstock"),
    dealer("D", 46, 52, 1.12, 1.25, 15, "mid", "stockout_risk"),
    dealer("E", 36, 44, 0.92, 0.88, 19, "low", "healthy"),
  ],
);

const PPT_SKIPPED = profile(
  "WF-C710N-LTD",
  "WF-C710N 限量色",
  "真无线耳机",
  899,
  "突发小批量限量物料已命中 Skip 清单：自动求解会被短路，并转交 SSP 人工分配。",
  { supply: 12, fairBudgetRatio: 0.8, seasonFactor: 1, scarcity: 0.95 },
  [
    dealer("A", 20, 30, 1.2, 1.35, 4, "high", "stockout_risk"),
    dealer("B", 18, 16, 1, 1.05, 8, "mid", "healthy"),
    dealer("C", 14, 20, 0.9, 0.88, 12, "high", "healthy"),
  ],
);

export const PPT_SCENARIO: AllocationScenario = {
  id: "ppt",
  name: "PPT 示意场景",
  description: "白盒讲解场景；每个 SKU 都有独立的供给、渠道需求、额度和动销快照。",
  sku: PPT_WH.id,
  params: PPT_WH.params,
  dealers: PPT_WH.dealers,
  skus: [PPT_WH, PPT_ALPHA, PPT_PS5, PPT_SKIPPED],
  narrative: [
    "WH-1000XM6 严格复现 A/B/C = 108/50/52。",
    "切换 Alpha 7 V 后渠道数、供给量与高客单额度约束同步变化。",
    "切换 PS5 Pro 后进入五渠道新品首发结构，效率倾斜更明显。",
    "切换 WF-C710N 限量色后可验证 Skip 清单会在求解前转人工。",
  ],
};

const PEAK_ALPHA = profile(
  "A7M5",
  "Alpha 7 V",
  "全画幅微单",
  18_999,
  "旺季相机需求集中爆发，供给仅覆盖总需求约六成。",
  { supply: 210, fairBudgetRatio: 0.7, seasonFactor: 1.25, scarcity: 0.9 },
  [
    dealer("A", 80, 95, 1.5, 1.5, 12, "high", "stockout_risk"),
    dealer("B", 75, 38, 1, 1, 28, "mid", "healthy"),
    dealer("C", 65, 80, 0.9, 0.62, 49, "high", "overstock"),
    dealer("D", 55, 70, 1.1, 1.12, 20, "mid", "healthy"),
    dealer("E", 45, 52, 0.95, 0.9, 17, "low", "stockout_risk"),
    dealer("F", 40, 60, 0.85, 1.3, 35, "untrusted", "healthy"),
  ],
);

const PEAK_PS5 = profile(
  "PS5-PRO",
  "PS5 Pro",
  "游戏主机",
  6_999,
  "大促前补货：高缺货度把大部分货量推入公平层，F 因库存不可信只走保底。",
  { supply: 150, fairBudgetRatio: 0.68, seasonFactor: 1.35, scarcity: 0.96 },
  [
    dealer("A", 76, 86, 1.45, 1.62, 7, "high", "stockout_risk"),
    dealer("B", 66, 34, 1.05, 1.08, 19, "mid", "healthy"),
    dealer("C", 54, 62, 0.82, 0.68, 44, "high", "overstock"),
    dealer("D", 48, 58, 1.18, 1.36, 12, "mid", "stockout_risk"),
    dealer("E", 43, 46, 0.95, 0.94, 16, "low", "healthy"),
    dealer("F", 38, 50, 0.8, 1.22, 29, "untrusted", "healthy"),
  ],
);

const PEAK_BRAVIA = profile(
  "K-65XR80",
  "BRAVIA 8 65\"",
  "OLED 电视",
  19_999,
  "大屏电视促销档期的低供给案例；单台金额高使额度拦截更敏感。",
  { supply: 48, fairBudgetRatio: 0.76, seasonFactor: 1.22, scarcity: 0.92 },
  [
    dealer("A", 28, 32, 1.35, 1.24, 4, "high", "stockout_risk"),
    dealer("B", 24, 12, 1, 0.92, 11, "mid", "healthy"),
    dealer("C", 22, 28, 0.82, 0.58, 21, "high", "overstock"),
    dealer("D", 20, 24, 1.15, 1.18, 6, "mid", "stockout_risk"),
    dealer("E", 18, 20, 0.9, 0.86, 8, "low", "healthy"),
  ],
);

export const PEAK_SCENARIO: AllocationScenario = {
  id: "peak",
  name: "旺季缺货场景",
  description: "需求显著大于供给；不同 SKU 的缺货度、渠道数和资金约束分别建模。",
  sku: PEAK_ALPHA.id,
  params: PEAK_ALPHA.params,
  dealers: PEAK_ALPHA.dealers,
  skus: [PEAK_ALPHA, PEAK_PS5, PEAK_BRAVIA],
  narrative: [
    "高 scarcity 将主要货源放入公平兜底层。",
    "旺季系数同时增强效率权重并适度压低公平池。",
    "库存不可信渠道只参与公平层，不接受效率倾斜。",
  ],
};

const OFFSEASON_PS5 = profile(
  "PS5-PRO",
  "PS5 Pro",
  "游戏主机",
  6_999,
  "淡季供给恰好覆盖需求，公平层可以完成六家渠道全量保供。",
  { supply: 200, fairBudgetRatio: 1, seasonFactor: 0.8, scarcity: 0 },
  [
    dealer("A", 48, 70, 1.5, 1.5, 24, "high", "stockout_risk"),
    dealer("B", 42, 60, 1, 1, 26, "mid", "healthy"),
    dealer("C", 36, 55, 0.9, 0.62, 31, "high", "overstock"),
    dealer("D", 30, 50, 1.1, 1.12, 22, "mid", "healthy"),
    dealer("E", 24, 42, 0.95, 0.9, 20, "low", "stockout_risk"),
    dealer("F", 20, 35, 0.85, 1.3, 18, "high", "healthy"),
  ],
);

const OFFSEASON_LINKBUDS = profile(
  "WF-LS910N",
  "LinkBuds Fit",
  "真无线耳机",
  1_299,
  "成熟产品保供：五家渠道需求均可覆盖，结果主要受需求线而非额度线约束。",
  { supply: 240, fairBudgetRatio: 1, seasonFactor: 0.82, scarcity: 0 },
  [
    dealer("A", 60, 82, 1.28, 1.08, 32, "high", "healthy"),
    dealer("B", 52, 68, 1.05, 0.94, 38, "high", "healthy"),
    dealer("C", 48, 66, 0.9, 0.78, 56, "high", "overstock"),
    dealer("D", 44, 60, 1.1, 1.12, 26, "mid", "healthy"),
    dealer("E", 36, 52, 0.92, 0.9, 22, "mid", "stockout_risk"),
  ],
);

const OFFSEASON_ULT = profile(
  "SRS-ULT50",
  "ULT FIELD 5",
  "便携蓝牙音箱",
  2_999,
  "季末保供：总供给与需求完全相等，但各渠道库存健康度不同。",
  { supply: 162, fairBudgetRatio: 1, seasonFactor: 0.78, scarcity: 0 },
  [
    dealer("A", 42, 58, 1.25, 1.06, 24, "high", "healthy"),
    dealer("B", 36, 50, 1, 0.88, 31, "mid", "healthy"),
    dealer("C", 32, 46, 0.86, 0.66, 48, "high", "overstock"),
    dealer("D", 28, 44, 1.12, 1.18, 17, "high", "stockout_risk"),
    dealer("E", 24, 38, 0.9, 0.84, 21, "low", "healthy"),
  ],
);

export const OFFSEASON_SCENARIO: AllocationScenario = {
  id: "offseason",
  name: "淡季保供场景",
  description: "供给可以覆盖需求，算法重点转为渠道保供、库存健康和尾货控制。",
  sku: OFFSEASON_PS5.id,
  params: OFFSEASON_PS5.params,
  dealers: OFFSEASON_PS5.dealers,
  skus: [OFFSEASON_PS5, OFFSEASON_LINKBUDS, OFFSEASON_ULT],
  narrative: [
    "公平池覆盖全部供给，渠道达到基础需求。",
    "不同 SKU 使用各自渠道需求、额度和库存快照。",
    "低缺货度下不需要用效率倾斜制造集中分配。",
  ],
};

export const SCENARIOS: readonly AllocationScenario[] = [
  PPT_SCENARIO,
  PEAK_SCENARIO,
  OFFSEASON_SCENARIO,
];

function cloneProfile(item: ScenarioSkuProfile): ScenarioSkuProfile {
  return {
    ...item,
    params: { ...item.params },
    dealers: item.dealers.map((itemDealer) => ({ ...itemDealer })),
  };
}

function cloneScenario(scenario: AllocationScenario): AllocationScenario {
  return {
    ...scenario,
    params: { ...scenario.params },
    dealers: scenario.dealers.map((itemDealer) => ({ ...itemDealer })),
    skus: scenario.skus.map(cloneProfile),
    narrative: [...scenario.narrative],
  };
}

export function getScenario(id: AllocationScenarioId): AllocationScenario {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`unknown allocation scenario: ${id}`);
  return cloneScenario(scenario);
}

export function getScenarioSku(
  scenarioId: AllocationScenarioId,
  skuId?: string,
): ScenarioSkuProfile {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`unknown allocation scenario: ${scenarioId}`);
  const selectedId = skuId ?? scenario.sku;
  const selected = scenario.skus.find((candidate) => candidate.id === selectedId);
  if (!selected) {
    throw new Error(`SKU ${selectedId} is not available in scenario ${scenarioId}`);
  }
  return cloneProfile(selected);
}

export function getScenarioSkuOptions(
  scenarioId: AllocationScenarioId,
): ScenarioSkuProfile[] {
  return getScenario(scenarioId).skus;
}
