export type AlertCategory = "data" | "result" | "execution";
export type AlertSeverity = "info" | "warning" | "danger";

export interface DiagnosticAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  detail: string;
  paramSnapshot: Record<string, unknown>;
  evidence: string[];
  drillDownRef?: {
    type: "allocation" | "layering";
    traceId: string;
  };
}

export interface DiagnosticSourceField {
  id: string;
  system: string;
  field: string;
  value?: unknown;
  collectedAtMs: number;
  maxAgeMs: number;
}

export interface DiagnosticNetDemand {
  nodeId: string;
  netDemand: number;
}

export interface DiagnosticDealerAllocation {
  dealerId: string;
  dealerName?: string;
  demand: number;
  allocated: number;
  eligible?: boolean;
  skipped?: boolean;
}

export interface DiagnosticAllocationSnapshot {
  traceId: string;
  satisfactionRate: number;
  dealers: readonly DiagnosticDealerAllocation[];
}

export type DiagnosticExecutionStatus = "pending" | "success" | "failed";
export type DiagnosticExecutionKind = "rfc" | "allocation";

export interface DiagnosticExecutionTask {
  id: string;
  kind: DiagnosticExecutionKind;
  status: DiagnosticExecutionStatus;
  startedAtMs: number;
  timeoutMs: number;
  retryCount: number;
  maxRetries: number;
  traceId?: string;
}

export interface DiagnosticsContext {
  nowMs: number;
  fixedSeed: string | number;
  sourceFields?: readonly DiagnosticSourceField[];
  netDemands?: readonly DiagnosticNetDemand[];
  currentAllocation?: DiagnosticAllocationSnapshot;
  previousSatisfactionRate?: number;
  satisfactionDropThreshold?: number;
  hhiThreshold?: number;
  executionTasks?: readonly DiagnosticExecutionTask[];
  rfcFailureRate?: number;
}

