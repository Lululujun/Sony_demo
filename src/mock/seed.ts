import type { InventoryConfidence, InventoryHealthTag } from "@/src/core/types";
import type { TierNode } from "@/src/core/layering";
import type { ColorVariant } from "@/src/core/specialMaterials";

export interface SkuDefinition {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
}

export const SKU_CATALOG: SkuDefinition[] = [
  { id: "WH-1000XM6", name: "WH-1000XM6", category: "旗舰降噪耳机", unitPrice: 3_499 },
  { id: "A7M5", name: "Alpha 7 V", category: "全画幅微单", unitPrice: 18_999 },
  { id: "PS5-PRO", name: "PS5 Pro", category: "游戏主机", unitPrice: 6_999 },
  { id: "K-65XR80", name: "BRAVIA 8 65\"", category: "OLED 电视", unitPrice: 19_999 },
  { id: "WF-LS910N", name: "LinkBuds Fit", category: "真无线耳机", unitPrice: 1_299 },
  { id: "SRS-ULT50", name: "ULT FIELD 5", category: "便携蓝牙音箱", unitPrice: 2_999 },
  { id: "WF-C710N-LTD", name: "WF-C710N 限量色", category: "真无线耳机", unitPrice: 899 },
];

export interface PsiWeekSeed {
  week: number;
  sellout: number;
  isPeakSeason: boolean;
}

export interface DealerBusinessProfile {
  dealerId: string;
  isBigCustomer: boolean;
  monthlyTarget: number;
  psiHistory12M: PsiWeekSeed[];
  isDirectSales: boolean;
  category: string;
}

function buildPsiHistory(base: number, phase: number): PsiWeekSeed[] {
  return Array.from({ length: 52 }, (_, index) => {
    const week = index + 1;
    const isPeakSeason =
      (week >= 20 && week <= 23) || (week >= 44 && week <= 48);
    const cadence = ((week + phase) % 5) - 2;
    const sellout = Math.max(
      0,
      Math.round(base + cadence + (isPeakSeason ? base * 0.58 : 0)),
    );
    return { week, sellout, isPeakSeason };
  });
}

/**
 * RFP business attributes are kept outside the allocation Dealer model so the
 * original PPT white-box fixture remains unchanged.
 */
export const DEALER_BUSINESS_PROFILES: readonly DealerBusinessProfile[] = [
  { dealerId: "A", isBigCustomer: true, monthlyTarget: 500, psiHistory12M: buildPsiHistory(15, 0), isDirectSales: true, category: "影音产品" },
  { dealerId: "B", isBigCustomer: false, monthlyTarget: 300, psiHistory12M: buildPsiHistory(10, 1), isDirectSales: false, category: "影音产品" },
  { dealerId: "C", isBigCustomer: false, monthlyTarget: 250, psiHistory12M: buildPsiHistory(9, 2), isDirectSales: false, category: "影音产品" },
  { dealerId: "D", isBigCustomer: false, monthlyTarget: 220, psiHistory12M: buildPsiHistory(8, 3), isDirectSales: false, category: "数码影像" },
  { dealerId: "E", isBigCustomer: true, monthlyTarget: 260, psiHistory12M: buildPsiHistory(8, 4), isDirectSales: false, category: "游戏产品" },
  { dealerId: "F", isBigCustomer: false, monthlyTarget: 180, psiHistory12M: buildPsiHistory(6, 0), isDirectSales: false, category: "家庭娱乐" },
];

export const COLOR_VARIANTS: readonly ColorVariant[] = [
  { materialCode: "P1", modelId: "WH-1000XM6", colorName: "曜石黑", target: 10, doLast3Months: 620 },
  { materialCode: "P2", modelId: "WH-1000XM6", colorName: "铂金银", target: 10, doLast3Months: 410 },
];

export const SKIP_LIST: readonly string[] = ["WF-C710N-LTD"];

