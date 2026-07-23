"use client";

import { useEffect } from "react";
import {
  CalendarDays,
  GitCompareArrows,
  Network,
  Percent,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { DemoProvider, useDemo, type DemoView, type TriggerMode } from "@/src/store/DemoContext";
import { formatSimulationDate } from "@/src/mock/seed";
import { SCENARIOS } from "@/src/core/scenarios";
import { runtimeModeFromSearch } from "@/src/core/demoClock";
import type { AllocationScenarioId } from "@/src/core/types";
import { LayeringPage } from "@/src/components/pages/LayeringPage";
import { WorkbenchPage } from "@/src/components/pages/WorkbenchPage";
import { ScenariosPage } from "@/src/components/pages/ScenariosPage";
import { RatiosPage } from "@/src/components/pages/RatiosPage";
import { TurnoverPage } from "@/src/components/pages/TurnoverPage";
import { ConsolePage } from "@/src/components/pages/ConsolePage";
import { CalibrationModal } from "@/src/components/CalibrationModal";

interface NavItem {
  id: DemoView;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "layering", label: "智能分层", icon: Network },
  { id: "workbench", label: "分货工作台", icon: SlidersHorizontal },
  { id: "scenarios", label: "方案对比", icon: GitCompareArrows },
  { id: "ratios", label: "比例与特殊物料", icon: Percent },
  { id: "turnover", label: "周转与校准", icon: RefreshCw },
  { id: "console", label: "后台管理", icon: Settings2 },
];

const STAGE_LABELS = [
  "读取 MIA / SAP / SSP",
  "判断智能分层",
  "执行比例与分货求解",
  "生成 RFC 参数",
];

function CurrentPage() {
  const { view } = useDemo();
  if (view === "layering") return <LayeringPage />;
  if (view === "workbench") return <WorkbenchPage />;
  if (view === "scenarios") return <ScenariosPage />;
  if (view === "ratios") return <RatiosPage />;
  if (view === "turnover") return <TurnoverPage />;
  return <ConsolePage />;
}

function Shell() {
  const {
    view,
    setView,
    scenarioId,
    scenarioDescription,
    setScenario,
    sku,
    setSku,
    activeSku,
    availableSkus,
    simulationDate,
    runningStage,
    triggerMode,
    setTriggerMode,
    triggerAllocation,
    resetDemo,
    runtimeMode,
    configureRuntimeMode,
    applyShotPreset,
    toast,
  } = useDemo();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const mode = runtimeModeFromSearch(window.location.search);
    configureRuntimeMode(mode);
    document.documentElement.classList.toggle("shot-mode", mode === "shot");
    if (mode !== "shot") {
      delete document.documentElement.dataset.preset;
      return;
    }
    const preset = query.get("preset") || "workbench-result";
    document.documentElement.dataset.preset = preset;
    applyShotPreset(preset);
  }, [applyShotPreset, configureRuntimeMode]);

  const navigate = (next: DemoView) => {
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => void;
    };
    if (transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(() => setView(next));
    } else {
      setView(next);
    }
  };

  return (
    <div className="app-shell" data-runtime-mode={runtimeMode}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="4seeTech" />
          <div>
            <strong>4seeTech</strong>
            <span>索尼产品分配 Agent</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={active ? "active" : ""}
                onClick={() => navigate(item.id)}
                aria-current={active ? "page" : undefined}
                data-testid={`nav-${item.id}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-meta">
          <span>演示环境</span>
          <strong>数据快照 09:00</strong>
          <small>
            {runtimeMode === "presentation"
              ? "演示模式 · 交互受控"
              : runtimeMode === "shot"
                ? "截图模式 · 固定数据"
                : "普通模式 · 可交互"}
          </small>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-selectors">
            <label>
              <span>场景</span>
              <select
                value={scenarioId}
                title={scenarioDescription}
                onChange={(event) =>
                  setScenario(event.target.value as AllocationScenarioId)
                }
                data-testid="topbar-scenario"
              >
                {SCENARIOS.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>SKU</span>
              <select
                value={sku}
                title={activeSku.story}
                onChange={(event) => setSku(event.target.value)}
                data-testid="topbar-sku"
              >
                {availableSkus.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="dataset-chip source-dataset-chip">
              MIA · SAP · SSP
            </span>
          </div>

          <div className="topbar-actions">
            <span className="date-chip">
              <CalendarDays size={16} />
              {formatSimulationDate(simulationDate)}
            </span>
            {runningStage !== null && (
              <span className="running-chip">
                <RefreshCw size={14} className="spin" />
                {STAGE_LABELS[runningStage]}
              </span>
            )}
            <label className="trigger-mode-select">
              <span className="sr-only">触发方式</span>
              <select
                value={triggerMode}
                disabled={runningStage !== null}
                onChange={(event) =>
                  setTriggerMode(event.target.value as TriggerMode)
                }
                data-testid="trigger-mode"
              >
                <option value="arrival">到货触发</option>
                <option value="scheduled">定时批量</option>
              </select>
            </label>
            <button
              type="button"
              className="button primary"
              disabled={runningStage !== null}
              onClick={() => void triggerAllocation()}
              data-testid="trigger-allocation"
            >
              <Play size={16} />
              触发分货
            </button>
            <button
              type="button"
              className="icon-button shot-hide"
              disabled={runningStage !== null}
              onClick={resetDemo}
              aria-label="重置演示"
              data-testid="reset-demo"
            >
              <RotateCcw size={17} />
            </button>
          </div>
        </header>

        <main className="page-scroll corner-dots-bg">
          <CurrentPage />
        </main>
      </section>

      {toast && (
        <div
          className={`toast ${
            toast.detail.includes("Skip") || toast.detail.includes("异常")
              ? "amber"
              : ""
          }`}
          role="status"
        >
          <span>{toast.title}</span>
          <p>{toast.detail}</p>
        </div>
      )}
      <CalibrationModal />
    </div>
  );
}

export function DemoApp() {
  return (
    <DemoProvider>
      <Shell />
    </DemoProvider>
  );
}