const CATEGORY_ORDER: Record<AlertCategory, number> = {
  data: 0,
  result: 1,
  execution: 2,
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function assertRate(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1`);
  }
}

function stableToken(value: string): string {
  return encodeURIComponent(value.trim());
}

/** FNV-1a gives a stable per-task draw without a mutable PRNG sequence. */
function deterministicUnitInterval(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function resultDrillDown(
  allocation: DiagnosticAllocationSnapshot,
): DiagnosticAlert["drillDownRef"] {
  return { type: "allocation", traceId: allocation.traceId };
}

/**
 * Runs all diagnostics from explicit snapshots. No wall clock or random source
 * is read inside the function, so the same context always produces the same
 * alert ids, evidence and ordering.
 */
export function runDiagnostics(
  context: DiagnosticsContext,
): DiagnosticAlert[] {
  assertFiniteNonNegative(context.nowMs, "context.nowMs");
  const satisfactionDropThreshold =
    context.satisfactionDropThreshold ?? 0.2;
  const hhiThreshold = context.hhiThreshold ?? 0.45;
  const rfcFailureRate = context.rfcFailureRate ?? 0.05;
  assertRate(
    satisfactionDropThreshold,
    "context.satisfactionDropThreshold",
  );
  assertRate(hhiThreshold, "context.hhiThreshold");
  assertRate(rfcFailureRate, "context.rfcFailureRate");

  const alerts: DiagnosticAlert[] = [];

  for (const source of context.sourceFields ?? []) {
    const sourceToken = stableToken(source.id);
    assertFiniteNonNegative(
      source.collectedAtMs,
      `sourceFields.${source.id}.collectedAtMs`,
    );
    assertFiniteNonNegative(
      source.maxAgeMs,
      `sourceFields.${source.id}.maxAgeMs`,
    );
    const missing = source.value === undefined || source.value === null;
    const invalidNumber =
      typeof source.value === "number" && !Number.isFinite(source.value);
    if (missing || invalidNumber) {
      alerts.push({
        id: `data-missing-${sourceToken}`,
        category: "data",
        severity: "danger",
        title: `${source.system} · ${source.field} 缺数`,
        detail: "源系统字段缺失或不是有效数值，本轮参数快照不完整。",
        paramSnapshot: {
          sourceId: source.id,
          system: source.system,
          field: source.field,
          value: source.value ?? null,
        },
        evidence: [
          missing ? "字段值为 undefined/null" : "数值不是有限数",
        ],
      });
    }

    const ageMs = Math.max(0, context.nowMs - source.collectedAtMs);
    if (ageMs > source.maxAgeMs) {
      alerts.push({
        id: `data-stale-${sourceToken}`,
        category: "data",
        severity: "warning",
        title: `${source.system} · ${source.field} 采集超时`,
        detail: "字段快照超过允许时效，需要刷新源系统数据。",
        paramSnapshot: {
          sourceId: source.id,
          collectedAtMs: source.collectedAtMs,
          nowMs: context.nowMs,
          ageMs,
          maxAgeMs: source.maxAgeMs,
        },
        evidence: [`快照年龄 ${ageMs}ms > 阈值 ${source.maxAgeMs}ms`],
      });
    }
  }

  for (const demand of context.netDemands ?? []) {
    if (!Number.isFinite(demand.netDemand) || demand.netDemand < 0) {
      alerts.push({
        id: `data-net-demand-${stableToken(demand.nodeId)}`,
        category: "data",
        severity: "danger",
        title: `${demand.nodeId} 净需求口径异常`,
        detail: "有效净需求不得为负数或非有限数，请核对目标、已分配与在途口径。",
        paramSnapshot: {
          nodeId: demand.nodeId,
          netDemand: Number.isFinite(demand.netDemand)
            ? demand.netDemand
            : String(demand.netDemand),
        },
        evidence: ["netDemand < 0 或不是有限数"],
      });
    }
  }

  const allocation = context.currentAllocation;
  if (allocation) {
    assertRate(
      allocation.satisfactionRate,
      "context.currentAllocation.satisfactionRate",
    );
    if (context.previousSatisfactionRate !== undefined) {
      assertRate(
        context.previousSatisfactionRate,
        "context.previousSatisfactionRate",
      );
      const drop =
        context.previousSatisfactionRate - allocation.satisfactionRate;
      if (drop - satisfactionDropThreshold > Number.EPSILON) {
        alerts.push({
          id: `result-satisfaction-drop-${stableToken(allocation.traceId)}`,
          category: "result",
          severity: "warning",
          title: "整体需求满足度骤降",
          detail: "本轮满足度相较上一轮的百分点降幅超过配置阈值。",
          paramSnapshot: {
            previous: context.previousSatisfactionRate,
            current: allocation.satisfactionRate,
            drop: round(drop),
            threshold: satisfactionDropThreshold,
          },
          evidence: [
            `${round(drop * 100, 2)} 个百分点 > ${round(
              satisfactionDropThreshold * 100,
              2,
            )} 个百分点`,
          ],
          drillDownRef: resultDrillDown(allocation),
        });
      }
    }

    let totalAllocated = 0;
    for (const dealer of allocation.dealers) {
      assertFiniteNonNegative(
        dealer.demand,
        `allocation.dealers.${dealer.dealerId}.demand`,
      );
      assertFiniteNonNegative(
        dealer.allocated,
        `allocation.dealers.${dealer.dealerId}.allocated`,
      );
      totalAllocated += dealer.allocated;
      if (
        dealer.demand > 0 &&
        dealer.allocated === 0 &&
        dealer.eligible !== false &&
        dealer.skipped !== true
      ) {
        alerts.push({
          id: `result-zero-${stableToken(dealer.dealerId)}`,
          category: "result",
          severity: "warning",
          title: `${dealer.dealerName ?? dealer.dealerId} 分配为零`,
          detail: "该经销商存在有效需求且可参与分配，但本轮结果为零。",
          paramSnapshot: {
            dealerId: dealer.dealerId,
            demand: dealer.demand,
            allocated: dealer.allocated,
            eligible: dealer.eligible ?? true,
            skipped: dealer.skipped ?? false,
          },
          evidence: ["demand > 0、eligible=true、skipped=false、allocated=0"],
          drillDownRef: resultDrillDown(allocation),
        });
      }
    }
    const concentrationIndex =
      totalAllocated === 0
        ? 0
        : allocation.dealers.reduce(
            (sum, dealer) =>
              sum + (dealer.allocated / totalAllocated) ** 2,
            0,
          );
    if (concentrationIndex - hhiThreshold > Number.EPSILON) {
      alerts.push({
        id: `result-hhi-${stableToken(allocation.traceId)}`,
        category: "result",
        severity: "warning",
        title: "分货集中度超过阈值",
        detail: "HHI 显示本轮分货过度集中，需要检查权重与硬约束。",
        paramSnapshot: {
          hhi: round(concentrationIndex),
          threshold: hhiThreshold,
          totalAllocated,
        },
        evidence: [
          `HHI ${round(concentrationIndex)} > 阈值 ${round(hhiThreshold)}`,
        ],
        drillDownRef: resultDrillDown(allocation),
      });
    }
  }

  for (const task of context.executionTasks ?? []) {
    const taskToken = stableToken(task.id);
    assertFiniteNonNegative(
      task.startedAtMs,
      `executionTasks.${task.id}.startedAtMs`,
    );
    assertFiniteNonNegative(
      task.timeoutMs,
      `executionTasks.${task.id}.timeoutMs`,
    );
    assertFiniteNonNegative(
      task.retryCount,
      `executionTasks.${task.id}.retryCount`,
    );
    assertFiniteNonNegative(
      task.maxRetries,
      `executionTasks.${task.id}.maxRetries`,
    );
    if (
      !Number.isInteger(task.retryCount) ||
      !Number.isInteger(task.maxRetries)
    ) {
      throw new RangeError("execution retry counts must be integers");
    }
    const drillDownRef = task.traceId
      ? ({ type: "allocation", traceId: task.traceId } as const)
      : undefined;
    const deterministicDraw = deterministicUnitInterval(
      `${String(context.fixedSeed)}|${task.id}|${task.retryCount}|RFC`,
    );
    const simulatedRfcFailure =
      task.kind === "rfc" &&
      task.status === "pending" &&
      deterministicDraw < rfcFailureRate;
    if (
      task.kind === "rfc" &&
      (task.status === "failed" || simulatedRfcFailure)
    ) {
      alerts.push({
        id: `execution-rfc-${taskToken}`,
        category: "execution",
        severity: "danger",
        title: "SAP 产品分配 RFC 回写失败",
        detail: "回写未成功，已保留参数快照与固定种子判定依据。",
        paramSnapshot: {
          taskId: task.id,
          status: task.status,
          retryCount: task.retryCount,
          deterministicDraw: round(deterministicDraw, 6),
          failureRate: rfcFailureRate,
        },
        evidence: [
          task.status === "failed"
            ? "执行状态明确为 failed"
            : `固定种子抽样 ${round(
                deterministicDraw,
                6,
              )} < 失败率 ${rfcFailureRate}`,
        ],
        drillDownRef,
      });
    }

    const elapsedMs = Math.max(0, context.nowMs - task.startedAtMs);
    if (task.status !== "success" && elapsedMs > task.timeoutMs) {
      alerts.push({
        id: `execution-timeout-${taskToken}`,
        category: "execution",
        severity: "danger",
        title: `${task.id} 任务超时`,
        detail: "任务运行时间超过配置阈值，需要检查执行链路。",
        paramSnapshot: {
          taskId: task.id,
          status: task.status,
          elapsedMs,
          timeoutMs: task.timeoutMs,
        },
        evidence: [`运行 ${elapsedMs}ms > 阈值 ${task.timeoutMs}ms`],
        drillDownRef,
      });
    }
    if (
      task.status !== "success" &&
      task.retryCount >= task.maxRetries
    ) {
      alerts.push({
        id: `execution-retries-${taskToken}`,
        category: "execution",
        severity: "danger",
        title: `${task.id} 重试耗尽`,
        detail: "任务已达到最大重试次数，转人工检查。",
        paramSnapshot: {
          taskId: task.id,
          status: task.status,
          retryCount: task.retryCount,
          maxRetries: task.maxRetries,
        },
        evidence: [
          `retryCount ${task.retryCount} ≥ maxRetries ${task.maxRetries}`,
        ],
        drillDownRef,
      });
    }
  }

  return alerts.sort((left, right) => {
    const categoryDifference =
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (categoryDifference !== 0) return categoryDifference;
    const severityDifference =
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDifference !== 0) return severityDifference;
    return lexicalCompare(left.id, right.id);
  });
}