/**
 * Six-level organisation fixture:
 * 1 HQ → 3 channels → 6 sub-channels → 8 regions → 12 branches → 20 dealers.
 *
 * P2 uses 310 units against the root's 500-unit net demand. The PA ratios
 * split that pool into A/B/C = 124/109/77, so channel A can stop at 103.3%
 * while B and C continue to lower tiers.
 */
export const ORG_TREE: readonly TierNode[] = [
  { id: "HQ", name: "索尼中国总部", tier: "hq", parentId: null, targetDemand: 540, netDemand: 500, achievementRate: 0.83, paPlanRatio: 1 },
  { id: "CH-A", name: "直营与核心零售", tier: "channel", parentId: "HQ", targetDemand: 130, netDemand: 120, achievementRate: 0.91, paPlanRatio: 0.4 },
  { id: "CH-B", name: "区域经销", tier: "channel", parentId: "HQ", targetDemand: 195, netDemand: 180, achievementRate: 0.74, paPlanRatio: 0.35 },
  { id: "CH-C", name: "电商与专业渠道", tier: "channel", parentId: "HQ", targetDemand: 215, netDemand: 200, achievementRate: 0.69, paPlanRatio: 0.25 },

  { id: "SC-A1", name: "Sony Store", tier: "subChannel", parentId: "CH-A", targetDemand: 72, netDemand: 65, achievementRate: 0.94, paPlanRatio: 0.58 },
  { id: "SC-A2", name: "全国 KA", tier: "subChannel", parentId: "CH-A", targetDemand: 58, netDemand: 55, achievementRate: 0.88, paPlanRatio: 0.42 },
  { id: "SC-B1", name: "重点经销网络", tier: "subChannel", parentId: "CH-B", targetDemand: 98, netDemand: 90, achievementRate: 0.78, paPlanRatio: 0.55 },
  { id: "SC-B2", name: "成长经销网络", tier: "subChannel", parentId: "CH-B", targetDemand: 97, netDemand: 90, achievementRate: 0.7, paPlanRatio: 0.45 },
  { id: "SC-C1", name: "平台电商", tier: "subChannel", parentId: "CH-C", targetDemand: 115, netDemand: 105, achievementRate: 0.73, paPlanRatio: 0.52 },
  { id: "SC-C2", name: "专业与垂直电商", tier: "subChannel", parentId: "CH-C", targetDemand: 100, netDemand: 95, achievementRate: 0.65, paPlanRatio: 0.48 },

  { id: "RG-A1", name: "直营全国区", tier: "region", parentId: "SC-A1", targetDemand: 72, netDemand: 65, achievementRate: 0.94, paPlanRatio: 1 },
  { id: "RG-A2", name: "KA 全国区", tier: "region", parentId: "SC-A2", targetDemand: 58, netDemand: 55, achievementRate: 0.88, paPlanRatio: 1 },
  { id: "RG-B1", name: "华东华南区", tier: "region", parentId: "SC-B1", targetDemand: 98, netDemand: 90, achievementRate: 0.78, paPlanRatio: 1 },
  { id: "RG-B2N", name: "华北区", tier: "region", parentId: "SC-B2", targetDemand: 51, netDemand: 47, achievementRate: 0.71, paPlanRatio: 0.55 },
  { id: "RG-B2W", name: "西部区", tier: "region", parentId: "SC-B2", targetDemand: 46, netDemand: 43, achievementRate: 0.68, paPlanRatio: 0.45 },
  { id: "RG-C1", name: "平台电商全国区", tier: "region", parentId: "SC-C1", targetDemand: 115, netDemand: 105, achievementRate: 0.73, paPlanRatio: 1 },
  { id: "RG-C2E", name: "专业电商东区", tier: "region", parentId: "SC-C2", targetDemand: 53, netDemand: 50, achievementRate: 0.68, paPlanRatio: 0.54 },
  { id: "RG-C2W", name: "专业电商西区", tier: "region", parentId: "SC-C2", targetDemand: 47, netDemand: 45, achievementRate: 0.61, paPlanRatio: 0.46 },

  { id: "BR-A1", name: "直营运营中心", tier: "branch", parentId: "RG-A1", targetDemand: 72, netDemand: 65, achievementRate: 0.94, paPlanRatio: 1 },
  { id: "BR-A2", name: "KA 运营中心", tier: "branch", parentId: "RG-A2", targetDemand: 58, netDemand: 55, achievementRate: 0.88, paPlanRatio: 1 },
  { id: "BR-B1E", name: "华东分公司", tier: "branch", parentId: "RG-B1", targetDemand: 52, netDemand: 48, achievementRate: 0.81, paPlanRatio: 0.54 },
  { id: "BR-B1S", name: "华南分公司", tier: "branch", parentId: "RG-B1", targetDemand: 46, netDemand: 42, achievementRate: 0.75, paPlanRatio: 0.46 },
  { id: "BR-B2N", name: "华北分公司", tier: "branch", parentId: "RG-B2N", targetDemand: 51, netDemand: 47, achievementRate: 0.71, paPlanRatio: 1 },
  { id: "BR-B2W", name: "西部分公司", tier: "branch", parentId: "RG-B2W", targetDemand: 46, netDemand: 43, achievementRate: 0.68, paPlanRatio: 1 },
  { id: "BR-C1A", name: "综合电商一部", tier: "branch", parentId: "RG-C1", targetDemand: 62, netDemand: 57, achievementRate: 0.76, paPlanRatio: 0.55 },
  { id: "BR-C1B", name: "综合电商二部", tier: "branch", parentId: "RG-C1", targetDemand: 53, netDemand: 48, achievementRate: 0.69, paPlanRatio: 0.45 },
  { id: "BR-C2EA", name: "专业电商东一部", tier: "branch", parentId: "RG-C2E", targetDemand: 28, netDemand: 26, achievementRate: 0.7, paPlanRatio: 0.54 },
  { id: "BR-C2EB", name: "专业电商东二部", tier: "branch", parentId: "RG-C2E", targetDemand: 25, netDemand: 24, achievementRate: 0.66, paPlanRatio: 0.46 },
  { id: "BR-C2WA", name: "专业电商西一部", tier: "branch", parentId: "RG-C2W", targetDemand: 25, netDemand: 24, achievementRate: 0.63, paPlanRatio: 0.53 },
  { id: "BR-C2WB", name: "专业电商西二部", tier: "branch", parentId: "RG-C2W", targetDemand: 22, netDemand: 21, achievementRate: 0.59, paPlanRatio: 0.47 },

  { id: "DL-01", name: "Sony Store 上海", tier: "dealer", parentId: "BR-A1", targetDemand: 36, netDemand: 33, achievementRate: 0.96, paPlanRatio: 0.51 },
  { id: "DL-02", name: "Sony Store 北京", tier: "dealer", parentId: "BR-A1", targetDemand: 36, netDemand: 32, achievementRate: 0.92, paPlanRatio: 0.49 },
  { id: "DL-03", name: "京东五星", tier: "dealer", parentId: "BR-A2", targetDemand: 30, netDemand: 29, achievementRate: 0.9, paPlanRatio: 0.53 },
  { id: "DL-04", name: "苏宁易购", tier: "dealer", parentId: "BR-A2", targetDemand: 28, netDemand: 26, achievementRate: 0.86, paPlanRatio: 0.47 },
  { id: "DL-05", name: "华东数码-A", tier: "dealer", parentId: "BR-B1E", targetDemand: 28, netDemand: 26, achievementRate: 0.84, paPlanRatio: 0.54 },
  { id: "DL-06", name: "沪上影音", tier: "dealer", parentId: "BR-B1E", targetDemand: 24, netDemand: 22, achievementRate: 0.78, paPlanRatio: 0.46 },
  { id: "DL-07", name: "南方声学-C", tier: "dealer", parentId: "BR-B1S", targetDemand: 24, netDemand: 22, achievementRate: 0.78, paPlanRatio: 0.52 },
  { id: "DL-08", name: "岭南视听", tier: "dealer", parentId: "BR-B1S", targetDemand: 22, netDemand: 20, achievementRate: 0.72, paPlanRatio: 0.48 },
  { id: "DL-09", name: "中原电子-B", tier: "dealer", parentId: "BR-B2N", targetDemand: 27, netDemand: 25, achievementRate: 0.73, paPlanRatio: 0.53 },
  { id: "DL-10", name: "北方通讯-E", tier: "dealer", parentId: "BR-B2N", targetDemand: 24, netDemand: 22, achievementRate: 0.69, paPlanRatio: 0.47 },
  { id: "DL-11", name: "西部影音-D", tier: "dealer", parentId: "BR-B2W", targetDemand: 24, netDemand: 23, achievementRate: 0.7, paPlanRatio: 0.54 },
  { id: "DL-12", name: "蓉城数码", tier: "dealer", parentId: "BR-B2W", targetDemand: 22, netDemand: 20, achievementRate: 0.66, paPlanRatio: 0.46 },
  { id: "DL-13", name: "天猫 Sony", tier: "dealer", parentId: "BR-C1A", targetDemand: 33, netDemand: 30, achievementRate: 0.79, paPlanRatio: 0.53 },
  { id: "DL-14", name: "京东 Sony", tier: "dealer", parentId: "BR-C1A", targetDemand: 29, netDemand: 27, achievementRate: 0.74, paPlanRatio: 0.47 },
  { id: "DL-15", name: "抖音 Sony", tier: "dealer", parentId: "BR-C1B", targetDemand: 28, netDemand: 25, achievementRate: 0.71, paPlanRatio: 0.52 },
  { id: "DL-16", name: "得物数码", tier: "dealer", parentId: "BR-C1B", targetDemand: 25, netDemand: 23, achievementRate: 0.67, paPlanRatio: 0.48 },
  { id: "DL-17", name: "摄影器材城", tier: "dealer", parentId: "BR-C2EA", targetDemand: 28, netDemand: 26, achievementRate: 0.7, paPlanRatio: 1 },
  { id: "DL-18", name: "专业影音网", tier: "dealer", parentId: "BR-C2EB", targetDemand: 25, netDemand: 24, achievementRate: 0.66, paPlanRatio: 1 },
  { id: "DL-19", name: "校园数码渠道", tier: "dealer", parentId: "BR-C2WA", targetDemand: 25, netDemand: 24, achievementRate: 0.63, paPlanRatio: 1 },
  { id: "DL-20", name: "东南家电-F", tier: "dealer", parentId: "BR-C2WB", targetDemand: 22, netDemand: 21, achievementRate: 0.59, paPlanRatio: 1 },
];

