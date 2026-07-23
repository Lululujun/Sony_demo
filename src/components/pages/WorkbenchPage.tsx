"use client";

import {
  useEffect,
  Fragment,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Gauge,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Package,
  Play,
  RotateCcw,
  Send,
  Settings2,
  StepForward,
  X,
} from "lucide-react";
import type { AllocationScenarioId, AllocationStep, Dealer } from "@/src/core/types";
import { SCENARIOS } from "@/src/core/scenarios";
import { applyWklyRatio } from "@/src/core/ratios";
import { LEARNING_HISTORY } from "@/src/mock/seed";
import { useDemo, type FactorOverrides } from "@/src/store/DemoContext";
import { DeferredResponsiveContainer } from "@/src/components/ui/DeferredResponsiveContainer";
import { CardTitle, PageHeading, StatusPill } from "@/src/components/ui/Primitives";

const REPLAY_EVENTS = new Set<AllocationStep["event"]>([
  "PROPORTIONAL_FILL",
  "TAIL_UNIT_ASSIGNED",
  "DEMAND_CAP_REACHED",
  "CREDIT_CAP_REACHED",
  "EFFICIENCY_EXCLUDED",
]);

const PHASE_LABEL: Record<AllocationStep["phase"], string> = {
  precheck: "校验",
  fair: "公平层",
  efficiency: "效率层",
  finalize: "结果",
};

const EVENT_LABEL: Record<AllocationStep["event"], string> = {
  POOL_CREATED: "创建池",
  ELIGIBLE: "进入求解",
  INELIGIBLE: "不参与",
  PROPORTIONAL_FILL: "注入",
  TAIL_UNIT_ASSIGNED: "尾数",
  DEMAND_CAP_REACHED: "需求封顶",
  CREDIT_CAP_REACHED: "额度封顶",
  EFFICIENCY_EXCLUDED: "仅保底",
  POOL_EXHAUSTED: "池量用尽",
  UNALLOCATED: "未分完",
  RESULT: "完成",
};

function DebouncedNumberInput({
  label,
  ariaLabel,
  value,
  step = 1,
  onCommit,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const timer = useRef<number | null>(null);

  useEffect(() => setDraft(String(value)), [value]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return (
    <label className="dealer-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={draft}
        aria-label={ariaLabel ?? label}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            const parsed = Number(next);
            if (Number.isFinite(parsed) && parsed >= 0) onCommit(parsed);
          }, 300);
        }}
      />
    </label>
  );
}

function metricValue(value: number | string, unit?: string) {
  return (
    <div className="metric-value">
      <span>{value}</span>
      {unit && <sup>{unit}</sup>}
    </div>
  );
}

function frameLabel(step: AllocationStep): string {
  const dealer = step.dealerId ? ` ${step.dealerId}` : "";
  const delta = step.deltaUnits > 0 ? ` +${step.deltaUnits}` : "";
  return `${PHASE_LABEL[step.phase]}${dealer}${delta || ` · ${EVENT_LABEL[step.event]}`}`;
}

function statusForDealer(dealer: Dealer, final: number, demand: number, capped: boolean) {
  if (dealer.inventoryConfidence === "untrusted") {
    return <StatusPill tone="stone">仅保底</StatusPill>;
  }
  if (capped) return <StatusPill tone="amber">额度触顶</StatusPill>;
  if (final > demand) return <StatusPill tone="emerald">效率加配</StatusPill>;
  return <StatusPill tone="blue">分配完成</StatusPill>;
}

