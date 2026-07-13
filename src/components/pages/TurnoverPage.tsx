"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  Warehouse,
} from "lucide-react";
import { classifyInventoryHealth, estimateSellThrough } from "@/src/core/inventory";
import type { InventoryConfidence, InventoryHealthTag } from "@/src/core/types";
import { useDemo } from "@/src/store/DemoContext";
import { DeferredResponsiveContainer } from "@/src/components/ui/DeferredResponsiveContainer";
import { CardTitle, PageHeading, StatusPill } from "@/src/components/ui/Primitives";

const CONFIDENCE_LABELS: Record<InventoryConfidence, string> = {
  high: "高",
  mid: "中",
  low: "低",
  untrusted: "不可信",
};

const HEALTH_LABELS: Record<InventoryHealthTag, { label: string; tone: "stone" | "emerald" | "amber" | "blue" }> = {
  healthy: { label: "健康", tone: "emerald" },
  overstock: { label: "积压", tone: "amber" },
  stockout_risk: { label: "断货风险", tone: "blue" },
};

export function TurnoverPage() {
  const { inventorySeeds, openCalibration } = useDemo();
  const [selectedDealer, setSelectedDealer] = useState("A");
  const selected = inventorySeeds.find((item) => item.dealerId === selectedDealer) ?? inventorySeeds[0];

  const confidenceData = useMemo(() => {
    const start = new Date("2026-07-06T00:00:00+08:00");
    const inbound = [0, 18, 0, 12, 0, 16, 0, 0, 20, 0, 12, 0, 14, 0];
    let estimate = selected.lastTruthInventory;
    return Array.from({ length: 14 }, (_, index) => {
      const cycleDay = index % 7;
      if (index > 0) estimate += inbound[index] - selected.estimatedDailySellThrough;
      if (cycleDay === 0 && index > 0) estimate = Math.max(0, estimate - 2.4);
      const halfWidth = cycleDay * (1.35 + selected.estimatedDailySellThrough * 0.08);
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const lower = Math.max(0, estimate - halfWidth);
      const upper = estimate + halfWidth;
      return {
        date: `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`,
        estimate: Number(estimate.toFixed(1)),
        lower: Number(lower.toFixed(1)),
        upper: Number(upper.toFixed(1)),
        band: Number((upper - lower).toFixed(1)),
        truth: cycleDay === 0 ? Number(estimate.toFixed(1)) : null,
      };
    });
  }, [selected]);

  const tableRows = inventorySeeds.map((seed) => ({
    seed,
    flow: estimateSellThrough(seed),
    health: classifyInventoryHealth(seed.currentInventory, seed.monthlyAverageAllocation),
  }));
  const dealerTurnover = selected.currentInventory / Math.max(1, selected.monthlyAverageAllocation / 4.345);
  const headquartersTurnover = selected.headquartersTurnoverWeeks;
  const conflict = Math.abs(dealerTurnover - headquartersTurnover) >= 0.35;

  return (
    <div className="page turnover-page" data-testid="page-turnover">
      <PageHeading
        title="周转与校准"
        help="日库存由周一真值、已知分货入库和估算动销递推；置信区间随距真值天数逐日扩大。"
        actions={(
          <button type="button" className="button primary" onClick={openCalibration} data-testid="open-calibration">
            <CalendarCheck size={16} /> 周初校准
          </button>
        )}
      />

      <section className="card confidence-card">
        <CardTitle
          title="14 天日库存估算"
          detail="置信带在每周一真值日收窄"
          actions={(
            <div className="confidence-actions">
              <div className="chart-legend"><span><i className="dot stone" />真值</span><span><i className="dot blue" />估算</span><span><i className="band-swatch" />置信区间</span></div>
              <select value={selectedDealer} onChange={(event) => setSelectedDealer(event.target.value)} aria-label="选择经销商查看库存估算">
                {inventorySeeds.map((seed) => <option value={seed.dealerId} key={seed.dealerId}>{seed.dealerName}</option>)}
              </select>
            </div>
          )}
        />
        <div className="confidence-chart">
          <DeferredResponsiveContainer width="100%" height="100%">
            <ComposedChart data={confidenceData} margin={{ top: 22, right: 32, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#e7e5e4" }} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 10, fill: "#a8a29e", fontFamily: "JetBrains Mono" }} domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, fontSize: 12 }}
                formatter={(value, name) => [`${value} 台`, name === "estimate" ? "库存估算" : name === "upper" ? "补货口径（上界）" : name === "lower" ? "保供口径（下界）" : "库存真值"]}
              />
              <Area dataKey="lower" stackId="confidence" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="band" stackId="confidence" stroke="none" fill="#1d4ed8" fillOpacity={0.08} isAnimationActive={false} />
              <Line dataKey="upper" name="补货口径（上界）" stroke="#93c5fd" strokeWidth={1} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
              <Line dataKey="lower" name="保供口径（下界）" stroke="#93c5fd" strokeWidth={1} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
              <Line dataKey="estimate" name="库存估算" stroke="#1d4ed8" strokeWidth={2.4} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Scatter dataKey="truth" name="库存真值" fill="#1c1917" isAnimationActive={false} />
            </ComposedChart>
          </DeferredResponsiveContainer>
        </div>
        <div className="confidence-bound-labels"><span>上界用于补货判断</span><span>下界用于保供判断</span></div>
      </section>

      <div className="turnover-grid">
        <section className="card turnover-table-card">
          <CardTitle title="经销商周转" detail="分货入库为正，估算去货为库存流出" />
          <div className="table-wrap">
            <table className="data-table turnover-table">
              <thead><tr><th>经销商</th><th>期初</th><th>入库</th><th>期末</th><th>估算去货</th><th>去货率</th><th>健康度</th><th>置信度</th><th>下一轮</th></tr></thead>
              <tbody>
                {tableRows.map(({ seed, flow, health }) => {
                  const healthLabel = HEALTH_LABELS[health.tag];
                  return (
                    <tr key={seed.dealerId} className={`${selectedDealer === seed.dealerId ? "selected" : ""} ${seed.confidence === "untrusted" ? "untrusted" : ""}`} onClick={() => setSelectedDealer(seed.dealerId)}>
                      <td><strong>{seed.dealerName}</strong></td>
                      <td className="numeric">{seed.beginningInventory}</td>
                      <td className="numeric">+{seed.inboundAllocation}</td>
                      <td className="numeric">{seed.endingInventory}</td>
                      <td className="numeric strong">{flow.estimatedSellThroughUnits}</td>
                      <td className="numeric">{(flow.sellThroughRate * 100).toFixed(1)}%</td>
                      <td><StatusPill tone={healthLabel.tone}>{healthLabel.label}</StatusPill></td>
                      <td><ConfidenceDots confidence={seed.confidence} /></td>
                      <td>{seed.confidence === "untrusted" ? <StatusPill tone="stone">只走保底</StatusPill> : health.tag === "overstock" ? "少给" : health.tag === "stockout_risk" ? "优先补" : "保持"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card turnover-side-card">
          <CardTitle title="双视角周转" />
          <div className="primary-turnover">
            <span><Warehouse size={17} />经销商侧（主）</span>
            <strong>{dealerTurnover.toFixed(1)}<sup>周</sup></strong>
          </div>
          <div className="secondary-turnover">
            <span>总部 / 仓库（参考）</span>
            <strong>{headquartersTurnover.toFixed(1)}<sup>周</sup></strong>
          </div>
          {conflict && (
            <div className="turnover-conflict"><CircleAlert size={17} /><span>两种口径存在差异，本轮按经销商侧周转决策。</span></div>
          )}
          <div className="inventory-formula">
            <span>估算去货</span>
            <strong>期初库存 + 本期分货量 − 期末库存</strong>
          </div>
          <button type="button" className="button outline full" onClick={openCalibration}><RefreshCw size={16} />模拟周一真值到达</button>
        </aside>
      </div>
    </div>
  );
}

function ConfidenceDots({ confidence }: { confidence: InventoryConfidence }) {
  const level = confidence === "high" ? 3 : confidence === "mid" ? 2 : confidence === "low" ? 1 : 0;
  return (
    <span className={`confidence-dots ${confidence}`} aria-label={`置信度${CONFIDENCE_LABELS[confidence]}`}>
      <i className={level >= 1 ? "active" : ""} /><i className={level >= 2 ? "active" : ""} /><i className={level >= 3 ? "active" : ""} />
      <b>{CONFIDENCE_LABELS[confidence]}</b>
    </span>
  );
}