export const DASHBOARD_HISTORY = [
  { day: "06/23", allocated: 176, paid: 151 },
  { day: "06/24", allocated: 188, paid: 162 },
  { day: "06/25", allocated: 182, paid: 167 },
  { day: "06/26", allocated: 201, paid: 174 },
  { day: "06/27", allocated: 194, paid: 176 },
  { day: "06/28", allocated: 168, paid: 153 },
  { day: "06/29", allocated: 172, paid: 157 },
  { day: "06/30", allocated: 204, paid: 182 },
  { day: "07/01", allocated: 198, paid: 181 },
  { day: "07/02", allocated: 215, paid: 191 },
  { day: "07/03", allocated: 209, paid: 189 },
  { day: "07/04", allocated: 224, paid: 201 },
  { day: "07/05", allocated: 190, paid: 174 },
  { day: "07/06", allocated: 210, paid: 186 },
];

export interface InventoryDealerSeed {
  dealerId: string;
  dealerName: string;
  beginningInventory: number;
  inboundAllocation: number;
  endingInventory: number;
  currentInventory: number;
  monthlyAverageAllocation: number;
  lastTruthInventory: number;
  estimatedDailySellThrough: number;
  confidence: InventoryConfidence;
  healthTag: InventoryHealthTag;
  headquartersTurnoverWeeks: number;
}

