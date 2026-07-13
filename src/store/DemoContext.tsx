"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { allocate } from "@/src/core/allocation";
import { generatePlanComparisons } from "@/src/core/metrics";
import {
  calibrateInventory,
  classifyInventoryHealth,
} from "@/src/core/inventory";
import {
  getScenario,
  getScenarioSku,
  getScenarioSkuOptions,
} from "@/src/core/scenarios";
import {
  createLockOrder,
  transitionLock,
} from "@/src/core/lockStateMachine";
import type {
  AllocationParams,
  AllocationPlanComparison,
  AllocationPlanId,
  AllocationScenarioId,
  AllocationSummary,
  Dealer,
  LockOrder,
  ScenarioSkuProfile,
} from "@/src/core/types";
import {
  DASHBOARD_HISTORY,
  CALIBRATION_TRUTH,
  SIMULATION_START_DATE,
  type InventoryDealerSeed,
} from "@/src/mock/seed";

export type DemoView =
  | "workbench"
  | "scenarios"
  | "locking"
  | "turnover";

export interface DemoAlert {
  id: string;
  level: "info" | "warning" | "danger";
  time: string;
  title: string;
  detail: string;
}

export interface ToastMessage {
  id: number;
  title: string;
  detail: string;
}

export interface FactorOverrides {
  season: boolean;
  scarcity: boolean;
  velocity: boolean;
  fulfillment: boolean;
  inventory: boolean;
}

