import { describe, expect, it } from "vitest";

import {
  runDiagnostics,
  type DiagnosticsContext,
} from "../src/core/diagnostics";

function fullContext(): DiagnosticsContext {
  return {
    nowMs: 10_000,
    fixedSeed: "sony-demo-v3",
    sourceFields: [
      {
        id: "sap-credit",
        system: "SAP",
        field: "货款余额",
        value: undefined,
        collectedAtMs: 0,
        maxAgeMs: 5_000,
      },
    ],
    netDemands: [{ nodeId: "CH-A", netDemand: -2 }],
    previousSatisfactionRate: 0.8,
    currentAllocation: {
      traceId: "allocation-001",
      satisfactionRate: 0.5,
      dealers: [
        { dealerId: "A", demand: 100, allocated: 100 },
        { dealerId: "B", demand: 80, allocated: 0 },
      ],
    },
    hhiThreshold: 0.45,
    executionTasks: [
      {
        id: "rfc-writeback",
        kind: "rfc",
        status: "failed",
        startedAtMs: 0,
        timeoutMs: 2_000,
        retryCount: 3,
        maxRetries: 3,
        traceId: "allocation-001",
      },
    ],
  };
}

describe("runDiagnostics", () => {
  it("computes data, result and execution alerts from actual snapshots", () => {
    const alerts = runDiagnostics(fullContext());

    expect(new Set(alerts.map((alert) => alert.category))).toEqual(
      new Set(["data", "result", "execution"]),
    );
    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        "data-missing-sap-credit",
        "data-stale-sap-credit",
        "data-net-demand-CH-A",
        "result-satisfaction-drop-allocation-001",
        "result-hhi-allocation-001",
        "result-zero-B",
        "execution-rfc-rfc-writeback",
        "execution-timeout-rfc-writeback",
        "execution-retries-rfc-writeback",
      ]),
    );
    expect(
      alerts.find((alert) => alert.id === "result-zero-B")?.drillDownRef,
    ).toEqual({ type: "allocation", traceId: "allocation-001" });
  });

  it("uses strict thresholds and treats zero as present data", () => {
    const alerts = runDiagnostics({
      nowMs: 10_000,
      fixedSeed: 7,
      sourceFields: [
        {
          id: "mia-target",
          system: "MIA",
          field: "月度目标",
          value: 0,
          collectedAtMs: 5_000,
          maxAgeMs: 5_000,
        },
      ],
      previousSatisfactionRate: 0.8,
      satisfactionDropThreshold: 0.2,
      hhiThreshold: 0.5,
      currentAllocation: {
        traceId: "boundary",
        satisfactionRate: 0.6,
        dealers: [
          { dealerId: "A", demand: 10, allocated: 5 },
          { dealerId: "B", demand: 10, allocated: 5 },
          {
            dealerId: "SKIP",
            demand: 10,
            allocated: 0,
            skipped: true,
          },
          {
            dealerId: "INELIGIBLE",
            demand: 10,
            allocated: 0,
            eligible: false,
          },
        ],
      },
    });

    expect(alerts).toEqual([]);
  });

  it("uses a fixed per-task draw instead of Math.random", () => {
    const context: DiagnosticsContext = {
      nowMs: 1_000,
      fixedSeed: "fixed",
      rfcFailureRate: 1,
      executionTasks: [
        {
          id: "pending-rfc",
          kind: "rfc",
          status: "pending",
          startedAtMs: 900,
          timeoutMs: 1_000,
          retryCount: 0,
          maxRetries: 3,
        },
      ],
    };
    const before = JSON.parse(JSON.stringify(context));
    const first = runDiagnostics(context);
    const second = runDiagnostics(context);

    expect(first).toEqual(second);
    expect(context).toEqual(before);
    expect(first.map((alert) => alert.id)).toEqual([
      "execution-rfc-pending-rfc",
    ]);
    expect(first[0].paramSnapshot.deterministicDraw).toEqual(
      expect.any(Number),
    );
  });

  it("does not diagnose completed execution tasks as failed or timed out", () => {
    expect(
      runDiagnostics({
        nowMs: 100_000,
        fixedSeed: "fixed",
        rfcFailureRate: 1,
        executionTasks: [
          {
            id: "done",
            kind: "rfc",
            status: "success",
            startedAtMs: 0,
            timeoutMs: 1,
            retryCount: 3,
            maxRetries: 3,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects invalid configurable rates", () => {
    expect(() =>
      runDiagnostics({
        nowMs: 0,
        fixedSeed: 1,
        hhiThreshold: 1.1,
      }),
    ).toThrow(/between 0 and 1/);
  });
});