export const INVENTORY_SEEDS: InventoryDealerSeed[] = [
  {
    dealerId: "A",
    dealerName: "华东数码-A",
    beginningInventory: 132,
    inboundAllocation: 108,
    endingInventory: 154,
    currentInventory: 154,
    monthlyAverageAllocation: 248,
    lastTruthInventory: 132,
    estimatedDailySellThrough: 12.3,
    confidence: "high",
    healthTag: "healthy",
    headquartersTurnoverWeeks: 2.9,
  },
  {
    dealerId: "B",
    dealerName: "中原电子-B",
    beginningInventory: 96,
    inboundAllocation: 50,
    endingInventory: 121,
    currentInventory: 121,
    monthlyAverageAllocation: 126,
    lastTruthInventory: 96,
    estimatedDailySellThrough: 4.1,
    confidence: "mid",
    healthTag: "overstock",
    headquartersTurnoverWeeks: 2.2,
  },
  {
    dealerId: "C",
    dealerName: "南方声学-C",
    beginningInventory: 84,
    inboundAllocation: 52,
    endingInventory: 103,
    currentInventory: 103,
    monthlyAverageAllocation: 151,
    lastTruthInventory: 84,
    estimatedDailySellThrough: 5.5,
    confidence: "high",
    healthTag: "healthy",
    headquartersTurnoverWeeks: 3.1,
  },
  {
    dealerId: "D",
    dealerName: "西部影音-D",
    beginningInventory: 63,
    inboundAllocation: 38,
    endingInventory: 69,
    currentInventory: 69,
    monthlyAverageAllocation: 174,
    lastTruthInventory: 63,
    estimatedDailySellThrough: 4.7,
    confidence: "low",
    healthTag: "stockout_risk",
    headquartersTurnoverWeeks: 2.6,
  },
  {
    dealerId: "E",
    dealerName: "北方通讯-E",
    beginningInventory: 145,
    inboundAllocation: 44,
    endingInventory: 163,
    currentInventory: 163,
    monthlyAverageAllocation: 158,
    lastTruthInventory: 145,
    estimatedDailySellThrough: 3.7,
    confidence: "mid",
    healthTag: "overstock",
    headquartersTurnoverWeeks: 3.8,
  },
  {
    dealerId: "F",
    dealerName: "东南家电-F",
    beginningInventory: 71,
    inboundAllocation: 31,
    endingInventory: 88,
    currentInventory: 88,
    monthlyAverageAllocation: 164,
    lastTruthInventory: 71,
    estimatedDailySellThrough: 2,
    confidence: "untrusted",
    healthTag: "healthy",
    headquartersTurnoverWeeks: 2.7,
  },
];

