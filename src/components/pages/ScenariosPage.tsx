"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  GitCompareArrows,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useDemo } from "@/src/store/DemoContext";
import type { AllocationPlanId } from "@/src/core/types";
import { DeferredResponsiveContainer } from "@/src/components/ui/DeferredResponsiveContainer";
import { CardTitle, PageHeading, StatusPill } from "@/src/components/ui/Primitives";

const PLAN_ICON = {
  fair: Scale,
  balanced: ShieldCheck,
  efficiency: TrendingUp,
};

const DEALER_COLORS = ["#1d4ed8", "#059669", "#d97706", "#78716c", "#7c3aed", "#0f766e"];

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ScenariosPage() {
  const { plans, dealers, selectedPlan, adoptPlan, shotPreset, notify } = useDemo();
  const [calculating, setCalculating] = useState(false);
  const [highlightedDealer, setHighlightedDealer] = useState(shotPreset === "scenarios" ? "A" : dealers[0]?.id ?? "A");

  const chartData = useMemo(
    () => plans.map((plan) => ({
      plan: plan.name.replace(/^方案\s*[ABC]\s*·\s*/, ""),
      ...Object.fromEntries(
        dealers.map((dealer) => [
          dealer.id,
          plan.allocation.results.find((result) => result.dealerId === dealer.id)?.finalAlloc ?? 0,
        ]),
      ),
    })),
    [dealers, plans],
  );

  const differences = useMemo(
    () => dealers
      .map((dealer) => {
        const values = plans.map((plan) => plan.allocation.results.find((result) => result.dealerId === dealer.id)?.finalAlloc ?? 0);
        return { dealer, values, spread: Math.max(...values) - Math.min(...values) };
      })
      .sort((left, right) => right.spread - left.spread),
    [dealers, plans],
  );

  return (
    <div className="page scenarios-page" data-testid="page-scenarios">
      <PageHeading
        title="方案对比"
        help="三套方案使用同一组供给、需求和额度硬约束，只调整公平预算比例，便于业务选择取向。"
        actions={(
          <button
            type="button"
            className="button ghost"
            disabled={calculating}
            onClick={() => {
              setCalculating(true);
              window.setTimeout(() => {
                setCalculating(false);
                notify("方案已更新", "三套方案已使用当前输入重新计算。 ");
              }, 320);
            }}
          >
            <RefreshCw size={16} className={calculating ? "spin" : ""} /> 重新生成三套方案
          </button>
        )}
      />

      <div className={`scenario-cards ${calculating ? "recalculating" : ""}`}>
        {plans.map((plan) => {
          const Icon = PLAN_ICON[plan.id];
          const active = selectedPlan === plan.id;
          return (
            <section className={`scenario-card card ${active ? "selected" : ""}`} key={plan.id} data-testid={`plan-${plan.id}`}>
              <div className="scenario-card-head">
                <span className="scenario-icon"><Icon size={20} /></span>
                <div><span>β = {plan.params.fairBudgetRatio.toFixed(1)}</span><h2>{plan.name}</h2></div>
                {plan.recommended && <StatusPill tone="blue">推荐</StatusPill>}
              </div>
              <div className="scenario-metrics">
                <div><span>覆盖经销商</span><strong>{plan.metrics.coveredDealerCount}<small>家</small></strong></div>
                <div><span>预计缺货率</span><strong>{percent(plan.metrics.expectedShortageRate)}</strong></div>
                <div><span>整体周转指数</span><strong>{percent(plan.metrics.turnoverIndex)}</strong></div>
                <div><span>分货集中度</span><strong>{percent(plan.metrics.concentrationIndex)}</strong></div>
              </div>
              <button
                type="button"
                className={`button ${active ? "primary" : "outline"}`}
                onClick={() => adoptPlan(plan.id as AllocationPlanId)}
              >
                {active ? <Check size={16} /> : <GitCompareArrows size={16} />}
                {active ? "当前方案" : "采用此方案"}
              </button>
            </section>
          );
        })}
      </div>

      <div className="scenario-analysis-grid">
        <section className="card slope-card">
          <CardTitle
            title="逐经销商分配变化"
            detail="选择经销商查看三套方案的变化幅度"
            actions={(
              <div className="dealer-legend">
                {dealers.map((dealer, index) => (
                  <button
                    type="button"
                    key={dealer.id}
                    className={highlightedDealer === dealer.id ? "active" : ""}
                    onMouseEnter={() => setHighlightedDealer(dealer.id)}
                    onFocus={() => setHighlightedDealer(dealer.id)}
                    onClick={() => setHighlightedDealer(dealer.id)}
                  >
                    <i style={{ background: DEALER_COLORS[index % DEALER_COLORS.length] }} />{dealer.id}
                  </button>
                ))}
              </div>
            )}
          />
          <div className="slope-chart">
            <DeferredResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 18, right: 26, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="plan" tickLine={false} axisLine={{ stroke: "#e7e5e4" }} tick={{ fontSize: 11, fill: "#78716c" }} />
                <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} />
                <Tooltip
                  cursor={{ stroke: "#d6d3d1", strokeDasharray: "3 3" }}
                  contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }}
                  formatter={(value, name) => [`${value} 台`, dealers.find((dealer) => dealer.id === name)?.name ?? name]}
                />
                {dealers.map((dealer, index) => (
                  <Line
                    key={dealer.id}
                    dataKey={dealer.id}
                    type="linear"
                    stroke={DEALER_COLORS[index % DEALER_COLORS.length]}
                    strokeWidth={highlightedDealer === dealer.id ? 3 : 1.25}
                    strokeOpacity={highlightedDealer === dealer.id ? 1 : 0.25}
                    dot={{ r: highlightedDealer === dealer.id ? 4 : 2.5, fill: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    onMouseEnter={() => setHighlightedDealer(dealer.id)}
                  />
                ))}
              </LineChart>
            </DeferredResponsiveContainer>
          </div>
        </section>

        <aside className="card difference-card">
          <CardTitle title="差异最大" detail="按最大分配差排序" />
          <div className="difference-list">
            {differences.slice(0, 3).map((item, index) => (
              <button type="button" key={item.dealer.id} onClick={() => setHighlightedDealer(item.dealer.id)}>
                <span className="difference-rank">{index + 1}</span>
                <span><strong>{item.dealer.name}</strong><small>{item.values.join(" / ")} 台</small></span>
                <b>Δ {item.spread}</b>
              </button>
            ))}
          </div>
          <div className="scenario-total-check">
            <span>三套方案合计</span>
            <strong>{plans.map((plan) => plan.allocation.totalAllocated).join(" / ")}</strong>
            <StatusPill tone="emerald">守恒</StatusPill>
          </div>
        </aside>
      </div>
    </div>
  );
}
