"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  History,
  MessageSquareText,
  Palette,
  Percent,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import type {
  AlertCategory,
  AlertSeverity,
  DiagnosticAlert,
} from "@/src/core/diagnostics";
import { useDemo } from "@/src/store/DemoContext";
import {
  CardTitle,
  PageHeading,
  StatusPill,
} from "@/src/components/ui/Primitives";

const CATEGORY_META: Record<
  AlertCategory,
  { label: string; description: string; icon: typeof Database }
> = {
  data: {
    label: "数据类",
    description: "源系统缺数、口径异常与采集时效",
    icon: Database,
  },
  result: {
    label: "结果类",
    description: "满足度、集中度与零分配异常",
    icon: Activity,
  },
  execution: {
    label: "执行类",
    description: "RFC 回写、任务超时与重试状态",
    icon: Workflow,
  },
};

const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; tone: "stone" | "amber" | "red" }
> = {
  info: { label: "提示", tone: "stone" },
  warning: { label: "关注", tone: "amber" },
  danger: { label: "高风险", tone: "red" },
};

const ROLE_MATRIX = [
  {
    role: "PIC",
    configure: true,
    trigger: true,
    rollback: true,
    export: true,
  },
  {
    role: "业务用户",
    configure: false,
    trigger: true,
    rollback: false,
    export: true,
  },
  {
    role: "只读用户",
    configure: false,
    trigger: false,
    rollback: false,
    export: true,
  },
] as const;