export const LEARNING_HISTORY = [
  { week: "W20", fulfill: 1.00, velocity: 0.88, accuracy: 82.1, payment: 79.6 },
  { week: "W21", fulfill: 1.02, velocity: 0.90, accuracy: 83.4, payment: 80.9 },
  { week: "W22", fulfill: 1.04, velocity: 0.93, accuracy: 84.8, payment: 82.0 },
  { week: "W23", fulfill: 1.07, velocity: 0.96, accuracy: 86.2, payment: 83.7 },
  { week: "W24", fulfill: 1.11, velocity: 0.99, accuracy: 87.0, payment: 85.3 },
  { week: "W25", fulfill: 1.14, velocity: 1.03, accuracy: 88.6, payment: 87.1 },
  { week: "W26", fulfill: 1.18, velocity: 1.07, accuracy: 90.1, payment: 88.4 },
  { week: "W27", fulfill: 1.21, velocity: 1.10, accuracy: 91.8, payment: 89.6 },
];

export const CALIBRATION_TRUTH = [
  { dealerId: "A", estimated: 153, truth: 156 },
  { dealerId: "B", estimated: 121, truth: 116 },
  { dealerId: "C", estimated: 104, truth: 75 },
  { dealerId: "D", estimated: 70, truth: 66 },
  { dealerId: "E", estimated: 162, truth: 154 },
  { dealerId: "F", estimated: 88, truth: 84 },
];

export const SIMULATION_START_DATE = "2026-07-06T00:00:00+08:00";

export function formatSimulationDate(date: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${weekdays[date.getDay()]}`;
}
