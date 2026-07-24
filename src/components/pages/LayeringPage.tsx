"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CheckCircle2,
  ChevronRight,
  Network,
  SlidersHorizontal,
} from "lucide-react";
import type {
  LayeringDecision,
  TierId,
  TierNode,
} from "@/src/core/layering";
import { useDemo } from "@/src/store/DemoContext";
import {
  CardTitle,
  PageHeading,
  StatusPill,
} from "@/src/components/ui/Primitives";
import {
  calculateTraceRevealDelta,
  TraceConsole,
} from "@/src/components/ui/TraceConsole";

const TIER_ORDER: TierId[] = [
  "hq",
  "channel",
  "subChannel",
  "region",
  "branch",
  "dealer",
];

const TIER_LABELS: Record<TierId, string> = {
  hq: "总部",
  channel: "渠道",
  subChannel: "子渠道",
  region: "大区",
  branch: "分公司",
  dealer: "经销商",
};

type LayeringScenario = "p1" | "p2";
type SelectedPath = Partial<Record<TierId, string>>;

interface DisplayNode {
  node: TierNode;
  decision?: LayeringDecision;
  blocked: boolean;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function nodeProgress(value: number): CSSProperties {
  return {
    "--layer-progress": `${Math.max(0, Math.min(100, value * 100))}%`,
  } as CSSProperties;
}

function selectCandidate(
  candidates: DisplayNode[],
  selectedId: string | undefined,
): DisplayNode | undefined {
  return (
    candidates.find((candidate) => candidate.node.id === selectedId) ??
    candidates.find(
      (candidate) =>
        !candidate.blocked &&
        candidate.decision !== undefined &&
        !candidate.decision.stopped,
    ) ??
    candidates[0]
  );
}

export function LayeringPage() {
  const layeringTreeScrollRef = useRef<HTMLDivElement>(null);
  const {
    layeringScenario,
    setLayeringScenario,
    layeringConfig,
    updateLayerThreshold,
    layeringDecision,
    orgTree,
    layeringSupply,
    shotPreset,
  } = useDemo();
  const [selectedPath, setSelectedPath] = useState<SelectedPath>({});
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (shotPreset === "layering-p1") setLayeringScenario("p1");
    if (shotPreset === "layering-p2") setLayeringScenario("p2");
  }, [setLayeringScenario, shotPreset]);

  useEffect(() => {
    setSelectedPath({});
    setHighlightedNodeId(null);
  }, [layeringScenario]);

  useEffect(() => {
    if (
      highlightedNodeId &&
      !layeringDecision.trace.some((step) => step.nodeId === highlightedNodeId)
    ) {
      setHighlightedNodeId(null);
    }
  }, [highlightedNodeId, layeringDecision.trace]);

  const nodeById = useMemo(
    () => new Map(orgTree.map((node) => [node.id, node])),
    [orgTree],
  );
  const decisionById = useMemo(() => {
    const index = new Map<string, LayeringDecision>();
    const visit = (decisions: LayeringDecision[]) => {
      decisions.forEach((decision) => {
        index.set(decision.nodeId, decision);
        visit(decision.children);
      });
    };
    visit(layeringDecision.decisions);
    return index;
  }, [layeringDecision.decisions]);

  const levels = useMemo(() => {
    const result = new Map<TierId, DisplayNode[]>();
    let parent: DisplayNode | undefined;

    TIER_ORDER.forEach((tier, index) => {
      const parentId = index === 0 ? null : parent?.node.id;
      const candidates = orgTree
        .filter((node) => node.tier === tier && node.parentId === parentId)
        .map((node) => ({
          node,
          decision: decisionById.get(node.id),
          blocked:
            index === 0
              ? false
              : Boolean(
                  parent?.blocked ||
                  parent?.decision?.stopped ||
                  !parent?.decision,
                ),
        }));
      result.set(tier, candidates);
      parent = selectCandidate(candidates, selectedPath[tier]);
    });

    return result;
  }, [decisionById, orgTree, selectedPath]);

  const rootNode = orgTree.find((node) => node.parentId === null);
  const rootDecision = rootNode ? decisionById.get(rootNode.id) : undefined;
  const effectiveDemand = rootNode?.netDemand ?? 0;
  const frontierAllocated = layeringDecision.frontierAllocated;

  const chooseNode = (tier: TierId, nodeId: string) => {
    const tierIndex = TIER_ORDER.indexOf(tier);
    setHighlightedNodeId(null);
    setSelectedPath((current) => {
      const next: SelectedPath = { ...current, [tier]: nodeId };
      TIER_ORDER.slice(tierIndex + 1).forEach((deeperTier) => {
        delete next[deeperTier];
      });
      return next;
    });
  };

  const highlightTraceNode = (nodeId: string) => {
    const nextPath: SelectedPath = {};
    let node = nodeById.get(nodeId);

    while (node) {
      nextPath[node.tier] = node.id;
      node = node.parentId ? nodeById.get(node.parentId) : undefined;
    }

    setSelectedPath(nextPath);
    setHighlightedNodeId(nodeId);
    requestAnimationFrame(() => {
      const track = layeringTreeScrollRef.current;
      const target = document.getElementById(`layer-node-${nodeId}`);
      if (!track || !target) return;
      const trackRect = track.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const delta = calculateTraceRevealDelta(
        trackRect.left,
        trackRect.right,
        targetRect.left,
        targetRect.right,
        16,
      );
      if (delta === 0) return;
      track.scrollBy({
        left: delta,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
    });
  };

  return (
    <div
      className={`page layering-page ${shotPreset.startsWith("layering-") ? "layering-shot-preset" : ""}`}
      data-testid="page-layering"
    >
      <PageHeading
        title="智能分层"
        help="Agent 按各层有效净需求与 PA Plan Ratio 逐级判断：满足度达到 PIC 阈值即停靠，否则继续向下分配。"
        context={(
          <span className="layering-heading-context">
            <StatusPill tone="blue">
              <Network size={13} /> 六层组织树
            </StatusPill>
            <StatusPill tone={rootDecision?.stopped ? "emerald" : "amber"}>
              {rootDecision?.stopped ? "本轮总部停靠" : "本轮继续下沉"}
            </StatusPill>
          </span>
        )}
      />

      <section className="layering-metric-strip metric-strip" aria-label="分层摘要">
        <div>
          <span>可分配量</span>
          <div className="metric-value"><span>{layeringSupply}</span><sup>台</sup></div>
        </div>
        <div>
          <span>有效净需求</span>
          <div className="metric-value"><span>{effectiveDemand}</span><sup>台</sup></div>
        </div>
        <div>
          <span>全局满足度</span>
          <div className="metric-value">
            <span>{percent(rootDecision?.satisfaction ?? 0).replace("%", "")}</span>
            <sup>%</sup>
          </div>
        </div>
        <div>
          <span>停靠前沿分配</span>
          <div className="metric-value"><span>{frontierAllocated}</span><sup>台</sup></div>
        </div>
      </section>

      <div className="layering-main-grid">
        <aside className="card layering-config-panel">
          <div className="layering-panel-head">
            <SlidersHorizontal size={17} />
            <div>
              <h2>场景与停靠阈值</h2>
              <span>阈值由 PIC 配置，修改后即时重算</span>
            </div>
          </div>

          <div className="layering-scenario-switch" aria-label="选择分层场景">
            <button
              type="button"
              className={layeringScenario === "p1" ? "active" : ""}
              onClick={() => setLayeringScenario("p1")}
              data-testid="layering-scenario-p1"
            >
              <strong>P1</strong>
              <span>货源充足</span>
              <small>总部层停靠</small>
            </button>
            <button
              type="button"
              className={layeringScenario === "p2" ? "active" : ""}
              onClick={() => setLayeringScenario("p2")}
              data-testid="layering-scenario-p2"
            >
              <strong>P2</strong>
              <span>货源偏紧</span>
              <small>分渠道下沉</small>
            </button>
          </div>

          <div className="layering-thresholds">
            {TIER_ORDER.slice(0, -1).map((tier) => {
              const value = layeringConfig.stopThresholds[tier];
              return (
                <label className="parameter-slider" key={tier}>
                  <span>
                    <b>{TIER_LABELS[tier]}停靠阈值</b>
                    <strong>{percent(value)}</strong>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={value}
                    aria-label={`${TIER_LABELS[tier]}停靠阈值`}
                    onChange={(event) =>
                      updateLayerThreshold(tier, Number(event.target.value))
                    }
                  />
                </label>
              );
            })}
            <div className="layering-terminal-note">
              <span>经销商层</span>
              <StatusPill tone="stone">强制停靠终点</StatusPill>
            </div>
          </div>
        </aside>

        <section className="card layering-tree-card">
          <CardTitle
            title="六层停靠树"
            detail="点击同层节点可切换展开路径；已停靠节点的下游仅作灰显说明"
            actions={(
              <span className="layering-conservation-check conservation-check">
                Σ {frontierAllocated} / {layeringSupply}
                {layeringDecision.supplyConserved ? " ✓" : ""}
              </span>
            )}
          />

          <div ref={layeringTreeScrollRef} className="layering-tree-scroll">
            <div className="layering-tree" aria-label="六层组织停靠决策树">
              {TIER_ORDER.map((tier, tierIndex) => {
                const nodes = levels.get(tier) ?? [];
                return (
                  <div className="layering-tier" key={tier}>
                    <div className="layering-tier-title">
                      <span>{String(tierIndex + 1).padStart(2, "0")}</span>
                      <strong>{TIER_LABELS[tier]}</strong>
                    </div>
                    <div className="layering-tier-nodes">
                      {nodes.map(({ node, decision, blocked }) => {
                        const selected =
                          selectCandidate(nodes, selectedPath[tier])?.node.id ===
                          node.id;
                        const stopped = Boolean(decision?.stopped);
                        return (
                          <button
                            type="button"
                            key={node.id}
                            className={[
                              "layering-node",
                              selected ? "selected" : "",
                              highlightedNodeId === node.id
                                ? "trace-highlight"
                                : "",
                              stopped ? "stopped" : "",
                              blocked ? "blocked" : "",
                            ].filter(Boolean).join(" ")}
                            onClick={() => chooseNode(tier, node.id)}
                            aria-pressed={selected}
                            id={`layer-node-${node.id}`}
                            data-testid={`layer-node-${node.id}`}
                          >
                            <span className="layering-node-name">
                              <strong>{node.name}</strong>
                              {stopped && (
                                <StatusPill tone="amber">
                                  <CheckCircle2 size={12} /> 停靠
                                </StatusPill>
                              )}
                            </span>
                            <span className="layering-node-metrics">
                              <span>净需求 <b>{node.netDemand}</b></span>
                              <span>
                                分配 <b>{decision?.allocatedUnits ?? "—"}</b>
                              </span>
                            </span>
                            {blocked ? (
                              <small>上游已停靠，可直接下单</small>
                            ) : decision ? (
                              <>
                                <span
                                  className="layering-node-progress"
                                  style={nodeProgress(decision.satisfaction)}
                                >
                                  <i />
                                </span>
                                <small>
                                  满足度 {percent(decision.satisfaction)}
                                  {decision.stopped
                                    ? ` ≥ 阈值 ${percent(layeringConfig.stopThresholds[tier])}`
                                    : ` < 阈值 ${percent(layeringConfig.stopThresholds[tier])}`}
                                </small>
                              </>
                            ) : (
                              <small>等待上层决策</small>
                            )}
                          </button>
                        );
                      })}
                      {nodes.length === 0 && (
                        <div className="layering-tier-empty">
                          <CheckCircle2 size={16} />
                          <span>上游已停靠</span>
                          <small>本层无需继续拆分</small>
                        </div>
                      )}
                    </div>
                    {tierIndex < TIER_ORDER.length - 1 && (
                      <ChevronRight
                        className="layering-tier-arrow"
                        size={18}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <TraceConsole
        title="Agent 决策轨迹"
        subtitle={`${layeringDecision.trace.length} 步 · 同输入可复现 · 点击步骤定位树节点`}
        technicalLabel="layering.trace"
        variant="band"
        collapsible
        activeRefId={highlightedNodeId}
        onStepClick={highlightTraceNode}
        visibleSteps={
          shotPreset === "layering-p1"
            ? [0]
            : shotPreset === "layering-p2"
              ? [0, 1, 2, 3]
              : undefined
        }
        steps={layeringDecision.trace.map((step) => ({
          index: step.step,
          scope: TIER_LABELS[step.tier],
          action: step.action,
          value: step.allocatedUnits,
          reason: `${step.nodeName} · ${step.reason}`,
          refId: step.nodeId,
        }))}
        footer={(
          <>
            frontier Σ = {frontierAllocated} · supply = {layeringSupply}
            {layeringDecision.supplyConserved ? " ✓" : ""}
          </>
        )}
      />
    </div>
  );
}
