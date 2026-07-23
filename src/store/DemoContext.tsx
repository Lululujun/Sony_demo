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
import {
  commitConfiguration,
  createConfigurationState,
  rollbackConfiguration,
  type ConfigAuditEntry,
  type ConfigurationState,
  type DemoConfiguration,
  type RatioWeights,
} from "@/src/core/configuration";
import {
  runDiagnostics,
  type DiagnosticAlert,
  type DiagnosticExecutionTask,
} from "@/src/core/diagnostics";
import { type DemoRuntimeMode } from "@/src/core/demoClock";
import {
  calibrateInventory,
  classifyInventoryHealth,
} from "@/src/core/inventory";
import {
  decideLayering,
  DEFAULT_LAYERING_CONFIG,
  type LayeringConfig,
  type LayeringSummary,
  type TierId,
  type TierNode,
} from "@/src/core/layering";
import { generatePlanComparisons } from "@/src/core/metrics";
import {
  getScenario,
  getScenarioSku,
  getScenarioSkuOptions,
} from "@/src/core/scenarios";
import { isSkipped, type ColorVariant } from "@/src/core/specialMaterials";
import type {
  AllocationParams,
  AllocationPlanComparison,
  AllocationPlanId,
  AllocationScenarioId,
  AllocationSummary,
  Dealer,
  ScenarioSkuProfile,
} from "@/src/core/types";
import {
  CALIBRATION_TRUTH,
  COLOR_VARIANTS,
  DEALER_BUSINESS_PROFILES,
  ORG_TREE,
  SIMULATION_START_DATE,
  SKIP_LIST,
  type DealerBusinessProfile,
  type InventoryDealerSeed,
} from "@/src/mock/seed";

export type DemoView =
  | "layering"
  | "workbench"
  | "scenarios"
  | "ratios"
  | "turnover"
  | "console";

export type TriggerMode = "arrival" | "scheduled";
export type LayeringScenario = "p1" | "p2";

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

