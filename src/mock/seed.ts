import type { InventoryConfidence, InventoryHealthTag } from "@/src/core/types";

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

export const INITIAL_ALERTS = [
  { id: "alert-credit", level: "warning" as const, time: "09:42", title: "中原电子-B 实时余额下降", detail: "锁单前置校验将按实时可用余额执行，预计部分锁单。" },
  { id: "alert-confidence", level: "danger" as const, time: "09:28", title: "东南家电-F 库存估算不可信", detail: "真值与估算偏差超过阈值，本轮只走公平兜底。" },
  { id: "alert-flow", level: "info" as const, time: "09:05", title: "WH-1000XM6 当日分货池就绪", detail: "已校验固定 seed、资金快照与周库存真值。" },
];

export const SIMULATION_START_DATE = "2026-07-06T00:00:00+08:00";

export function formatSimulationDate(date: Date): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${weekdays[date.getDay()]}`;
}