export function WorkbenchPage() {
  const {
    scenarioId,
    setScenario,
    setSku,
    activeSku,
    availableSkus,
    dealers,
    params,
    allocation,
    updateParams,
    updateDealer,
    writeBackAllocationRfc,
    ratioConfig,
    bigCustomers,
    isCurrentSkuSkipped,
    layeringStopsAtHq,
    drillDownTarget,
    clearDrillDownTarget,
    shotPreset,
    notify,
  } = useDemo();
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [expandedDealer, setExpandedDealer] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const replayEvents = useMemo(
    () => allocation.trace.filter((step) => REPLAY_EVENTS.has(step.event)),
    [allocation.trace],
  );
  const [playbackIndex, setPlaybackIndex] = useState(replayEvents.length);

  useEffect(() => {
    setPlaybackIndex(replayEvents.length);
    setPlaying(false);
  }, [replayEvents]);

  useEffect(() => {
    if (shotPreset === "workbench-audit") {
      setExpandedDealer("A");
      setInputCollapsed(true);
    }
  }, [shotPreset]);

  useEffect(() => {
    if (!drillDownTarget?.startsWith("allocation-")) return;
    setExpandedDealer(dealers[0]?.id ?? null);
    setInputCollapsed(true);
    clearDrillDownTarget();
  }, [clearDrillDownTarget, dealers, drillDownTarget]);

  useEffect(() => {
    if (!playing) return;
    if (playbackIndex >= replayEvents.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setPlaybackIndex((current) => Math.min(replayEvents.length, current + 1)),
      speed === 2 ? 80 : 160,
    );
    return () => window.clearTimeout(timer);
  }, [playbackIndex, playing, replayEvents.length, speed]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === "hidden") setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const complete = playbackIndex >= replayEvents.length;
  const frame = useMemo(() => {
    const fair = new Map<string, number>();
    const efficiency = new Map<string, number>();
    for (const event of replayEvents.slice(0, playbackIndex)) {
      if (!event.dealerId || event.deltaUnits <= 0) continue;
      const target = event.phase === "fair" ? fair : efficiency;
      target.set(event.dealerId, (target.get(event.dealerId) ?? 0) + event.deltaUnits);
    }
    return { fair, efficiency };
  }, [playbackIndex, replayEvents]);

  const currentEvent = playbackIndex > 0 ? replayEvents[playbackIndex - 1] : undefined;
  const totalDemand = dealers.reduce((sum, dealer) => sum + dealer.demand, 0);
  const demandSatisfied = allocation.results.reduce(
    (sum, result) => sum + Math.min(result.finalAlloc, result.demand),
    0,
  );
  const satisfaction = totalDemand ? (demandSatisfied / totalDemand) * 100 : 100;
  const covered = allocation.results.filter((result) => result.finalAlloc > 0).length;
  const creditCapped = allocation.results.filter((result) => result.cappedByCredit).length;
  const solverDisabled = isCurrentSkuSkipped || layeringStopsAtHq;

  const exportCsv = () => {
    const header = ["经销商", "需求", "额度", "公平层", "效率层", "最终分配", "满足率"];
    const rows = allocation.results.map((result) => {
      const dealer = dealers.find((item) => item.id === result.dealerId);
      return [
        dealer?.name ?? result.dealerId,
        result.demand,
        result.creditCapUnits,
        result.fairAlloc,
        result.effAlloc,
        result.finalAlloc,
        `${(result.satisfactionRate * 100).toFixed(1)}%`,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenarioId}-${activeSku.id}-allocation.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("结果已导出", "CSV 可直接用 Excel 打开。 ");
  };

  return (
    <div className={`page workbench-page ${shotPreset === "workbench-audit" ? "audit-preset" : ""}`} data-testid="page-workbench">
      <PageHeading
        title="分货工作台"
        help={`当前为“${activeSku.name}”独立数据快照。在同一处调整供给与经销商参数，观察公平层、效率层和额度硬约束如何共同形成最终分配。`}
        context={(
          <span className="sku-context-badge" key={`${scenarioId}-${activeSku.id}`} data-testid="active-sku-context">
            <Package size={15} />
            <strong>{activeSku.name}</strong>
            <small>{activeSku.category} · {dealers.length} 家渠道</small>
          </span>
        )}
        actions={(
          <>
            <button type="button" className="button outline" disabled={solverDisabled} onClick={() => setWeightsOpen(true)}>
              <Settings2 size={16} /> 求解因子
            </button>
            <button type="button" className="button outline" disabled={solverDisabled} onClick={exportCsv}>
              <Download size={16} /> 导出
            </button>
            <button type="button" className="button primary" disabled={solverDisabled} onClick={writeBackAllocationRfc} data-testid="write-back-sap">
              <Send size={16} /> 调用 SAP 产品分配 RFC 回写
            </button>
          </>
        )}
      />

      <div className={`workbench-layout ${inputCollapsed ? "input-collapsed" : ""}`}>
        <aside className="input-panel card">
          <div className="input-panel-head">
            <div>
              <h2>输入与约束</h2>
              <span>修改后 300ms 自动重算</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={inputCollapsed ? "展开输入区" : "收起输入区"}
              onClick={() => setInputCollapsed((current) => !current)}
            >
              {inputCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>
          {!inputCollapsed && (
            <div className="input-panel-body">
              <label className="field-label">
                <span>预置场景</span>
                <select
                  value={scenarioId}
                  onChange={(event) => setScenario(event.target.value as AllocationScenarioId)}
                  data-testid="scenario-select"
                >
                  {SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                <span>场景内 SKU</span>
                <select
                  value={activeSku.id}
                  onChange={(event) => setSku(event.target.value)}
                  data-testid="workbench-sku-select"
                >
                  {availableSkus.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · {item.category}</option>
                  ))}
                </select>
              </label>
              <p className="sku-story">{activeSku.story}</p>
              <div className="source-label-group" aria-label="数据来源">
                <span><b>MIA</b> 月度目标</span>
                <span><b>SAP</b> 订单 · 库存 · 货款</span>
                <span><b>SSP</b> 历史 PSI</span>
              </div>
              <label className="field-label">
                <span>今日可分货量</span>
                <input
                  className="wide-number-input"
                  type="number"
                  min={0}
                  value={params.supply}
                  onChange={(event) => updateParams({ supply: Number(event.target.value) })}
                />
              </label>

              <div className="input-section-title">经销商参数</div>
              <div className="dealer-editor-list">
                {dealers.map((dealer) => (
                  <div className="dealer-input-card" key={dealer.id}>
                    <div className="dealer-input-name">
                      <strong>{dealer.name}</strong>
                      <span className="dealer-business-tags">
                        {bigCustomers[dealer.id] && <StatusPill tone="blue">大客户</StatusPill>}
                        {(() => {
                          const weekly = applyWklyRatio(
                            dealer.monthlyTarget ?? dealer.demand * 4,
                            ratioConfig.wklyRatioByCategory[activeSku.category] ?? 0.25,
                            Boolean(bigCustomers[dealer.id]),
                            ratioConfig.kBig,
                          );
                          return (
                            <StatusPill tone={weekly.exempted ? "emerald" : "stone"}>
                              {weekly.weeklyCap === null ? "周上限豁免" : `本周上限 ${weekly.weeklyCap}`}
                            </StatusPill>
                          );
                        })()}
                        {dealer.inventoryConfidence === "untrusted" && <StatusPill tone="stone">仅保底</StatusPill>}
                      </span>
                    </div>
                    <div className="dealer-fields-grid">
                      <DebouncedNumberInput label="需求" ariaLabel={`${dealer.name}需求`} value={dealer.demand} onCommit={(value) => updateDealer(dealer.id, { demand: value })} />
                      <DebouncedNumberInput label="额度" ariaLabel={`${dealer.name}额度`} value={dealer.creditCapUnits} onCommit={(value) => updateDealer(dealer.id, { creditCapUnits: value })} />
                      <DebouncedNumberInput label="权重" ariaLabel={`${dealer.name}权重`} value={dealer.fulfillWeight} step={0.1} onCommit={(value) => updateDealer(dealer.id, { fulfillWeight: value })} />
                      <DebouncedNumberInput label="动销" ariaLabel={`${dealer.name}动销`} value={dealer.velocity} step={0.05} onCommit={(value) => updateDealer(dealer.id, { velocity: value })} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="input-section-title">求解参数</div>
              <ParameterSlider label="公平预算 β" value={params.fairBudgetRatio} min={0.3} max={1} step={0.05} onChange={(value) => updateParams({ fairBudgetRatio: value })} />
              <ParameterSlider label="淡旺季系数" value={params.seasonFactor} min={0.7} max={1.4} step={0.05} onChange={(value) => updateParams({ seasonFactor: value })} />
              <ParameterSlider label="市场缺货度" value={params.scarcity} min={0} max={1} step={0.05} onChange={(value) => updateParams({ scarcity: value })} />
            </div>
          )}
        </aside>

        <div className="workbench-main">
          {solverDisabled ? (
            <section className={`card workbench-routing-callout ${isCurrentSkuSkipped ? "skip" : "layer-stop"}`} data-testid="workbench-routing-callout">
              <div>
                <StatusPill tone={isCurrentSkuSkipped ? "amber" : "blue"}>
                  {isCurrentSkuSkipped ? "Skip 命中" : "总部层停靠"}
                </StatusPill>
                <h2>
                  {isCurrentSkuSkipped
                    ? "该物料已跳过自动求解"
                    : "本轮停靠总部层，无需逐户分配"}
                </h2>
                <p>
                  {isCurrentSkuSkipped
                    ? `${activeSku.id} 已转 SSP 人工分配；系统不会生成经销商级分配结果或 RFC。`
                    : "供给已满足总部层有效净需求，可直接形成总部级下单计划；切换到 P2 货源偏紧场景可继续演示逐级下沉。"}
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="metric-strip" aria-label="本次分货指标">
                <div><span>可分货量</span>{metricValue(params.supply, "台")}</div>
                <div><span>覆盖经销商</span>{metricValue(`${covered}/${dealers.length}`, "家")}</div>
                <div><span>需求满足率</span>{metricValue(satisfaction.toFixed(1), "%")}</div>
                <div className={creditCapped > 0 ? "metric-highlight" : ""}><span>额度触顶</span>{metricValue(creditCapped, "家")}</div>
              </section>

              <section className="solver-card card">
            <CardTitle
              title="分配结果"
              detail={currentEvent ? `当前：${frameLabel(currentEvent)}` : "最近一次求解结果"}
              actions={(
                <div className="solver-summary">
                  <span><i className="dot blue" />公平层</span>
                  <span><i className="dot emerald" />效率层</span>
                  <strong>Σ {allocation.totalAllocated} / {params.supply}</strong>
                </div>
              )}
            />

            <div className="allocation-rails">
              {dealers.map((dealer) => {
                const result = allocation.results.find((item) => item.dealerId === dealer.id);
                if (!result) return null;
                const fair = complete ? result.fairAlloc : frame.fair.get(dealer.id) ?? 0;
                const efficiency = complete ? result.effAlloc : frame.efficiency.get(dealer.id) ?? 0;
                const final = fair + efficiency;
                const scale = Math.max(dealer.demand, dealer.creditCapUnits, 1);
                const fairPct = Math.min(100, (fair / scale) * 100);
                const efficiencyPct = Math.min(100 - fairPct, (efficiency / scale) * 100);
                const demandPct = Math.min(100, (dealer.demand / scale) * 100);
                const capPct = Math.min(100, (dealer.creditCapUnits / scale) * 100);
                const capped = complete
                  ? result.cappedByCredit
                  : replayEvents.slice(0, playbackIndex).some(
                      (step) => step.dealerId === dealer.id && step.event === "CREDIT_CAP_REACHED",
                    );
                return (
                  <div className="allocation-rail-row" key={dealer.id}>
                    <div className="rail-dealer">
                      <strong>{dealer.name}</strong>
                      <span>权重 {dealer.fulfillWeight.toFixed(2)} · 动销 {dealer.velocity.toFixed(2)}</span>
                    </div>
                    <div className="rail-visual">
                      <div
                        className="rail-track"
                        style={{
                          "--fair-width": `${fairPct}%`,
                          "--eff-width": `${efficiencyPct}%`,
                          "--demand-left": `${demandPct}%`,
                          "--cap-left": `${capPct}%`,
                        } as CSSProperties}
                      >
                        <span className="rail-fill fair" />
                        <span className="rail-fill efficiency" />
                        <span className="rail-marker demand"><b>需求 {dealer.demand}</b></span>
                        <span className="rail-marker cap"><b>额度 {dealer.creditCapUnits}</b></span>
                      </div>
                      <div className="rail-breakdown">
                        <span>公平 {fair}</span>
                        <span>效率 {efficiency}</span>
                      </div>
                    </div>
                    <div className="rail-result">
                      <strong>{final}<small>台</small></strong>
                      <span>{dealer.demand ? ((final / dealer.demand) * 100).toFixed(0) : "100"}%</span>
                    </div>
                    <div className="rail-status">{statusForDealer(dealer, final, dealer.demand, capped)}</div>
                  </div>
                );
              })}
            </div>

            <div className="replay-controls">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                  } else {
                    if (complete) setPlaybackIndex(0);
                    setPlaying(true);
                  }
                }}
                data-testid="play-solver"
              >
                {playing ? <Pause size={15} /> : <RotateCcw size={15} />}
                {playing ? "暂停" : "重算并回放"}
              </button>
              <button
                type="button"
                className="button outline"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setPlaybackIndex((current) => Math.min(replayEvents.length, current + 1));
                }}
              >
                <StepForward size={15} /> 分步
              </button>
              <div className="speed-switch" aria-label="回放速度">
                {[1, 2].map((value) => (
                  <button key={value} type="button" className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>
                ))}
              </div>
              <span className="frame-counter">#{Math.min(playbackIndex, replayEvents.length)}/{replayEvents.length}</span>
              <div className="replay-progress"><span style={{ width: `${replayEvents.length ? (playbackIndex / replayEvents.length) * 100 : 100}%` }} /></div>
            </div>

            <div className="event-timeline" aria-label="求解事件时间轴">
              {replayEvents.map((step, index) => (
                <button
                  type="button"
                  key={step.step}
                  className={`${index === playbackIndex - 1 ? "active" : ""} ${step.event === "CREDIT_CAP_REACHED" ? "warning" : ""}`}
                  onClick={() => {
                    setPlaying(false);
                    setPlaybackIndex(index + 1);
                  }}
                >
                  <span>#{step.step}</span> {frameLabel(step)}
                </button>
              ))}
            </div>
              </section>

              <section className="result-card card">
            <CardTitle
              title="分配明细"
              detail="点击经销商展开分配轨迹"
              actions={<span className="conservation-check">守恒校验通过</span>}
            />
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>经销商</th><th>需求</th><th>额度</th><th>公平层</th><th>效率层</th><th>最终分配</th><th>满足率</th><th /></tr>
                </thead>
                <tbody>
                  {allocation.results.map((result) => {
                    const dealer = dealers.find((item) => item.id === result.dealerId);
                    const expanded = expandedDealer === result.dealerId;
                    return (
                      <Fragment key={result.dealerId}>
                        <tr className={expanded ? "expanded" : ""}>
                          <td><strong>{dealer?.name ?? result.dealerId}</strong></td>
                          <td className="numeric">{result.demand}</td>
                          <td className="numeric">{result.creditCapUnits}</td>
                          <td className="numeric blue-text">{result.fairAlloc}</td>
                          <td className="numeric emerald-text">{result.effAlloc}</td>
                          <td className="numeric strong">{result.finalAlloc}</td>
                          <td className="numeric">{(result.satisfactionRate * 100).toFixed(1)}%</td>
                          <td>
                            <button type="button" className="icon-button" aria-label={`展开${dealer?.name ?? result.dealerId}分配轨迹`} onClick={() => setExpandedDealer(expanded ? null : result.dealerId)}>
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${result.dealerId}-audit`} className="audit-row">
                            <td colSpan={8}>
                              <div className="audit-console">
                                <div className="audit-title">分配轨迹 · {dealer?.name ?? result.dealerId}</div>
                                {result.trace.map((step) => (
                                  <div key={step.step}><span>#{String(step.step).padStart(2, "0")}</span><b>{PHASE_LABEL[step.phase]}</b><em>{EVENT_LABEL[step.event]}</em><strong>{step.deltaUnits > 0 ? `+${step.deltaUnits}` : "—"}</strong><p>{step.message}</p></div>
                                ))}
                                <div className="audit-total">Σ final = {allocation.totalAllocated} = supply {params.supply} ✓</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </section>
            </>
          )}
        </div>
      </div>

      {weightsOpen && <WeightSheet onClose={() => setWeightsOpen(false)} />}
    </div>
  );
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-slider">
      <span><b>{label}</b><strong>{value.toFixed(2)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function WeightSheet({ onClose }: { onClose: () => void }) {
  const {
    params,
    dealers,
    factorOverrides,
    inventoryFactor,
    updateParams,
    updateDealer,
    updateInventoryFactor,
    setFactorOverride,
    rollbackWeights,
  } = useDemo();
  const averageVelocity = dealers.reduce((sum, dealer) => sum + dealer.velocity, 0) / Math.max(1, dealers.length);
  const averageFulfill = dealers.reduce((sum, dealer) => sum + dealer.fulfillWeight, 0) / Math.max(1, dealers.length);

  const factors = [
    { key: "season" as keyof FactorOverrides, label: "淡旺季", value: params.seasonFactor, min: 0.7, max: 1.4, step: 0.05, change: (value: number) => updateParams({ seasonFactor: value }) },
    { key: "scarcity" as keyof FactorOverrides, label: "缺货度", value: params.scarcity, min: 0, max: 1, step: 0.05, change: (value: number) => updateParams({ scarcity: value }) },
    { key: "velocity" as keyof FactorOverrides, label: "动销效率", value: averageVelocity, min: 0.4, max: 1.8, step: 0.05, change: (value: number) => {
      const ratio = value / Math.max(0.01, averageVelocity);
      dealers.forEach((dealer) => updateDealer(dealer.id, { velocity: Number((dealer.velocity * ratio).toFixed(3)) }));
    } },
    { key: "fulfillment" as keyof FactorOverrides, label: "履约质量", value: averageFulfill, min: 0.5, max: 1.8, step: 0.05, change: (value: number) => {
      const ratio = value / Math.max(0.01, averageFulfill);
      dealers.forEach((dealer) => updateDealer(dealer.id, { fulfillWeight: Number((dealer.fulfillWeight * ratio).toFixed(3)) }));
    } },
    { key: "inventory" as keyof FactorOverrides, label: "库存健康", value: inventoryFactor, min: 0.6, max: 1.4, step: 0.05, change: updateInventoryFactor },
  ];

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="weight-sheet" role="dialog" aria-modal="true" aria-label="权重设置">
        <div className="sheet-header">
          <div><h2>权重设置</h2><p>拖动后立即更新分配结果</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭权重设置"><X size={18} /></button>
        </div>
        <div className="sheet-body">
          <div className="factor-list">
            {factors.map((factor) => (
              <div className="factor-row" key={factor.key}>
                <div><strong>{factor.label}</strong><span>{factor.value.toFixed(2)}</span></div>
                <input type="range" min={factor.min} max={factor.max} step={factor.step} value={factor.value} aria-label={`${factor.label}权重`} onChange={(event) => {
                  factor.change(Number(event.target.value));
                  setFactorOverride(factor.key, true);
                }} />
                <button type="button" className={`mode-switch ${factorOverrides[factor.key] ? "manual" : ""}`} onClick={() => setFactorOverride(factor.key, !factorOverrides[factor.key])}>
                  {factorOverrides[factor.key] ? "人工覆盖" : "自动更新"}
                </button>
              </div>
            ))}
          </div>
          <section className="learning-card">
            <CardTitle title="近 8 周更新效果" detail="权重与分货准确率" />
            <div className="learning-chart">
              <DeferredResponsiveContainer width="100%" height="100%">
                <LineChart data={LEARNING_HISTORY} margin={{ top: 12, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#e7e5e4" vertical={false} />
                  <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "#e7e5e4" }} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} />
                  <YAxis yAxisId="weight" domain={[0.7, 1.4]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} />
                  <YAxis yAxisId="rate" orientation="right" domain={[75, 95]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }} />
                  <Line yAxisId="weight" dataKey="fulfill" name="履约权重" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" dataKey="accuracy" name="准确率" stroke="#059669" strokeWidth={2} dot={false} />
                </LineChart>
              </DeferredResponsiveContainer>
            </div>
          </section>
        </div>
        <div className="sheet-footer">
          <button type="button" className="button outline" onClick={rollbackWeights}><Gauge size={15} />恢复自动基线</button>
          <button type="button" className="button primary" onClick={onClose}>完成</button>
        </div>
      </aside>
    </div>
  );
}
