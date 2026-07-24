"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  allocateChannelSequence,
  applyWklyRatio,
  computePaPlanRatio,
  resolveWeeklyAllocation,
  type PaPlanRatioInput,
} from "@/src/core/ratios";
import {
  allocateColorVariants,
  isSkipped,
  type ColorVariant,
} from "@/src/core/specialMaterials";
import type { Dealer } from "@/src/core/types";
import { useDemo } from "@/src/store/DemoContext";
import {
  CardTitle,
  PageHeading,
  StatusPill,
} from "@/src/components/ui/Primitives";
import { TraceConsole } from "@/src/components/ui/TraceConsole";

interface RfpDealer extends Dealer {
  monthlyTarget?: number;
  turnoverWeeks?: number;
  isDirectSales?: boolean;
}

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function scoreStyle(value: number): CSSProperties {
  return {
    "--ratio-score": `${Math.max(0, Math.min(100, value * 100))}%`,
  } as CSSProperties;
}

function numberInputValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function RatiosPage() {
  const {
    dealers,
    params,
    activeSku,
    ratioConfig,
    updateRatioWeights,
    updateWklyRatio,
    toggleBigCustomer,
    updateBigCustomerK,
    bigCustomers,
    colorVariants,
    updateColorVariantDo,
    skipList,
    addSkipMaterial,
    removeSkipMaterial,
    notify,
    shotPreset,
  } = useDemo();
  const [selectedDealerId, setSelectedDealerId] = useState(
    dealers[0]?.id ?? "",
  );
  const [skipDraft, setSkipDraft] = useState("");

  useEffect(() => {
    if (!dealers.some((dealer) => dealer.id === selectedDealerId)) {
      setSelectedDealerId(dealers[0]?.id ?? "");
    }
  }, [dealers, selectedDealerId]);

  const selectedDealer = (
    dealers.find((dealer) => dealer.id === selectedDealerId) ?? dealers[0]
  ) as RfpDealer | undefined;
  const wklyRatio =
    ratioConfig.wklyRatioByCategory[activeSku.category] ?? 0.25;
  const selectedIsBig = selectedDealer
    ? Boolean(bigCustomers[selectedDealer.id])
    : false;
  const monthlyTarget = selectedDealer
    ? selectedDealer.monthlyTarget ??
      Math.max(selectedDealer.demand, selectedDealer.demand * 4)
    : 0;
  const turnoverWeeks = selectedDealer
    ? selectedDealer.turnoverWeeks ??
      selectedDealer.inventory /
        Math.max(1, monthlyTarget / 4.345)
    : 0;

  const ratioInput = useMemo<PaPlanRatioInput>(
    () => ({
      supply: params.supply,
      netDemand: selectedDealer?.demand ?? 0,
      scarcity: params.scarcity,
      orders: selectedDealer?.demand ?? 0,
      inventory: selectedDealer?.inventory ?? 0,
      creditBalance: selectedDealer?.creditCapUnits ?? 0,
      turnoverWeeks,
      wklyRatio,
      isBigCustomer: selectedIsBig,
      kBig: ratioConfig.kBig,
      isDirectSales: Boolean(selectedDealer?.isDirectSales),
      bufferRatio: ratioConfig.bufferRatio,
      weights: ratioConfig.weights,
    }),
    [
      params.scarcity,
      params.supply,
      ratioConfig.bufferRatio,
      ratioConfig.kBig,
      ratioConfig.weights,
      selectedDealer,
      selectedIsBig,
      turnoverWeeks,
      wklyRatio,
    ],
  );
  const paPlan = useMemo(() => computePaPlanRatio(ratioInput), [ratioInput]);
  const weeklyPlan = useMemo(
    () =>
      applyWklyRatio(
        monthlyTarget,
        wklyRatio,
        selectedIsBig,
        ratioConfig.kBig,
      ),
    [monthlyTarget, ratioConfig.kBig, selectedIsBig, wklyRatio],
  );
  const weeklyResolution = useMemo(
    () =>
      resolveWeeklyAllocation({
        requestedUnits: selectedDealer?.demand ?? 0,
        creditCapUnits: selectedDealer?.creditCapUnits ?? 0,
        monthlyTarget,
        wklyRatio,
        isBigCustomer: selectedIsBig,
        kBig: ratioConfig.kBig,
      }),
    [
      monthlyTarget,
      ratioConfig.kBig,
      selectedDealer,
      selectedIsBig,
      wklyRatio,
    ],
  );
  const directDemand = dealers.reduce((sum, dealer, index) => {
    const rfpDealer = dealer as RfpDealer;
    return sum + (rfpDealer.isDirectSales || index === 0 ? dealer.demand : 0);
  }, 0);
  const channelSequence = useMemo(
    () =>
      allocateChannelSequence({
        supply: params.supply,
        directDemand,
        bufferRatio: ratioConfig.bufferRatio,
      }),
    [directDemand, params.supply, ratioConfig.bufferRatio],
  );

  const modelTotalTarget = colorVariants.reduce(
    (sum, variant) => sum + variant.target,
    0,
  );
  const colorAllocation = useMemo(
    () =>
      allocateColorVariants(
        colorVariants,
        modelTotalTarget,
        modelTotalTarget,
      ),
    [colorVariants, modelTotalTarget],
  );
  const resultByMaterial = useMemo(
    () =>
      new Map(
        colorAllocation.results.map((result) => [
          result.materialCode,
          result,
        ]),
      ),
    [colorAllocation.results],
  );
  const currentSkuSkipped = isSkipped(activeSku.id, skipList);

  const dimensions = [
    {
      key: "supplyDemand",
      label: "供需态势",
      detail: "覆盖率 · 缺货度",
      score: paPlan.breakdown.supplyDemand,
    },
    {
      key: "operation",
      label: "经营状态",
      detail: "订单 · 库存 · 额度 · 周转",
      score: paPlan.breakdown.operation,
    },
    {
      key: "strategy",
      label: "策略配置",
      detail: "Wkly · 大客户 · 直营",
      score: paPlan.breakdown.strategy,
    },
  ] as const;

  const addSkip = () => {
    const materialCode = skipDraft.trim().toUpperCase();
    if (!materialCode) return;
    if (isSkipped(materialCode, skipList)) {
      notify("物料已在清单中", `${materialCode} 无需重复添加。`);
      return;
    }
    addSkipMaterial(materialCode);
    setSkipDraft("");
    notify("Skip 清单已更新", `${materialCode} 将转 SSP 人工分配。`);
  };

  return (
    <div
      className={`page ratios-page ${shotPreset.startsWith("ratios-") ? "ratios-shot-preset" : ""}`}
      data-testid="page-ratios"
    >
      <PageHeading
        title="比例与特殊物料"
        help="PA Plan Ratio 由供需态势、经营状态和策略配置三维合成；Wkly Ratio、大客户、直营 Buffer 与多色规则均保留独立约束与计算轨迹。"
        context={(
          <span className="ratios-heading-context">
            <StatusPill tone="blue">{activeSku.category}</StatusPill>
            <StatusPill tone={currentSkuSkipped ? "amber" : "emerald"}>
              {currentSkuSkipped ? "当前 SKU 命中 Skip" : "当前 SKU 可自动分配"}
            </StatusPill>
          </span>
        )}
      />

      <div
        className="ratios-composition-grid"
        data-testid="ratio-section-pa"
      >
        <section className="card ratio-system-card">
          <CardTitle
            title="PA Plan Ratio · 三维度合成"
            detail={`当前观察：${selectedDealer?.name ?? "暂无经销商"}`}
            actions={(
              <div className="ratio-final-value">
                <span>最终 ratio</span>
                <strong>{paPlan.ratio.toFixed(3)}</strong>
              </div>
            )}
          />

          <div className="ratio-flow" aria-label="PA Plan Ratio 三维度合成">
            {dimensions.map((dimension, index) => (
              <div className="ratio-flow-fragment" key={dimension.key}>
                <article className={`ratio-dimension ${dimension.key}`}>
                  <div>
                    <strong>{dimension.label}</strong>
                    <span>{dimension.detail}</span>
                  </div>
                  <b>{dimension.score.toFixed(3)}</b>
                  <span
                    className="ratio-score-track"
                    style={scoreStyle(dimension.score)}
                  >
                    <i />
                  </span>
                </article>
                {index < dimensions.length - 1 && (
                  <ArrowRight size={17} aria-hidden="true" />
                )}
              </div>
            ))}
            <ArrowRight size={19} aria-hidden="true" />
            <div className="ratio-result-node">
              <span>PA Plan Ratio</span>
              <strong>{paPlan.ratio.toFixed(3)}</strong>
              <small>v{ratioConfig.version}</small>
            </div>
          </div>

          <div className="ratio-composition-evidence">
            <div className="ratio-evidence-head">
              <strong>本次合成输入</strong>
              <span>所有中间量来自当前经销商快照</span>
            </div>
            <div className="ratio-evidence-grid">
              <div><span>需求</span><strong>{selectedDealer?.demand ?? 0}<small>台</small></strong></div>
              <div><span>库存</span><strong>{selectedDealer?.inventory ?? 0}<small>台</small></strong></div>
              <div><span>额度</span><strong>{selectedDealer?.creditCapUnits ?? 0}<small>台</small></strong></div>
              <div><span>消化周转</span><strong>{turnoverWeeks.toFixed(1)}<small>周</small></strong></div>
            </div>
            <p>
              {paPlan.breakdown.supplyDemand.toFixed(3)} ×{" "}
              {ratioConfig.weights.supplyDemand.toFixed(2)} +{" "}
              {paPlan.breakdown.operation.toFixed(3)} ×{" "}
              {ratioConfig.weights.operation.toFixed(2)} +{" "}
              {paPlan.breakdown.strategy.toFixed(3)} ×{" "}
              {ratioConfig.weights.strategy.toFixed(2)} →{" "}
              <strong>{paPlan.ratio.toFixed(3)}</strong>
            </p>
          </div>

        </section>

        <aside className="card ratio-config-card">
            <CardTitle
              title="PIC 参数配置"
              detail={`产品组：${activeSku.category}`}
            />
            <label className="field-label">
              <span>观察经销商</span>
              <select
                value={selectedDealer?.id ?? ""}
                onChange={(event) => setSelectedDealerId(event.target.value)}
                data-testid="ratio-dealer-select"
              >
                {dealers.map((dealer) => (
                  <option value={dealer.id} key={dealer.id}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="ratio-weight-list">
              {dimensions.map((dimension) => {
                const value = ratioConfig.weights[dimension.key];
                return (
                  <label className="parameter-slider" key={dimension.key}>
                    <span>
                      <b>{dimension.label}权重</b>
                      <strong>{value.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={value}
                      aria-label={`${dimension.label}权重`}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        const nextWeights = {
                          ...ratioConfig.weights,
                          [dimension.key]: nextValue,
                        };
                        if (
                          nextWeights.supplyDemand +
                            nextWeights.operation +
                            nextWeights.strategy >
                          0
                        ) {
                          updateRatioWeights({
                            [dimension.key]: nextValue,
                          });
                        }
                      }}
                    />
                  </label>
                );
              })}
            </div>

            <label className="parameter-slider ratio-weekly-field">
              <span>
                <b>{activeSku.category} Wkly Ratio</b>
                <strong>{percent(wklyRatio)}</strong>
              </span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={wklyRatio}
                aria-label={`${activeSku.category} Wkly Ratio`}
                onChange={(event) =>
                  updateWklyRatio(
                    activeSku.category,
                    Number(event.target.value),
                  )
                }
              />
            </label>

            <label className="dealer-field ratio-kbig-field">
              <span>大客户增益 kBig</span>
              <input
                type="number"
                min={1}
                max={2}
                step={0.05}
                value={numberInputValue(ratioConfig.kBig)}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (Number.isFinite(nextValue) && nextValue >= 1) {
                    updateBigCustomerK(nextValue);
                  }
                }}
              />
            </label>

            <div className="big-customer-control">
              <div>
                <Building2 size={16} />
                <span>
                  <strong>大客户标识</strong>
                  <small>只豁免周上限，不豁免额度</small>
                </span>
              </div>
              <button
                type="button"
                className={`mode-switch ${selectedIsBig ? "manual" : ""}`}
                onClick={() => {
                  if (selectedDealer) toggleBigCustomer(selectedDealer.id);
                }}
                aria-pressed={selectedIsBig}
                data-testid="toggle-big-customer"
              >
                {selectedIsBig ? "已启用" : "未启用"}
              </button>
            </div>
        </aside>
      </div>

      <section
        className="ratio-rule-grid"
        aria-label="周比例与渠道顺序"
        data-testid="ratio-section-rules"
      >
        <article className="card ratio-rule-card weekly">
          <div className="ratio-rule-title">
            <span>Wkly Ratio</span>
            <StatusPill tone={weeklyPlan.exempted ? "amber" : "blue"}>
              {weeklyPlan.exempted ? "大客户豁免周上限" : "周上限生效"}
            </StatusPill>
          </div>
          <div className="ratio-equation">
            <strong>{monthlyTarget}</strong>
            <span>×</span>
            <strong>{percent(wklyRatio)}</strong>
            <span>=</span>
            <strong>
              {weeklyPlan.weeklyCap ?? weeklyPlan.planningReference}
              <small>台</small>
            </strong>
          </div>
          <p>{weeklyPlan.note}</p>
        </article>

        <article className="card ratio-rule-card credit">
          <div className="ratio-rule-title">
            <span>硬约束收口</span>
            <StatusPill
              tone={
                weeklyResolution.cappedByCredit ||
                weeklyResolution.cappedByWeekly
                  ? "amber"
                  : "emerald"
              }
            >
              {weeklyResolution.cappedByCredit
                ? "额度封顶"
                : weeklyResolution.cappedByWeekly
                  ? "周上限封顶"
                  : "校验通过"}
            </StatusPill>
          </div>
          <div className="ratio-equation">
            <strong>{weeklyResolution.requestedUnits}</strong>
            <span>→</span>
            <strong>{weeklyResolution.allocatedUnits}</strong>
            <small>台</small>
          </div>
          <p>
            即使豁免 Wkly Ratio，最终仍受额度 ≤{" "}
            {selectedDealer?.creditCapUnits ?? 0} 台约束。
          </p>
        </article>

        <article className="card ratio-rule-card channel-sequence-card">
          <div className="channel-sequence-head">
            <strong>直营优先 + Buffer</strong>
            <span>Σ {channelSequence.totalAccounted} / {params.supply}</span>
          </div>
          <div className="channel-sequence-steps">
            <div>
              <span>01</span>
              <p>直营优先</p>
              <strong>
                {channelSequence.directAllocated}<small>台</small>
              </strong>
            </div>
            <ArrowRight size={16} />
            <div>
              <span>02</span>
              <p>预留 Buffer</p>
              <strong>
                {channelSequence.bufferReserved}<small>台</small>
              </strong>
            </div>
            <ArrowRight size={16} />
            <div>
              <span>03</span>
              <p>其他渠道池</p>
              <strong>
                {channelSequence.otherChannelsPool}<small>台</small>
              </strong>
            </div>
          </div>
        </article>
      </section>

      <div
        className="special-material-grid"
        data-testid="ratio-section-special"
      >
        <section className="card color-variant-card">
          <CardTitle
            title="同型号多色分配"
            detail="按过去 3 个月 DO 拆分；单色可超目标，型号总量必须收口"
            actions={(
              <StatusPill
                tone={colorAllocation.modelTotalCheck.passed ? "emerald" : "red"}
              >
                <ShieldCheck size={13} />
                总量收口 {colorAllocation.modelTotalCheck.sum} ≤{" "}
                {colorAllocation.modelTotalCheck.cap}
              </StatusPill>
            )}
          />
          <div className="table-wrap">
            <table className="data-table color-variant-table">
              <thead>
                <tr>
                  <th>物料代码</th>
                  <th>颜色</th>
                  <th>单色目标</th>
                  <th>近 3 月 DO</th>
                  <th>DO 占比</th>
                  <th>最终分配</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {colorVariants.map((variant: ColorVariant) => {
                  const result = resultByMaterial.get(variant.materialCode);
                  const totalDo = colorVariants.reduce(
                    (sum, item) => sum + item.doLast3Months,
                    0,
                  );
                  return (
                    <tr key={variant.materialCode}>
                      <td className="numeric strong">{variant.materialCode}</td>
                      <td>{variant.colorName}</td>
                      <td className="numeric">{variant.target}</td>
                      <td>
                        <input
                          className="color-do-input"
                          type="number"
                          min={0}
                          value={variant.doLast3Months}
                          aria-label={`${variant.materialCode}近三个月DO`}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            if (
                              Number.isFinite(nextValue) &&
                              nextValue >= 0
                            ) {
                              updateColorVariantDo(
                                variant.materialCode,
                                nextValue,
                              );
                            }
                          }}
                        />
                      </td>
                      <td className="numeric">
                        {percent(
                          totalDo
                            ? variant.doLast3Months / totalDo
                            : 1 / Math.max(1, colorVariants.length),
                          1,
                        )}
                      </td>
                      <td className="numeric strong">
                        {result?.allocated ?? 0}
                      </td>
                      <td>
                        {result?.exceededOwnTarget ? (
                          <StatusPill tone="amber">单色超目标</StatusPill>
                        ) : (
                          <StatusPill tone="blue">目标内</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="color-model-check" data-testid="color-model-check">
            <BadgeCheck size={17} />
            <span>
              型号 {colorVariants[0]?.modelId ?? activeSku.id}：
              {colorAllocation.results
                .map((result) => result.allocated)
                .join(" + ")}{" "}
              = <strong>{colorAllocation.modelTotalCheck.sum}</strong> ≤ 型号目标{" "}
              <strong>{colorAllocation.modelTotalCheck.cap}</strong>
            </span>
          </div>
        </section>

        <aside className="card skip-list-card">
          <CardTitle
            title="Skip 免分配清单"
            detail="精确命中物料代码后转 SSP 人工分配"
          />
          <div className="skip-add-row">
            <input
              value={skipDraft}
              placeholder="输入物料代码"
              aria-label="添加 Skip 物料代码"
              onChange={(event) => setSkipDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addSkip();
              }}
            />
            <button
              type="button"
              className="button primary"
              onClick={addSkip}
              data-testid="add-skip-material"
            >
              <Plus size={15} /> 添加
            </button>
          </div>
          <div className="skip-material-list">
            {skipList.map((materialCode) => (
              <div key={materialCode}>
                <span>
                  <strong>{materialCode}</strong>
                  <small>转 SSP 人工分配</small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`从 Skip 清单移除 ${materialCode}`}
                  onClick={() => removeSkipMaterial(materialCode)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {skipList.length === 0 && (
              <div className="skip-list-empty">
                <ShieldCheck size={17} />
                <span>当前没有免分配物料</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      <TraceConsole
        title="计算轨迹"
        subtitle="每个得分均可解释、可复现"
        technicalLabel="pa_plan_ratio.trace"
        variant="band"
        collapsible
        defaultCollapsed
        className="ratio-trace-band"
        steps={[...paPlan.trace, ...channelSequence.trace].map(
          (message, index) => ({
            index: index + 1,
            scope: index < paPlan.trace.length ? "比例" : "顺序",
            action: index < paPlan.trace.length ? "SCORE" : "ALLOC",
            value: "—",
            reason: message,
          }),
        )}
        footer={(
          <>
            ratio = {paPlan.ratio.toFixed(4)} · allocation Σ ={" "}
            {channelSequence.totalAccounted} ✓
          </>
        )}
      />
    </div>
  );
}