function escapeCsv(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function displayAuditValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "未设置";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ConsolePage() {
  const {
    dealers,
    allocation,
    activeSku,
    ratioConfig,
    updateRatioWeights,
    updateWklyRatio,
    toggleBigCustomer,
    updateBigCustomerK,
    bigCustomers,
    skipList,
    addSkipMaterial,
    removeSkipMaterial,
    colorVariants,
    updateColorVariantDo,
    promptText,
    updatePromptText,
    configAuditLog,
    rollbackConfig,
    alerts,
    drillDownDiagnostic,
    notify,
    shotPreset,
  } = useDemo();
  const [skipDraft, setSkipDraft] = useState("");
  const [promptDraft, setPromptDraft] = useState(promptText);

  useEffect(() => {
    setPromptDraft(promptText);
  }, [promptText]);

  const categories = useMemo(() => {
    const configured = Object.keys(ratioConfig.wklyRatioByCategory);
    return configured.length > 0
      ? configured
      : [activeSku.category];
  }, [activeSku.category, ratioConfig.wklyRatioByCategory]);

  const allocationRows = useMemo(() => {
    const dealerById = new Map(dealers.map((dealer) => [dealer.id, dealer]));
    return allocation.results.map((result) => ({
      result,
      dealer: dealerById.get(result.dealerId),
    }));
  }, [allocation.results, dealers]);

  const normalizedSkipDraft = skipDraft.trim().toUpperCase();
  const skipExists = skipList.some(
    (materialCode) => materialCode.toUpperCase() === normalizedSkipDraft,
  );
  const weightTotal =
    ratioConfig.weights.supplyDemand +
    ratioConfig.weights.operation +
    ratioConfig.weights.strategy;

  const exportAllocationCsv = () => {
    const header = [
      "配置版本",
      "SKU",
      "经销商",
      "需求",
      "货款额度上限",
      "公平层",
      "效率层",
      "最终分配",
      "满足率",
    ];
    const rows = allocationRows.map(({ result, dealer }) => [
      `v${ratioConfig.version}`,
      activeSku.id,
      dealer?.name ?? result.dealerId,
      result.demand,
      result.creditCapUnits,
      result.fairAlloc,
      result.effAlloc,
      result.finalAlloc,
      `${(result.satisfactionRate * 100).toFixed(1)}%`,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeSku.id}-allocation-v${ratioConfig.version}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(
      "分配记录已导出",
      `${activeSku.name} 的 ${allocationRows.length} 条记录已生成 CSV。`,
    );
  };

  const submitSkipMaterial = () => {
    if (!normalizedSkipDraft || skipExists) return;
    addSkipMaterial(normalizedSkipDraft);
    setSkipDraft("");
  };

  const weightItems: Array<{
    key: keyof typeof ratioConfig.weights;
    label: string;
    description: string;
  }> = [
    {
      key: "supplyDemand",
      label: "供需态势",
      description: "供给、净需求与缺货度",
    },
    {
      key: "operation",
      label: "经营状态",
      description: "订单、库存、货款与周转",
    },
    {
      key: "strategy",
      label: "策略配置",
      description: "周比例、大客户与直营策略",
    },
  ];

  return (
    <div
      className={`page console-page ${
        shotPreset === "console-alerts" ? "console-alerts-preset" : ""
      }`}
      data-testid="page-console"
    >
      <PageHeading
        title="后台管理"
        help="集中演示 RFP 八项可配置能力、配置版本留痕、回滚以及数据/结果/执行三类 AI 诊断。所有计算参数与解释提示词相互隔离。"
        context={
          <StatusPill tone="blue">配置版本 v{ratioConfig.version}</StatusPill>
        }
        actions={
          <button
            type="button"
            className="button outline"
            onClick={rollbackConfig}
            disabled={configAuditLog.length === 0}
            data-testid="rollback-config"
          >
            <RotateCcw size={16} />
            回滚到上一版
          </button>
        }
      />

      <div className="console-layout">
        <section className="console-config-column" aria-label="八项后台配置">
          <div className="console-config-grid">
            <section className="card console-config-card">
              <CardTitle
                title="Wkly Ratio 配置"
                detail="按产品组配置周目标比例，每月 1 号生效"
                actions={<Percent size={17} />}
              />
              <div className="console-setting-list">
                {categories.map((category) => {
                  const value =
                    ratioConfig.wklyRatioByCategory[category] ?? 0.25;
                  return (
                    <label className="console-setting-row" key={category}>
                      <span>
                        <strong>{category}</strong>
                        <small>月度目标 × 周比例</small>
                      </span>
                      <span className="console-number-control">
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={value}
                          aria-label={`${category} Wkly Ratio`}
                          onChange={(event) =>
                            updateWklyRatio(
                              category,
                              Math.min(
                                1,
                                Math.max(0, Number(event.target.value)),
                              ),
                            )
                          }
                        />
                        <b>{(value * 100).toFixed(0)}%</b>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="console-inline-note">
                直营渠道优先，Buffer{" "}
                <strong>{(ratioConfig.bufferRatio * 100).toFixed(0)}%</strong>
                ，余量再进入其他渠道。
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="大客户标识管理"
                detail="豁免周上限，但仍受资金、库存与总量守恒约束"
                actions={<Users size={17} />}
              />
              <label className="console-setting-row console-kbig-row">
                <span>
                  <strong>增益系数 kBig</strong>
                  <small>由 PIC 统一配置</small>
                </span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  step={0.05}
                  value={ratioConfig.kBig}
                  aria-label="大客户增益系数"
                  onChange={(event) =>
                    updateBigCustomerK(
                      Math.min(3, Math.max(1, Number(event.target.value))),
                    )
                  }
                />
              </label>
              <div className="console-toggle-list">
                {dealers.map((dealer) => (
                  <label className="console-toggle-row" key={dealer.id}>
                    <span>
                      <strong>{dealer.name}</strong>
                      <small>{dealer.id}</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={Boolean(bigCustomers[dealer.id])}
                      onChange={() => toggleBigCustomer(dealer.id)}
                      aria-label={`${dealer.name}大客户标识`}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="Skip 免分配清单"
                detail="命中物料跳过自动求解，转 SSP 人工分配"
                actions={<CircleAlert size={17} />}
              />
              <form
                className="console-add-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSkipMaterial();
                }}
              >
                <input
                  type="text"
                  value={skipDraft}
                  placeholder="输入物料代码"
                  aria-label="新增 Skip 物料代码"
                  onChange={(event) => setSkipDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={!normalizedSkipDraft || skipExists}
                >
                  <Plus size={15} />
                  添加
                </button>
              </form>
              <div className="console-chip-list">
                {skipList.length === 0 && (
                  <span className="console-empty">当前没有免分配物料</span>
                )}
                {skipList.map((materialCode) => (
                  <span className="console-removable-chip" key={materialCode}>
                    <b>{materialCode}</b>
                    <button
                      type="button"
                      aria-label={`移除 ${materialCode}`}
                      onClick={() => removeSkipMaterial(materialCode)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="同型号多色规则"
                detail="按过去 3 个月 DO 比例拆分，型号总量统一收口"
                actions={<Palette size={17} />}
              />
              <div className="table-wrap">
                <table className="data-table console-color-table">
                  <thead>
                    <tr>
                      <th>物料</th>
                      <th>颜色</th>
                      <th>型号</th>
                      <th>目标</th>
                      <th>3M DO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colorVariants.map((variant) => (
                      <tr key={variant.materialCode}>
                        <td className="numeric strong">
                          {variant.materialCode}
                        </td>
                        <td>{variant.colorName}</td>
                        <td className="numeric">{variant.modelId}</td>
                        <td className="numeric">{variant.target}</td>
                        <td>
                          <input
                            className="console-table-input"
                            type="number"
                            min={0}
                            step={1}
                            value={variant.doLast3Months}
                            aria-label={`${variant.materialCode}过去三个月 DO`}
                            onChange={(event) =>
                              updateColorVariantDo(
                                variant.materialCode,
                                Math.max(0, Number(event.target.value)),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="提示词调整"
                detail="仅影响 Agent 解释文案，不参与分配计算"
                actions={<MessageSquareText size={17} />}
              />
              <textarea
                className="console-prompt-input"
                value={promptDraft}
                rows={4}
                aria-label="Agent 解释提示词"
                onChange={(event) => setPromptDraft(event.target.value)}
              />
              <div className="console-card-footer">
                <span>
                  <ShieldCheck size={14} />
                  计算与解释严格隔离
                </span>
                <button
                  type="button"
                  className="button primary"
                  disabled={promptDraft === promptText}
                  onClick={() => {
                    updatePromptText(promptDraft);
                    notify(
                      "提示词已保存",
                      "新版本仅影响解释文案，不改变分配结果。",
                    );
                  }}
                >
                  保存提示词
                </button>
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="参数权重配置"
                detail={`三维度 PA Plan Ratio · 当前 v${ratioConfig.version}`}
                actions={<Settings2 size={17} />}
              />
              <div className="console-weight-list">
                {weightItems.map((item) => {
                  const value = ratioConfig.weights[item.key];
                  return (
                    <label className="console-weight-row" key={item.key}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={value}
                        aria-label={`${item.label}权重`}
                        onChange={(event) =>
                          updateRatioWeights({
                            [item.key]: Number(event.target.value),
                          })
                        }
                      />
                      <b>{value.toFixed(2)}</b>
                    </label>
                  );
                })}
              </div>
              <div
                className={`console-inline-note ${
                  Math.abs(weightTotal - 1) > 0.001 ? "warning" : ""
                }`}
              >
                权重合计 <strong>{weightTotal.toFixed(2)}</strong>
                {Math.abs(weightTotal - 1) > 0.001
                  ? " · 求解器将按总和归一化"
                  : " · 校验通过"}
              </div>
            </section>

            <section className="card console-config-card console-records-card">
              <CardTitle
                title="分配记录查询下载"
                detail={`${activeSku.name} · 当前结果 ${allocationRows.length} 条`}
                actions={
                  <button
                    type="button"
                    className="button outline"
                    onClick={exportAllocationCsv}
                    data-testid="export-allocation-records"
                  >
                    <Download size={15} />
                    导出 CSV
                  </button>
                }
              />
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>经销商</th>
                      <th>需求</th>
                      <th>额度</th>
                      <th>最终分配</th>
                      <th>满足率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationRows.map(({ result, dealer }) => (
                      <tr key={result.dealerId}>
                        <td>
                          <strong>
                            {dealer?.name ?? result.dealerId}
                          </strong>
                        </td>
                        <td className="numeric">{result.demand}</td>
                        <td className="numeric">
                          {result.creditCapUnits}
                        </td>
                        <td className="numeric strong">
                          {result.finalAlloc}
                        </td>
                        <td className="numeric">
                          {(result.satisfactionRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card console-config-card">
              <CardTitle
                title="用户权限控制"
                detail="角色矩阵只读展示"
                actions={<ShieldCheck size={17} />}
              />
              <div className="table-wrap">
                <table className="data-table console-role-table">
                  <thead>
                    <tr>
                      <th>角色</th>
                      <th>配置</th>
                      <th>触发</th>
                      <th>回滚</th>
                      <th>导出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_MATRIX.map((row) => (
                      <tr key={row.role}>
                        <td>
                          <strong>{row.role}</strong>
                        </td>
                        {(
                          [
                            row.configure,
                            row.trigger,
                            row.rollback,
                            row.export,
                          ] as const
                        ).map((allowed, index) => (
                          <td
                            className={allowed ? "permission-on" : "permission-off"}
                            key={`${row.role}-${index}`}
                          >
                            {allowed ? "✓" : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>

        <aside className="console-diagnostics-column">
          <section className="card console-diagnostics-card">
            <CardTitle
              title="AI 诊断预警"
              detail="根据当前数据、求解结果与执行状态实时计算"
              actions={
                <StatusPill tone={alerts.length > 0 ? "amber" : "emerald"}>
                  {alerts.length} 条
                </StatusPill>
              }
            />
            <div className="diagnostic-groups">
              {(
                Object.keys(CATEGORY_META) as AlertCategory[]
              ).map((category) => {
                const meta = CATEGORY_META[category];
                const Icon = meta.icon;
                const categoryAlerts = alerts.filter(
                  (alert) => alert.category === category,
                );
                return (
                  <section className="diagnostic-group" key={category}>
                    <div className="diagnostic-group-title">
                      <Icon size={16} />
                      <span>
                        <strong>{meta.label}</strong>
                        <small>{meta.description}</small>
                      </span>
                      <b>{categoryAlerts.length}</b>
                    </div>
                    <div className="diagnostic-card-list">
                      {categoryAlerts.length === 0 && (
                        <div className="diagnostic-empty">
                          当前未检测到{meta.label}异常
                        </div>
                      )}
                      {categoryAlerts.map((alert) => (
                        <DiagnosticCard
                          alert={alert}
                          key={alert.id}
                          onDrillDown={() => drillDownDiagnostic(alert)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="card config-audit-card">
            <CardTitle
              title="变更留痕"
              detail="旧值 → 新值，版本可追溯"
              actions={<History size={17} />}
            />
            <div className="audit-log">
              {configAuditLog.length === 0 && (
                <div className="console-empty">
                  尚无配置变更，当前为初始版本。
                </div>
              )}
              {configAuditLog.map((entry) => (
                <article className="audit-log-entry" key={entry.id}>
                  <div>
                    <strong>{entry.field}</strong>
                    <StatusPill tone="stone">{entry.version}</StatusPill>
                  </div>
                  <p>
                    <span>{displayAuditValue(entry.oldValue)}</span>
                    <b>→</b>
                    <span>{displayAuditValue(entry.newValue)}</span>
                  </p>
                  <footer>
                    <span>{entry.actor}</span>
                    <time>{entry.time}</time>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DiagnosticCard({
  alert,
  onDrillDown,
}: {
  alert: DiagnosticAlert;
  onDrillDown: () => void;
}) {
  const severity = SEVERITY_META[alert.severity];
  return (
    <article className={`diagnostic-card ${alert.severity}`}>
      <header>
        <div>
          <CircleAlert size={16} />
          <strong>{alert.title}</strong>
        </div>
        <StatusPill tone={severity.tone}>{severity.label}</StatusPill>
      </header>
      <p>{alert.detail}</p>
      {alert.evidence.length > 0 && (
        <ul className="diagnostic-evidence">
          {alert.evidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      )}
      <details className="diagnostic-snapshot">
        <summary>查看参数快照</summary>
        <pre>{JSON.stringify(alert.paramSnapshot, null, 2)}</pre>
      </details>
      {alert.drillDownRef && (
        <button
          type="button"
          className="button ghost diagnostic-drilldown"
          onClick={onDrillDown}
        >
          <ExternalLink size={14} />
          下钻到轨迹
        </button>
      )}
    </article>
  );
}