interface DemoContextValue {
  view: DemoView;
  setView: (view: DemoView) => void;
  scenarioId: AllocationScenarioId;
  scenarioName: string;
  scenarioDescription: string;
  sku: string;
  activeSku: ScenarioSkuProfile;
  availableSkus: ScenarioSkuProfile[];
  setSku: (sku: string) => void;
  dealers: Dealer[];
  params: AllocationParams;
  allocation: AllocationSummary;
  plans: AllocationPlanComparison[];
  selectedPlan: AllocationPlanId;
  simulationDate: Date;
  runningStage: number | null;
  dayRunCount: number;
  releasedPool: number;
  lockOrders: LockOrder[];
  inventorySeeds: InventoryDealerSeed[];
  calibrationOpen: boolean;
  alerts: DemoAlert[];
  history: typeof DASHBOARD_HISTORY;
  factorOverrides: FactorOverrides;
  inventoryFactor: number;
  shotMode: boolean;
  shotPreset: string;
  toast: ToastMessage | null;
  setScenario: (id: AllocationScenarioId) => void;
  updateParams: (patch: Partial<AllocationParams>) => void;
  updateDealer: (dealerId: string, patch: Partial<Dealer>) => void;
  adoptPlan: (id: AllocationPlanId) => void;
  writeBackSap: () => void;
  requestOrderLock: (orderId: string) => void;
  confirmOrder: (orderId: string) => void;
  waiveOrder: (orderId: string) => void;
  timeoutOrder: (orderId: string) => void;
  runDay: () => Promise<void>;
  fastForwardMonday: () => void;
  resetDemo: () => void;
  openCalibration: () => void;
  closeCalibration: () => void;
  applyCalibration: () => void;
  setFactorOverride: (key: keyof FactorOverrides, value: boolean) => void;
  updateInventoryFactor: (value: number) => void;
  rollbackWeights: () => void;
  applyShotPreset: (preset: string) => void;
  notify: (title: string, detail: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function buildLockOrders(
  allocation: AllocationSummary,
  dealers: readonly Dealer[],
  sku: string,
  now: number,
  seedStatuses: boolean,
): LockOrder[] {
  const dealerMap = new Map(dealers.map((dealer) => [dealer.id, dealer]));
  const orders = allocation.results
    .filter((result) => result.finalAlloc > 0)
    .map((result, index) =>
      createLockOrder({
        id: `LOCK-${String(index + 1).padStart(3, "0")}-${result.dealerId}`,
        dealerId: result.dealerId,
        dealerName: dealerMap.get(result.dealerId)?.name ?? result.dealerId,
        sku,
        allocatedUnits: result.finalAlloc,
        createdAt: now + index * 1_000,
      }),
    );

  if (!seedStatuses || orders.length === 0) return orders;

  return orders.map((order, index) => {
    if (index === 0) {
      return transitionLock(order, {
        type: "REQUEST_LOCK",
        now: now + 10_000,
        creditCapUnits: order.allocatedUnits,
        ttlMs: 60_000,
      }).order;
    }
    if (index === orders.length - 1 && orders.length > 2) {
      const locked = transitionLock(order, {
        type: "REQUEST_LOCK",
        now: now + 8_000,
        creditCapUnits: order.allocatedUnits,
        ttlMs: 60_000,
      }).order;
      return transitionLock(locked, {
        type: "CONFIRM_PAYMENT",
        now: now + 12_000,
      }).order;
    }
    return order;
  });
}

function timeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildInventorySeedsForSku(
  profile: ScenarioSkuProfile,
  allocation: AllocationSummary,
): InventoryDealerSeed[] {
  const allocationByDealer = new Map(
    allocation.results.map((result) => [result.dealerId, result.finalAlloc]),
  );

  return profile.dealers.map((dealer, index) => {
    const inboundAllocation = allocationByDealer.get(dealer.id) ?? 0;
    const estimatedDailySellThrough = Number(
      Math.max(0.5, (dealer.demand / 10) * dealer.velocity).toFixed(1),
    );
    const endingInventory = Number(
      Math.max(0, dealer.inventory + inboundAllocation - estimatedDailySellThrough).toFixed(1),
    );
    const monthlyAverageAllocation = Math.max(1, Math.round(dealer.demand * 1.6));
    const headquartersTurnoverWeeks = Number(
      (endingInventory / Math.max(1, monthlyAverageAllocation / 4.345) + (index % 2 ? 0.15 : -0.1)).toFixed(1),
    );

    return {
      dealerId: dealer.id,
      dealerName: dealer.name,
      beginningInventory: dealer.inventory,
      inboundAllocation,
      endingInventory,
      currentInventory: endingInventory,
      monthlyAverageAllocation,
      lastTruthInventory: dealer.inventory,
      estimatedDailySellThrough,
      confidence: dealer.inventoryConfidence,
      healthTag: dealer.healthTag,
      headquartersTurnoverWeeks: Math.max(0.2, headquartersTurnoverWeeks),
    };
  });
}

function buildAlertsForSku(profile: ScenarioSkuProfile): DemoAlert[] {
  const creditDealer = profile.dealers.find((item) => item.creditCapUnits < item.demand);
  const untrustedDealer = profile.dealers.find((item) => item.inventoryConfidence === "untrusted");
  const alerts: DemoAlert[] = [
    {
      id: `ready-${profile.id}`,
      level: "info",
      time: "09:05",
      title: `${profile.name} 当日分货池就绪`,
      detail: `已载入 ${profile.dealers.length} 家渠道的独立需求、额度、动销与库存快照。`,
    },
  ];
  if (creditDealer) {
    alerts.unshift({
      id: `credit-${profile.id}`,
      level: "warning",
      time: "09:42",
      title: `${creditDealer.name} 额度低于需求`,
      detail: "分货与锁单阶段都会执行额度硬约束，超出部分进入回流池。",
    });
  }
  if (untrustedDealer) {
    alerts.unshift({
      id: `confidence-${profile.id}`,
      level: "danger",
      time: "09:28",
      title: `${untrustedDealer.name} 库存估算不可信`,
      detail: "本轮只参与公平层，不接受效率加配。",
    });
  }
  return alerts.slice(0, 6);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const initialScenario = useMemo(() => getScenario("ppt"), []);
  const initialSku = useMemo(() => getScenarioSku("ppt"), []);
  const initialDate = useMemo(() => new Date(SIMULATION_START_DATE), []);

  const [view, setView] = useState<DemoView>("workbench");
  const [scenarioId, setScenarioId] = useState<AllocationScenarioId>("ppt");
  const [scenarioName, setScenarioName] = useState(initialScenario.name);
  const [sku, setSkuId] = useState(initialSku.id);
  const [dealers, setDealers] = useState<Dealer[]>(initialSku.dealers);
  const [params, setParams] = useState<AllocationParams>(initialSku.params);
  const [selectedPlan, setSelectedPlan] = useState<AllocationPlanId>("balanced");
  const [simulationDate, setSimulationDate] = useState(initialDate);
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [dayRunCount, setDayRunCount] = useState(0);
  const [releasedPool, setReleasedPool] = useState(0);
  const [inventorySeeds, setInventorySeeds] = useState<InventoryDealerSeed[]>(() => {
    const firstAllocation = allocate(initialSku.dealers, initialSku.params);
    return buildInventorySeedsForSku(initialSku, firstAllocation);
  });
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [alerts, setAlerts] = useState<DemoAlert[]>(() => buildAlertsForSku(initialSku));
  const [history, setHistory] = useState(DASHBOARD_HISTORY);
  const [factorOverrides, setFactorOverrides] = useState<FactorOverrides>({
    season: false,
    scarcity: false,
    velocity: false,
    fulfillment: false,
    inventory: false,
  });
  const [inventoryFactor, setInventoryFactor] = useState(1);
  const [shotMode, setShotMode] = useState(false);
  const [shotPreset, setShotPreset] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const runningRef = useRef(false);

  const allocation = useMemo(() => allocate(dealers, params), [dealers, params]);
  const activeSku = useMemo(
    () => getScenarioSku(scenarioId, sku),
    [scenarioId, sku],
  );
  const availableSkus = useMemo(
    () => getScenarioSkuOptions(scenarioId),
    [scenarioId],
  );
  const scenarioDescription = useMemo(
    () => getScenario(scenarioId).description,
    [scenarioId],
  );
  const plans = useMemo(
    () => generatePlanComparisons(dealers, params),
    [dealers, params],
  );
  const [lockOrders, setLockOrders] = useState<LockOrder[]>(() => {
    const firstAllocation = allocate(initialSku.dealers, initialSku.params);
    return buildLockOrders(
      firstAllocation,
      initialSku.dealers,
      initialSku.name,
      initialDate.getTime(),
      true,
    );
  });

  const notify = useCallback((title: string, detail: string) => {
    const message = { id: Date.now(), title, detail };
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current?.id === message.id ? null : current));
    }, 3_500);
  }, []);

  const setScenario = useCallback((id: AllocationScenarioId) => {
    const next = getScenario(id);
    const retainedSku = next.skus.some((item) => item.id === sku) ? sku : next.sku;
    const nextSku = getScenarioSku(id, retainedSku);
    setScenarioId(id);
    setScenarioName(next.name);
    setSkuId(nextSku.id);
    setDealers(nextSku.dealers);
    setParams(nextSku.params);
    setInventoryFactor(1);
    setFactorOverrides({
      season: false,
      scarcity: false,
      velocity: false,
      fulfillment: false,
      inventory: false,
    });
    setSelectedPlan("balanced");
    setReleasedPool(0);
    const resetDate = new Date(SIMULATION_START_DATE);
    setSimulationDate(resetDate);
    const nextAllocation = allocate(nextSku.dealers, nextSku.params);
    setInventorySeeds(buildInventorySeedsForSku(nextSku, nextAllocation));
    setAlerts(buildAlertsForSku(nextSku));
    setLockOrders(buildLockOrders(nextAllocation, nextSku.dealers, nextSku.name, resetDate.getTime(), true));
    setDayRunCount(0);
  }, [sku]);

  const selectSku = useCallback((nextSkuId: string) => {
    if (nextSkuId === sku) return;
    const nextSku = getScenarioSku(scenarioId, nextSkuId);
    const resetDate = new Date(SIMULATION_START_DATE);
    const nextAllocation = allocate(nextSku.dealers, nextSku.params);
    setSkuId(nextSku.id);
    setDealers(nextSku.dealers);
    setParams(nextSku.params);
    setSelectedPlan("balanced");
    setSimulationDate(resetDate);
    setDayRunCount(0);
    setReleasedPool(0);
    setInventoryFactor(1);
    setInventorySeeds(buildInventorySeedsForSku(nextSku, nextAllocation));
    setAlerts(buildAlertsForSku(nextSku));
    setFactorOverrides({
      season: false,
      scarcity: false,
      velocity: false,
      fulfillment: false,
      inventory: false,
    });
    setLockOrders(buildLockOrders(nextAllocation, nextSku.dealers, nextSku.name, resetDate.getTime(), true));
    notify(
      "SKU 数据集已切换",
      `${nextSku.name}：${nextSku.dealers.length} 家渠道、可分 ${nextSku.params.supply} 台，全部指标已按独立快照重算。`,
    );
  }, [notify, scenarioId, sku]);

  const updateParams = useCallback((patch: Partial<AllocationParams>) => {
    setParams((current) => {
      const next = { ...current };
      if (patch.supply !== undefined && Number.isFinite(patch.supply) && patch.supply >= 0) {
        next.supply = patch.supply;
      }
      if (
        patch.fairBudgetRatio !== undefined &&
        Number.isFinite(patch.fairBudgetRatio) &&
        patch.fairBudgetRatio >= 0
      ) {
        next.fairBudgetRatio = Math.min(1, patch.fairBudgetRatio);
      }
      if (
        patch.seasonFactor !== undefined &&
        Number.isFinite(patch.seasonFactor) &&
        patch.seasonFactor >= 0
      ) {
        next.seasonFactor = patch.seasonFactor;
      }
      if (patch.scarcity !== undefined && Number.isFinite(patch.scarcity) && patch.scarcity >= 0) {
        next.scarcity = Math.min(1, patch.scarcity);
      }
      return next;
    });
  }, []);

  const updateDealer = useCallback((dealerId: string, patch: Partial<Dealer>) => {
    setDealers((current) =>
      current.map((dealer) => {
        if (dealer.id !== dealerId) return dealer;
        const next = { ...dealer };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.inventoryConfidence !== undefined) {
          next.inventoryConfidence = patch.inventoryConfidence;
        }
        if (patch.healthTag !== undefined) next.healthTag = patch.healthTag;
        const numericKeys: Array<
          "demand" | "creditCapUnits" | "fulfillWeight" | "velocity" | "inventory"
        > = ["demand", "creditCapUnits", "fulfillWeight", "velocity", "inventory"];
        for (const key of numericKeys) {
          const value = patch[key];
          if (value !== undefined && Number.isFinite(value) && value >= 0) {
            next[key] = value;
          }
        }
        return next;
      }),
    );
  }, []);

  const adoptPlan = useCallback(
    (id: AllocationPlanId) => {
      const plan = plans.find((candidate) => candidate.id === id);
      if (!plan) return;
      setParams(plan.params);
      setSelectedPlan(id);
      setLockOrders(
        buildLockOrders(
          plan.allocation,
          dealers,
          activeSku.name,
          simulationDate.getTime() + dayRunCount * 20_000,
          false,
        ),
      );
      setView("workbench");
      notify("方案已采用", `${plan.name} 已同步到分货沙盘；确认后可模拟回写锁单。`);
    },
    [activeSku.name, dayRunCount, dealers, notify, plans, simulationDate],
  );

  const writeBackSap = useCallback(() => {
    const now = simulationDate.getTime() + dayRunCount * 20_000;
    setLockOrders(buildLockOrders(allocation, dealers, activeSku.name, now, false));
    setView("locking");
    notify("模拟回写成功", "已模拟调用产品分配 RFC，分配结果已进入待锁单队列。 ");
  }, [activeSku.name, allocation, dayRunCount, dealers, notify, simulationDate]);

  const applyLockTransition = useCallback(
    (orderId: string, type: "request" | "confirm" | "waive" | "timeout") => {
      let released = 0;
      let transitionMessage = "";
      const next = lockOrders.map((order) => {
        if (order.id !== orderId) return order;
        const now = simulationDate.getTime() + order.auditTrail.length * 1_000;
        let result;
        if (type === "request") {
          const realtimeCredit =
            order.dealerId === "B"
              ? Math.max(0, Math.floor(order.allocatedUnits * 0.64))
              : order.dealerId === "F"
                ? 0
                : order.allocatedUnits;
          result = transitionLock(order, {
            type: "REQUEST_LOCK",
            now,
            creditCapUnits: realtimeCredit,
            ttlMs: 60_000,
          });
        } else if (type === "confirm") {
          result = transitionLock(order, { type: "CONFIRM_PAYMENT", now });
        } else if (type === "waive") {
          result = transitionLock(order, { type: "WAIVE", now });
        } else {
          result = transitionLock(order, {
            type: "TICK",
            now: (order.softLockExpiresAt ?? now) + 1,
          });
        }
        released += result.releasedToSupply;
        transitionMessage = result.message;
        return result.order;
      });
      setLockOrders(next);
      if (released > 0) setReleasedPool((pool) => pool + released);
      if (transitionMessage) notify("锁单状态已更新", transitionMessage);
    },
    [lockOrders, notify, simulationDate],
  );

  const requestOrderLock = useCallback(
    (orderId: string) => applyLockTransition(orderId, "request"),
    [applyLockTransition],
  );
  const confirmOrder = useCallback(
    (orderId: string) => applyLockTransition(orderId, "confirm"),
    [applyLockTransition],
  );
  const waiveOrder = useCallback(
    (orderId: string) => applyLockTransition(orderId, "waive"),
    [applyLockTransition],
  );
  const timeoutOrder = useCallback(
    (orderId: string) => applyLockTransition(orderId, "timeout"),
    [applyLockTransition],
  );

  const runDay = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (let stage = 0; stage < 4; stage += 1) {
        setRunningStage(stage);
        await delay(320);
      }
      const nextDate = new Date(simulationDate);
      nextDate.setDate(nextDate.getDate() + 1);

      let dayReleased = 0;
      const advancedOrders = lockOrders.map((order) => {
        if (order.status !== "SOFT_LOCKED") return order;
        const result = transitionLock(order, {
          type: "TICK",
          now: nextDate.getTime(),
        });
        dayReleased += result.releasedToSupply;
        return result.order;
      });
      const confirmedUnits = advancedOrders
        .filter((order) => order.status === "CONFIRMED")
        .reduce((sum, order) => sum + order.lockedUnits, 0);
      setLockOrders(advancedOrders);
      if (dayReleased > 0) setReleasedPool((pool) => pool + dayReleased);
      setSimulationDate(nextDate);
      setDayRunCount((count) => count + 1);
      setInventorySeeds((current) => {
        const inboundByDealer = new Map(
          allocation.results.map((result) => [result.dealerId, result.finalAlloc]),
        );
        return current.map((seed) => {
          const beginningInventory = seed.currentInventory;
          const inboundAllocation = inboundByDealer.get(seed.dealerId) ?? 0;
          const endingInventory = Math.max(
            0,
            Number(
              (
                beginningInventory +
                inboundAllocation -
                seed.estimatedDailySellThrough
              ).toFixed(1),
            ),
          );
          return {
            ...seed,
            beginningInventory,
            inboundAllocation,
            endingInventory,
            currentInventory: endingInventory,
          };
        });
      });
      setHistory((current) => {
        const day = `${String(nextDate.getMonth() + 1).padStart(2, "0")}/${String(nextDate.getDate()).padStart(2, "0")}`;
        return [
          ...current.slice(-13),
          { day, allocated: allocation.totalAllocated, paid: confirmedUnits },
        ];
      });
      if (dayReleased > 0) {
        setAlerts((current) => [
          {
            id: `timeout-${nextDate.getTime()}`,
            level: "warning" as const,
            time: timeLabel(nextDate),
            title: `软锁超时释放 ${dayReleased} 台`,
            detail: "货量已进入回流可分配池，并在分货沙盘显示。",
          },
          ...current,
        ].slice(0, 6));
      }
      notify("日度闭环完成", `已推进至 ${nextDate.toLocaleDateString("zh-CN")}，分货、锁单、库存和看板已联动刷新。`);
    } finally {
      setRunningStage(null);
      runningRef.current = false;
    }
  }, [allocation, lockOrders, notify, simulationDate]);

  const fastForwardMonday = useCallback(() => {
    const next = new Date(simulationDate);
    const distance = ((8 - next.getDay()) % 7) || 7;
    next.setDate(next.getDate() + distance);
    setSimulationDate(next);
    setCalibrationOpen(true);
    notify("已到周一真值日", "库存真值快照到达，正在对比估算偏差并准备周初自校准。 ");
  }, [notify, simulationDate]);

  const applyCalibration = useCallback(() => {
    const truthByDealer = new Map(CALIBRATION_TRUTH.map((row) => [row.dealerId, row]));
    const seedByDealer = new Map(inventorySeeds.map((seed) => [seed.dealerId, seed]));
    const resultByDealer = new Map(
      inventorySeeds.flatMap((seed) => {
        const truth = truthByDealer.get(seed.dealerId);
        if (!truth) return [];
        return [[
          seed.dealerId,
          calibrateInventory({
            estimatedInventory: truth.estimated,
            truthInventory: truth.truth,
            previousVelocity: seed.estimatedDailySellThrough,
            thresholdUnits: 12,
          }),
        ]] as const;
      }),
    );
    const untrustedIds = [...resultByDealer.entries()]
      .filter(([, result]) => !result.trusted)
      .map(([dealerId]) => dealerId);

    setInventorySeeds((current) =>
      current.map((seed) => {
        const truth = truthByDealer.get(seed.dealerId);
        const result = resultByDealer.get(seed.dealerId);
        if (!truth || !result) return seed;
        return {
          ...seed,
          beginningInventory: truth.truth,
          inboundAllocation: 0,
          endingInventory: truth.truth,
          currentInventory: truth.truth,
          lastTruthInventory: truth.truth,
          estimatedDailySellThrough: result.nextVelocity,
          confidence: result.confidence,
          healthTag: classifyInventoryHealth(
            truth.truth,
            seed.monthlyAverageAllocation,
          ).tag,
        };
      }),
    );
    setDealers((current) =>
      current.map((dealer) => {
        const truth = truthByDealer.get(dealer.id);
        const seed = seedByDealer.get(dealer.id);
        const result = resultByDealer.get(dealer.id);
        if (!truth || !seed || !result) return dealer;
        const velocityRatio =
          seed.estimatedDailySellThrough > 0
            ? result.nextVelocity / seed.estimatedDailySellThrough
            : 1;
        return {
          ...dealer,
          velocity: Number((dealer.velocity * velocityRatio).toFixed(3)),
          inventory: truth.truth,
          inventoryConfidence: result.confidence,
          healthTag: classifyInventoryHealth(
            truth.truth,
            seed.monthlyAverageAllocation,
          ).tag,
        };
      }),
    );
    setCalibrationOpen(false);
    setAlerts((current) => [
      {
        id: `calibration-${simulationDate.getTime()}`,
        level: "danger" as const,
        time: "08:05",
        title: "周初校准发现异常偏差",
        detail: `${untrustedIds.join("、")} 的真值偏差超过阈值，已标记为不可信；下一轮只走公平兜底。`,
      },
      ...current,
    ].slice(0, 6));
    notify(
      "周初自校准完成",
      `${resultByDealer.size - untrustedIds.length} 家完成动销微调，${untrustedIds.length} 家进入保底模式。`,
    );
  }, [inventorySeeds, notify, simulationDate]);

  const setFactorOverride = useCallback((key: keyof FactorOverrides, value: boolean) => {
    setFactorOverrides((current) => ({ ...current, [key]: value }));
  }, []);

  const updateInventoryFactor = useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || value < 0) return;
      const bounded = Math.min(1.4, Math.max(0.6, value));
      const ratio = bounded / Math.max(0.01, inventoryFactor);
      setDealers((current) =>
        current.map((dealer) => ({
          ...dealer,
          velocity: Number(
            (
              dealer.velocity *
              (dealer.healthTag === "stockout_risk"
                ? ratio
                : dealer.healthTag === "overstock"
                  ? 1 / ratio
                  : 1)
            ).toFixed(3),
          ),
        })),
      );
      setInventoryFactor(bounded);
    },
    [inventoryFactor],
  );

  const rollbackWeights = useCallback(() => {
    const baseline = getScenarioSku(scenarioId, sku);
    setParams(baseline.params);
    setDealers(baseline.dealers);
    setInventoryFactor(1);
    setSelectedPlan("balanced");
    setFactorOverrides({
      season: false,
      scarcity: false,
      velocity: false,
      fulfillment: false,
      inventory: false,
    });
    notify("已回退人工配置", "动态权重已恢复到当前预置场景的可复现基线版本。 ");
  }, [notify, scenarioId, sku]);

  const applyShotPreset = useCallback((preset: string) => {
    const reset = getScenario("ppt");
    const resetSku = getScenarioSku("ppt", reset.sku);
    const date = new Date(SIMULATION_START_DATE);
    const resetAllocation = allocate(resetSku.dealers, resetSku.params);
    setShotMode(true);
    setShotPreset(preset);
    setScenarioId("ppt");
    setScenarioName(reset.name);
    setSkuId(resetSku.id);
    setDealers(resetSku.dealers);
    setParams(resetSku.params);
    setSelectedPlan("balanced");
    setSimulationDate(date);
    setReleasedPool(0);
    setInventorySeeds(buildInventorySeedsForSku(resetSku, resetAllocation));
    setAlerts(buildAlertsForSku(resetSku));
    setCalibrationOpen(false);
    setFactorOverrides({
      season: false,
      scarcity: false,
      velocity: false,
      fulfillment: false,
      inventory: false,
    });

    if (preset === "scenarios") {
      setView("scenarios");
      setLockOrders(buildLockOrders(resetAllocation, resetSku.dealers, resetSku.name, date.getTime(), true));
      return;
    }

    if (preset === "locking-timeout") {
      const orders = buildLockOrders(
        resetAllocation,
        resetSku.dealers,
        resetSku.name,
        date.getTime(),
        false,
      ).map((order) => {
        if (order.dealerId === "A") {
          return transitionLock(order, {
            type: "REQUEST_LOCK",
            now: date.getTime() + 10_000,
            creditCapUnits: order.allocatedUnits,
            ttlMs: 60_000,
          }).order;
        }
        if (order.dealerId === "B") {
          const partial = transitionLock(order, {
            type: "REQUEST_LOCK",
            now: date.getTime() + 8_000,
            creditCapUnits: 32,
            ttlMs: 60_000,
          }).order;
          return transitionLock(partial, {
            type: "TICK",
            now: (partial.softLockExpiresAt ?? date.getTime()) + 1,
          }).order;
        }
        const locked = transitionLock(order, {
          type: "REQUEST_LOCK",
          now: date.getTime() + 8_000,
          creditCapUnits: order.allocatedUnits,
          ttlMs: 60_000,
        }).order;
        return transitionLock(locked, {
          type: "CONFIRM_PAYMENT",
          now: date.getTime() + 12_000,
        }).order;
      });
      setLockOrders(orders);
      setReleasedPool(50);
      setView("locking");
      return;
    }

    if (preset === "turnover-band" || preset === "calibration") {
      setView("turnover");
      setCalibrationOpen(preset === "calibration");
      setLockOrders(buildLockOrders(resetAllocation, resetSku.dealers, resetSku.name, date.getTime(), true));
      return;
    }

    setView("workbench");
    setLockOrders(buildLockOrders(resetAllocation, resetSku.dealers, resetSku.name, date.getTime(), true));
  }, []);

  const resetDemo = useCallback(() => {
    const reset = getScenario("ppt");
    const resetSku = getScenarioSku("ppt", reset.sku);
    const date = new Date(SIMULATION_START_DATE);
    const resetAllocation = allocate(resetSku.dealers, resetSku.params);
    setView("workbench");
    setScenarioId("ppt");
    setScenarioName(reset.name);
    setSkuId(resetSku.id);
    setDealers(resetSku.dealers);
    setParams(resetSku.params);
    setSelectedPlan("balanced");
    setSimulationDate(date);
    setRunningStage(null);
    setDayRunCount(0);
    setReleasedPool(0);
    setInventorySeeds(buildInventorySeedsForSku(resetSku, resetAllocation));
    setCalibrationOpen(false);
    setAlerts(buildAlertsForSku(resetSku));
    setHistory(DASHBOARD_HISTORY);
    setInventoryFactor(1);
    setShotMode(false);
    setShotPreset("");
    setFactorOverrides({
      season: false,
      scarcity: false,
      velocity: false,
      fulfillment: false,
      inventory: false,
    });
    setLockOrders(buildLockOrders(resetAllocation, resetSku.dealers, resetSku.name, date.getTime(), true));
    notify("演示已重置", "已恢复 PPT 示意场景、固定 seed、模拟时钟与全部状态。 ");
  }, [notify]);

  const value: DemoContextValue = {
    view,
    setView,
    scenarioId,
    scenarioName,
    scenarioDescription,
    sku,
    activeSku,
    availableSkus,
    setSku: selectSku,
    dealers,
    params,
    allocation,
    plans,
    selectedPlan,
    simulationDate,
    runningStage,
    dayRunCount,
    releasedPool,
    lockOrders,
    inventorySeeds,
    calibrationOpen,
    alerts,
    history,
    factorOverrides,
    inventoryFactor,
    shotMode,
    shotPreset,
    toast,
    setScenario,
    updateParams,
    updateDealer,
    adoptPlan,
    writeBackSap,
    requestOrderLock,
    confirmOrder,
    waiveOrder,
    timeoutOrder,
    runDay,
    fastForwardMonday,
    resetDemo,
    openCalibration: () => setCalibrationOpen(true),
    closeCalibration: () => setCalibrationOpen(false),
    applyCalibration,
    setFactorOverride,
    updateInventoryFactor,
    rollbackWeights,
    applyShotPreset,
    notify,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