export interface RatioConfig {
  weights: RatioWeights;
  wklyRatioByCategory: Record<string, number>;
  kBig: number;
  bufferRatio: number;
  version: number;
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
  setScenario: (id: AllocationScenarioId) => void;
  dealers: Dealer[];
  dealerProfiles: readonly DealerBusinessProfile[];
  params: AllocationParams;
  allocation: AllocationSummary;
  plans: AllocationPlanComparison[];
  selectedPlan: AllocationPlanId;
  simulationDate: Date;
  runningStage: number | null;
  triggerMode: TriggerMode;
  setTriggerMode: (mode: TriggerMode) => void;
  triggerAllocation: () => Promise<void>;
  inventorySeeds: InventoryDealerSeed[];
  calibrationOpen: boolean;
  alerts: DiagnosticAlert[];
  factorOverrides: FactorOverrides;
  inventoryFactor: number;
  runtimeMode: DemoRuntimeMode;
  shotMode: boolean;
  shotPreset: string;
  toast: ToastMessage | null;
  updateParams: (patch: Partial<AllocationParams>) => void;
  updateDealer: (dealerId: string, patch: Partial<Dealer>) => void;
  adoptPlan: (id: AllocationPlanId) => void;
  writeBackAllocationRfc: () => void;
  fastForwardMonday: () => void;
  resetDemo: () => void;
  openCalibration: () => void;
  closeCalibration: () => void;
  applyCalibration: () => void;
  setFactorOverride: (key: keyof FactorOverrides, value: boolean) => void;
  updateInventoryFactor: (value: number) => void;
  rollbackWeights: () => void;
  configureRuntimeMode: (mode: DemoRuntimeMode) => void;
  applyShotPreset: (preset: string) => void;
  notify: (title: string, detail: string) => void;
  layeringScenario: LayeringScenario;
  setLayeringScenario: (scenario: LayeringScenario) => void;
  layeringConfig: LayeringConfig;
  updateLayerThreshold: (tier: TierId, value: number) => void;
  layeringDecision: LayeringSummary;
  orgTree: TierNode[];
  layeringSupply: number;
  layeringStopsAtHq: boolean;
  ratioConfig: RatioConfig;
  updateRatioWeights: (patch: Partial<RatioWeights>) => void;
  updateWklyRatio: (category: string, value: number) => void;
  toggleBigCustomer: (dealerId: string) => void;
  updateBigCustomerK: (value: number) => void;
  bigCustomers: Record<string, boolean>;
  colorVariants: ColorVariant[];
  updateColorVariantDo: (materialCode: string, value: number) => void;
  skipList: string[];
  addSkipMaterial: (materialCode: string) => void;
  removeSkipMaterial: (materialCode: string) => void;
  isCurrentSkuSkipped: boolean;
  promptText: string;
  updatePromptText: (value: string) => void;
  configAuditLog: ConfigAuditEntry[];
  rollbackConfig: () => void;
  drillDownTarget: string | null;
  clearDrillDownTarget: () => void;
  drillDownDiagnostic: (alert: DiagnosticAlert) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const DEFAULT_FACTORS: FactorOverrides = {
  season: false,
  scarcity: false,
  velocity: false,
  fulfillment: false,
  inventory: false,
};

const INITIAL_CONFIGURATION: DemoConfiguration = {
  version: 0,
  layeringConfig: {
    stopThresholds: { ...DEFAULT_LAYERING_CONFIG.stopThresholds },
  },
  ratioWeights: {
    supplyDemand: 0.4,
    operation: 0.35,
    strategy: 0.25,
  },
  wklyRatiosByCategory: {
    旗舰降噪耳机: 0.25,
    全画幅微单: 0.22,
    游戏主机: 0.3,
    "OLED 电视": 0.2,
    真无线耳机: 0.25,
    便携蓝牙音箱: 0.24,
  },
  kBig: 1.2,
  bufferRatio: 0.1,
  bigCustomers: { A: true, B: false, C: false, D: false, E: true, F: false },
  skipList: [...SKIP_LIST],
  colorVariants: COLOR_VARIANTS.map((variant) => ({ ...variant })),
  promptText:
    "用业务语言解释停靠层级、约束命中和分配差异，并列出可复核的参数依据。",
};

function cloneOrgTree(): TierNode[] {
  return ORG_TREE.map((node) => ({ ...node }));
}

function profileForDealer(dealerId: string): DealerBusinessProfile | undefined {
  return DEALER_BUSINESS_PROFILES.find((profile) => profile.dealerId === dealerId);
}

function enrichDealers(profile: ScenarioSkuProfile): Dealer[] {
  return profile.dealers.map((dealer) => {
    const business = profileForDealer(dealer.id);
    if (!business) return { ...dealer, category: profile.category };
    const flatWeeks = business.psiHistory12M.filter((week) => !week.isPeakSeason);
    const averageFlat =
      flatWeeks.reduce((sum, week) => sum + week.sellout, 0) /
      Math.max(1, flatWeeks.length);
    return {
      ...dealer,
      monthlyTarget: business.monthlyTarget,
      turnoverWeeks: Number((dealer.inventory / Math.max(1, averageFlat)).toFixed(2)),
      isDirectSales: business.isDirectSales,
      category: business.category,
    };
  });
}

function buildInventorySeeds(
  profile: ScenarioSkuProfile,
  allocation: AllocationSummary,
): InventoryDealerSeed[] {
  const resultByDealer = new Map(
    allocation.results.map((result) => [result.dealerId, result.finalAlloc]),
  );
  return profile.dealers.map((dealer, index) => {
    const inboundAllocation = resultByDealer.get(dealer.id) ?? 0;
    const estimatedDailySellThrough = Number(
      Math.max(0.5, (dealer.demand / 10) * dealer.velocity).toFixed(1),
    );
    const endingInventory = Number(
      Math.max(
        0,
        dealer.inventory + inboundAllocation - estimatedDailySellThrough,
      ).toFixed(1),
    );
    const monthlyAverageAllocation = Math.max(1, Math.round(dealer.demand * 1.6));
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
      headquartersTurnoverWeeks: Number(
        Math.max(
          0.2,
          endingInventory / Math.max(1, monthlyAverageAllocation / 4.345) +
            (index % 2 ? 0.15 : -0.1),
        ).toFixed(1),
      ),
    };
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(Number(value.toFixed(3)));
  return JSON.stringify(value);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const initialScenario = useMemo(() => getScenario("ppt"), []);
  const initialProfile = useMemo(() => getScenarioSku("ppt"), []);
  const initialDealers = useMemo(() => enrichDealers(initialProfile), [initialProfile]);
  const initialAllocation = useMemo(
    () => allocate(initialDealers, initialProfile.params),
    [initialDealers, initialProfile.params],
  );

  const [view, setView] = useState<DemoView>("workbench");
  const [scenarioId, setScenarioId] = useState<AllocationScenarioId>("ppt");
  const [scenarioName, setScenarioName] = useState(initialScenario.name);
  const [sku, setSkuId] = useState(initialProfile.id);
  const [dealers, setDealers] = useState<Dealer[]>(initialDealers);
  const [params, setParams] = useState<AllocationParams>(initialProfile.params);
  const [selectedPlan, setSelectedPlan] = useState<AllocationPlanId>("balanced");
  const [simulationDate, setSimulationDate] = useState(
    () => new Date(SIMULATION_START_DATE),
  );
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("arrival");
  const [inventorySeeds, setInventorySeeds] = useState<InventoryDealerSeed[]>(
    () => buildInventorySeeds(initialProfile, initialAllocation),
  );
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [factorOverrides, setFactorOverrides] =
    useState<FactorOverrides>(DEFAULT_FACTORS);
  const [inventoryFactor, setInventoryFactor] = useState(1);
  const [runtimeMode, setRuntimeMode] = useState<DemoRuntimeMode>("normal");
  const [shotPreset, setShotPreset] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [layeringScenario, setLayeringScenario] =
    useState<LayeringScenario>("p2");
  const [configuration, setConfiguration] = useState<ConfigurationState>(() =>
    createConfigurationState(INITIAL_CONFIGURATION),
  );
  const [rfcTasks, setRfcTasks] = useState<DiagnosticExecutionTask[]>([
    {
      id: "RFC-HISTORY-001",
      kind: "rfc",
      status: "failed",
      startedAtMs: new Date(SIMULATION_START_DATE).getTime() + 8 * 60 * 60 * 1_000,
      timeoutMs: 30_000,
      retryCount: 3,
      maxRetries: 3,
      traceId: "allocation-ppt-WH-1000XM6",
    },
  ]);
  const [drillDownTarget, setDrillDownTarget] = useState<string | null>(null);
  const runningRef = useRef(false);
  const toastId = useRef(0);
  const rfcSequence = useRef(1);

  const allocation = useMemo(() => allocate(dealers, params), [dealers, params]);
  const baseActiveSku = useMemo(
    () => getScenarioSku(scenarioId, sku),
    [scenarioId, sku],
  );
  const activeSku = useMemo(
    () => ({ ...baseActiveSku, params, dealers }),
    [baseActiveSku, dealers, params],
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

  const orgTree = useMemo(() => {
    const tree = cloneOrgTree();
    if (layeringScenario === "p1") {
      const root = tree.find((node) => node.parentId === null);
      if (root) {
        root.targetDemand = 200;
        root.netDemand = 200;
        root.achievementRate = 1.05;
      }
    }
    return tree;
  }, [layeringScenario]);
  const layeringSupply = layeringScenario === "p1" ? 230 : 310;
  const layeringDecision = useMemo(() => {
    const root = orgTree.find((node) => node.parentId === null);
    if (!root) throw new Error("organisation tree must contain a root");
    return decideLayering(
      root,
      orgTree,
      layeringSupply,
      configuration.current.layeringConfig,
    );
  }, [configuration.current.layeringConfig, layeringSupply, orgTree]);
  const layeringStopsAtHq =
    layeringDecision.decisions[0]?.tier === "hq" &&
    layeringDecision.decisions[0]?.stopped === true;

  const ratioConfig: RatioConfig = useMemo(
    () => ({
      weights: configuration.current.ratioWeights,
      wklyRatioByCategory: configuration.current.wklyRatiosByCategory,
      kBig: configuration.current.kBig,
      bufferRatio: configuration.current.bufferRatio,
      version: configuration.current.version,
    }),
    [configuration.current],
  );
  const isCurrentSkuSkipped = isSkipped(sku, configuration.current.skipList);

  const alerts = useMemo(() => {
    const nowMs =
      new Date(SIMULATION_START_DATE).getTime() + 9 * 60 * 60 * 1_000;
    const totalDemand = dealers.reduce((sum, dealer) => sum + dealer.demand, 0);
    const satisfied = allocation.results.reduce(
      (sum, result) => sum + Math.min(result.finalAlloc, result.demand),
      0,
    );
    return runDiagnostics({
      nowMs,
      fixedSeed: `${scenarioId}|${sku}|v${configuration.current.version}`,
      sourceFields: [
        {
          id: "mia-monthly-target",
          system: "MIA",
          field: "月度目标",
          value: dealers.reduce(
            (sum, dealer) => sum + (dealer.monthlyTarget ?? dealer.demand * 4),
            0,
          ),
          collectedAtMs: nowMs - 20 * 60 * 1_000,
          maxAgeMs: 2 * 60 * 60 * 1_000,
        },
        {
          id: "sap-credit-balance",
          system: "SAP",
          field: "货款余额",
          value: dealers.reduce((sum, dealer) => sum + dealer.creditCapUnits, 0),
          collectedAtMs: nowMs - 3 * 60 * 60 * 1_000,
          maxAgeMs: 2 * 60 * 60 * 1_000,
        },
        {
          id: "ssp-psi",
          system: "SSP",
          field: "历史 PSI",
          value: dealers.some(
            (dealer) => dealer.inventoryConfidence === "untrusted",
          )
            ? undefined
            : 52,
          collectedAtMs: nowMs - 45 * 60 * 1_000,
          maxAgeMs: 2 * 60 * 60 * 1_000,
        },
      ],
      netDemands: orgTree.map((node) => ({
        nodeId: node.id,
        netDemand: node.netDemand,
      })),
      currentAllocation: {
        traceId: `allocation-${scenarioId}-${sku}`,
        satisfactionRate: totalDemand === 0 ? 1 : satisfied / totalDemand,
        dealers: allocation.results.map((result) => ({
          dealerId: result.dealerId,
          dealerName:
            dealers.find((dealer) => dealer.id === result.dealerId)?.name ??
            result.dealerId,
          demand: result.demand,
          allocated: result.finalAlloc,
          eligible: true,
          skipped: isCurrentSkuSkipped,
        })),
      },
      hhiThreshold: 0.36,
      executionTasks: rfcTasks,
      rfcFailureRate: 0.05,
    });
  }, [
    allocation.results,
    configuration.current.version,
    dealers,
    isCurrentSkuSkipped,
    orgTree,
    rfcTasks,
    scenarioId,
    sku,
  ]);

  const notify = useCallback((title: string, detail: string) => {
    const message = { id: ++toastId.current, title, detail };
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current?.id === message.id ? null : current));
    }, 3_500);
  }, []);

  const commitConfig = useCallback(
    (
      field: string,
      oldValue: unknown,
      newValue: unknown,
      update: (current: DemoConfiguration) => DemoConfiguration,
    ) => {
      setConfiguration((state) =>
        commitConfiguration(state, update(state.current), {
          field,
          oldValue: displayValue(oldValue),
          newValue: displayValue(newValue),
          time: `09:${String(state.current.version + 1).padStart(2, "0")}`,
        }),
      );
    },
    [],
  );

  const loadProfile = useCallback(
    (nextScenarioId: AllocationScenarioId, nextSkuId: string) => {
      const profile = getScenarioSku(nextScenarioId, nextSkuId);
      const nextDealers = enrichDealers(profile);
      const nextAllocation = allocate(nextDealers, profile.params);
      setSkuId(profile.id);
      setDealers(nextDealers);
      setParams(profile.params);
      setSelectedPlan("balanced");
      setInventoryFactor(1);
      setFactorOverrides(DEFAULT_FACTORS);
      setInventorySeeds(
        buildInventorySeeds({ ...profile, dealers: nextDealers }, nextAllocation),
      );
    },
    [],
  );

  const setScenario = useCallback(
    (id: AllocationScenarioId) => {
      const scenario = getScenario(id);
      const nextSku = scenario.skus.some((item) => item.id === sku)
        ? sku
        : scenario.sku;
      setScenarioId(id);
      setScenarioName(scenario.name);
      loadProfile(id, nextSku);
    },
    [loadProfile, sku],
  );

  const setSku = useCallback(
    (nextSkuId: string) => {
      if (nextSkuId !== sku) loadProfile(scenarioId, nextSkuId);
    },
    [loadProfile, scenarioId, sku],
  );

  const updateParams = useCallback((patch: Partial<AllocationParams>) => {
    setParams((current) => ({ ...current, ...patch }));
  }, []);

  const updateDealer = useCallback(
    (dealerId: string, patch: Partial<Dealer>) => {
      setDealers((current) =>
        current.map((dealer) =>
          dealer.id === dealerId ? { ...dealer, ...patch } : dealer,
        ),
      );
    },
    [],
  );

  const adoptPlan = useCallback(
    (id: AllocationPlanId) => {
      const plan = plans.find((candidate) => candidate.id === id);
      if (!plan) return;
      setSelectedPlan(id);
      setParams(plan.params);
      notify(
        "方案已采用",
        `${plan.name} 已写入当前求解参数，供给、额度和守恒约束保持不变。`,
      );
    },
    [notify, plans],
  );

  const triggerAllocation = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const wait = runtimeMode === "shot" ? 0 : 240;
      for (let stage = 0; stage < 4; stage += 1) {
        setRunningStage(stage);
        if (wait > 0) await delay(wait);
      }
      notify(
        triggerMode === "arrival" ? "到货触发完成" : "定时批量完成",
        isCurrentSkuSkipped
          ? `${activeSku.id} 命中 Skip 清单，已转 SSP 人工分配。`
          : `已读取 MIA / SAP / SSP 快照，完成分层判断与 ${allocation.totalAllocated} 台分配求解。`,
      );
    } finally {
      setRunningStage(null);
      runningRef.current = false;
    }
  }, [
    activeSku.id,
    allocation.totalAllocated,
    isCurrentSkuSkipped,
    notify,
    runtimeMode,
    triggerMode,
  ]);

  const writeBackAllocationRfc = useCallback(() => {
    const id = `RFC-${String(++rfcSequence.current).padStart(3, "0")}`;
    setRfcTasks((current) => [
      ...current,
      {
        id,
        kind: "rfc",
        status: "success",
        startedAtMs:
          new Date(SIMULATION_START_DATE).getTime() + 9 * 60 * 60 * 1_000,
        timeoutMs: 30_000,
        retryCount: 0,
        maxRetries: 3,
        traceId: `allocation-${scenarioId}-${sku}`,
      },
    ]);
    notify(
      "SAP RFC 回写成功",
      `${allocation.totalAllocated} 台分配结果与配置版本 v${ratioConfig.version} 已提交。`,
    );
  }, [
    allocation.totalAllocated,
    notify,
    ratioConfig.version,
    scenarioId,
    sku,
  ]);

  const fastForwardMonday = useCallback(() => {
    setSimulationDate((current) => {
      const next = new Date(current);
      const distance = ((8 - next.getDay()) % 7) || 7;
      next.setDate(next.getDate() + distance);
      return next;
    });
    setCalibrationOpen(true);
    notify(
      "周一 PSI 真值已到达",
      "正在对库存估算、sellout 与置信区间执行周初校准。",
    );
  }, [notify]);

  const applyCalibration = useCallback(() => {
    const truthByDealer = new Map(
      CALIBRATION_TRUTH.map((row) => [row.dealerId, row]),
    );
    const resultByDealer = new Map(
      inventorySeeds.flatMap((seed) => {
        const truth = truthByDealer.get(seed.dealerId);
        if (!truth) return [];
        return [
          [
            seed.dealerId,
            calibrateInventory({
              estimatedInventory: truth.estimated,
              truthInventory: truth.truth,
              previousVelocity: seed.estimatedDailySellThrough,
              thresholdUnits: 12,
            }),
          ],
        ] as const;
      }),
    );
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
        const result = resultByDealer.get(dealer.id);
        if (!truth || !result) return dealer;
        return {
          ...dealer,
          inventory: truth.truth,
          inventoryConfidence: result.confidence,
        };
      }),
    );
    setCalibrationOpen(false);
    notify(
      "周初校准完成",
      "可信渠道已微调 sellout 参数，异常偏差渠道已降级为公平层保底。",
    );
  }, [inventorySeeds, notify]);

  const updateInventoryFactor = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
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
    setDealers(enrichDealers(baseline));
    setInventoryFactor(1);
    setSelectedPlan("balanced");
    setFactorOverrides(DEFAULT_FACTORS);
    notify("已恢复求解基线", "当前场景的自动参数已恢复。");
  }, [notify, scenarioId, sku]);

  const updateLayerThreshold = useCallback(
    (tier: TierId, value: number) => {
      const bounded = tier === "dealer" ? 0 : Math.min(1, Math.max(0, value));
      const oldValue = configuration.current.layeringConfig.stopThresholds[tier];
      if (oldValue === bounded) return;
      commitConfig(`${tier} 停靠阈值`, oldValue, bounded, (current) => ({
        ...current,
        layeringConfig: {
          stopThresholds: {
            ...current.layeringConfig.stopThresholds,
            [tier]: bounded,
          },
        },
      }));
    },
    [commitConfig, configuration.current.layeringConfig.stopThresholds],
  );

  const updateRatioWeights = useCallback(
    (patch: Partial<RatioWeights>) => {
      const oldValue = configuration.current.ratioWeights;
      const nextValue = { ...oldValue, ...patch };
      commitConfig("PA Plan Ratio 权重", oldValue, nextValue, (current) => ({
        ...current,
        ratioWeights: nextValue,
      }));
    },
    [commitConfig, configuration.current.ratioWeights],
  );

  const updateWklyRatio = useCallback(
    (category: string, value: number) => {
      const bounded = Math.min(1, Math.max(0, value));
      const oldValue =
        configuration.current.wklyRatiosByCategory[category] ?? 0.25;
      if (oldValue === bounded) return;
      commitConfig(
        `${category} Wkly Ratio`,
        oldValue,
        bounded,
        (current) => ({
          ...current,
          wklyRatiosByCategory: {
            ...current.wklyRatiosByCategory,
            [category]: bounded,
          },
        }),
      );
    },
    [commitConfig, configuration.current.wklyRatiosByCategory],
  );

  const toggleBigCustomer = useCallback(
    (dealerId: string) => {
      const oldValue = Boolean(configuration.current.bigCustomers[dealerId]);
      commitConfig(
        `${dealerId} 大客户标识`,
        oldValue,
        !oldValue,
        (current) => ({
          ...current,
          bigCustomers: {
            ...current.bigCustomers,
            [dealerId]: !oldValue,
          },
        }),
      );
    },
    [commitConfig, configuration.current.bigCustomers],
  );

  const updateBigCustomerK = useCallback(
    (value: number) => {
      const bounded = Math.min(3, Math.max(1, value));
      const oldValue = configuration.current.kBig;
      if (oldValue === bounded) return;
      commitConfig("大客户增益系数 kBig", oldValue, bounded, (current) => ({
        ...current,
        kBig: bounded,
      }));
    },
    [commitConfig, configuration.current.kBig],
  );

  const updateColorVariantDo = useCallback(
    (materialCode: string, value: number) => {
      const oldVariant = configuration.current.colorVariants.find(
        (variant) => variant.materialCode === materialCode,
      );
      if (!oldVariant) return;
      const bounded = Math.max(0, value);
      commitConfig(
        `${materialCode} 3M DO`,
        oldVariant.doLast3Months,
        bounded,
        (current) => ({
          ...current,
          colorVariants: current.colorVariants.map((variant) =>
            variant.materialCode === materialCode
              ? { ...variant, doLast3Months: bounded }
              : variant,
          ),
        }),
      );
    },
    [commitConfig, configuration.current.colorVariants],
  );

  const addSkipMaterial = useCallback(
    (materialCode: string) => {
      const normalized = materialCode.trim().toUpperCase();
      if (!normalized || isSkipped(normalized, configuration.current.skipList))
        return;
      commitConfig("Skip 清单", "未包含", normalized, (current) => ({
        ...current,
        skipList: [...current.skipList, normalized],
      }));
    },
    [commitConfig, configuration.current.skipList],
  );

  const removeSkipMaterial = useCallback(
    (materialCode: string) => {
      const normalized = materialCode.trim().toUpperCase();
      if (!isSkipped(normalized, configuration.current.skipList)) return;
      commitConfig("Skip 清单", normalized, "已移除", (current) => ({
        ...current,
        skipList: current.skipList.filter(
          (item) => item.toUpperCase() !== normalized,
        ),
      }));
    },
    [commitConfig, configuration.current.skipList],
  );

  const updatePromptText = useCallback(
    (value: string) => {
      const oldValue = configuration.current.promptText;
      if (oldValue === value) return;
      commitConfig("Agent 解释提示词", oldValue, value, (current) => ({
        ...current,
        promptText: value,
      }));
    },
    [commitConfig, configuration.current.promptText],
  );

  const rollbackConfig = useCallback(() => {
    setConfiguration((state) =>
      rollbackConfiguration(
        state,
        `09:${String(state.current.version + 1).padStart(2, "0")}`,
      ),
    );
    notify("配置已回滚", "已恢复上一份完整参数快照，并生成新的审计版本。");
  }, [notify]);

  const drillDownDiagnostic = useCallback((alert: DiagnosticAlert) => {
    if (!alert.drillDownRef) return;
    setDrillDownTarget(alert.drillDownRef.traceId);
    setView(alert.drillDownRef.type === "layering" ? "layering" : "workbench");
  }, []);

  const configureRuntimeMode = useCallback((mode: DemoRuntimeMode) => {
    setRuntimeMode(mode);
  }, []);

  const applyShotPreset = useCallback((preset: string) => {
    setRuntimeMode("shot");
    setShotPreset(preset);
    if (preset.startsWith("layering-")) {
      setLayeringScenario(preset === "layering-p1" ? "p1" : "p2");
      setView("layering");
    } else if (preset.startsWith("ratios-")) {
      setView("ratios");
    } else if (preset.startsWith("console-")) {
      setView("console");
    } else if (preset.startsWith("turnover-") || preset === "calibration") {
      setView("turnover");
      setCalibrationOpen(preset === "calibration");
    } else if (preset === "scenarios") {
      setView("scenarios");
    } else {
      setView("workbench");
    }
  }, []);

  const resetDemo = useCallback(() => {
    const scenario = getScenario("ppt");
    const profile = getScenarioSku("ppt", scenario.sku);
    const nextDealers = enrichDealers(profile);
    const nextAllocation = allocate(nextDealers, profile.params);
    setView("workbench");
    setScenarioId("ppt");
    setScenarioName(scenario.name);
    setSkuId(profile.id);
    setDealers(nextDealers);
    setParams(profile.params);
    setSelectedPlan("balanced");
    setSimulationDate(new Date(SIMULATION_START_DATE));
    setRunningStage(null);
    setTriggerMode("arrival");
    setInventorySeeds(
      buildInventorySeeds({ ...profile, dealers: nextDealers }, nextAllocation),
    );
    setCalibrationOpen(false);
    setFactorOverrides(DEFAULT_FACTORS);
    setInventoryFactor(1);
    setLayeringScenario("p2");
    setConfiguration(createConfigurationState(INITIAL_CONFIGURATION));
    setShotPreset("");
    setDrillDownTarget(null);
    notify("演示已重置", "已恢复固定数据快照与全部 RFP 配置基线。");
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
    setSku,
    setScenario,
    dealers,
    dealerProfiles: DEALER_BUSINESS_PROFILES,
    params,
    allocation,
    plans,
    selectedPlan,
    simulationDate,
    runningStage,
    triggerMode,
    setTriggerMode,
    triggerAllocation,
    inventorySeeds,
    calibrationOpen,
    alerts,
    factorOverrides,
    inventoryFactor,
    runtimeMode,
    shotMode: runtimeMode === "shot",
    shotPreset,
    toast,
    updateParams,
    updateDealer,
    adoptPlan,
    writeBackAllocationRfc,
    fastForwardMonday,
    resetDemo,
    openCalibration: () => setCalibrationOpen(true),
    closeCalibration: () => setCalibrationOpen(false),
    applyCalibration,
    setFactorOverride: (key, value) =>
      setFactorOverrides((current) => ({ ...current, [key]: value })),
    updateInventoryFactor,
    rollbackWeights,
    configureRuntimeMode,
    applyShotPreset,
    notify,
    layeringScenario,
    setLayeringScenario,
    layeringConfig: configuration.current.layeringConfig,
    updateLayerThreshold,
    layeringDecision,
    orgTree,
    layeringSupply,
    layeringStopsAtHq,
    ratioConfig,
    updateRatioWeights,
    updateWklyRatio,
    toggleBigCustomer,
    updateBigCustomerK,
    bigCustomers: configuration.current.bigCustomers,
    colorVariants: configuration.current.colorVariants,
    updateColorVariantDo,
    skipList: configuration.current.skipList,
    addSkipMaterial,
    removeSkipMaterial,
    isCurrentSkuSkipped,
    promptText: configuration.current.promptText,
    updatePromptText,
    configAuditLog: configuration.auditLog,
    rollbackConfig,
    drillDownTarget,
    clearDrillDownTarget: () => setDrillDownTarget(null),
    drillDownDiagnostic,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
