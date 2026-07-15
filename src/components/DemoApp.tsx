"use client";

import { useEffect } from "react";
import {
  CalendarDays,
  FastForward,
  GitCompareArrows,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { DemoProvider, useDemo, type DemoView } from "@/src/store/DemoContext";
import { formatSimulationDate } from "@/src/mock/seed";
import { SCENARIOS } from "@/src/core/scenarios";
import { runtimeModeFromSearch } from "@/src/core/demoClock";
import type { AllocationScenarioId } from "@/src/core/types";
import { WorkbenchPage } from "@/src/components/pages/WorkbenchPage";
import { ScenariosPage } from "@/src/components/pages/ScenariosPage";
import { LockingPage } from "@/src/components/pages/LockingPage";
import { TurnoverPage } from "@/src/components/pages/TurnoverPage";
import { CalibrationModal } from "@/src/components/CalibrationModal";

interface NavItem {
  id: DemoView;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "workbench", label: "分货工作台", icon: SlidersHorizontal },
  { id: "scenarios", label: "方案对比", icon: GitCompareArrows },
  { id: "locking", label: "锁单看板", icon: LockKeyhole },
  { id: "turnover", label: "周转与校准", icon: RefreshCw },
];

const STAGE_LABELS = ["更新日期", "重估库存", "重新分货", "推进锁单"];

function CurrentPage() {
  const { view } = useDemo();
  if (view === "workbench") return <WorkbenchPage />;
  if (view === "scenarios") return <ScenariosPage />;
  if (view === "locking") return <LockingPage />;
  return <TurnoverPage />;
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
    releasedPool,
    runDay,
    fastForwardMonday,
    resetDemo,
    runtimeMode,
    configureRuntimeMode,
    applyShotPreset,
    toast,
  } = useDemo();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = runtimeModeFromSearch(window.location.search);
    configureRuntimeMode(mode);
    document.documentElement.classList.toggle("shot-mode", mode === "shot");
    if (mode !== "shot") {
      delete document.documentElement.dataset.preset;
      return;
    }
    const preset = params.get("preset") || "workbench-result";
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

  const monday = simulationDate.getDay() === 1;

  return (
    <div className="app-shell" data-runtime-mode={runtimeMode}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="4seeTech" />
          <div><strong>4seeTech</strong><span>索尼分货 Agent</span></div>
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
                {item.id === "workbench" && releasedPool > 0 && <i className="nav-notice" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-meta">
          <span>演示环境</span>
          <strong>数据快照 09:00</strong>
          <small>
            {runtimeMode === "presentation"
              ? "演示模式 · 超时受控"
              : runtimeMode === "shot"
                ? "截图模式 · 固定时钟"
                : "静态数据 · 自动超时"}
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
                onChange={(event) => setScenario(event.target.value as AllocationScenarioId)}
                data-testid="topbar-scenario"
              >
                {SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
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
                {availableSkus.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <span className="dataset-chip" key={`${scenarioId}-${sku}`}>
              独立数据集 · {activeSku.dealers.length} 家渠道
            </span>
          </div>
          <div className="topbar-actions">
            <span className={`date-chip ${monday ? "monday" : ""}`}><CalendarDays size={16} />{formatSimulationDate(simulationDate)}{monday && <b>库存真值日</b>}</span>
            {runningStage !== null && <span className="running-chip"><RefreshCw size={14} className="spin" />{STAGE_LABELS[runningStage]}</span>}
            <button type="button" className="button primary" disabled={runningStage !== null} onClick={() => void runDay()} data-testid="run-day"><Play size={16} />运行一天</button>
            <button type="button" className="button outline" disabled={runningStage !== null} onClick={fastForwardMonday} data-testid="fast-monday"><FastForward size={16} />至下周一</button>
            <button type="button" className="icon-button shot-hide" disabled={runningStage !== null} onClick={resetDemo} aria-label="重置演示" data-testid="reset-demo"><RotateCcw size={17} /></button>
          </div>
        </header>

        <main className="page-scroll corner-dots-bg"><CurrentPage /></main>
      </section>

      {toast && (
        <div className={`toast ${toast.detail.includes("覆盖") || toast.detail.includes("额度") ? "amber" : ""}`} role="status">
          <span>{toast.title}</span><p>{toast.detail}</p>
        </div>
      )}
      <CalibrationModal />
    </div>
  );
}

export function DemoApp() {
  return <DemoProvider><Shell /></DemoProvider>;
}
