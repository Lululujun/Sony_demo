import { describe, expect, it } from "vitest";

import {
  commitConfiguration,
  createConfigurationState,
  rollbackConfiguration,
  type DemoConfiguration,
} from "../src/core/configuration";

const baseline: DemoConfiguration = {
  version: 0,
  layeringConfig: {
    stopThresholds: {
      hq: 1,
      channel: 0.8,
      subChannel: 0.65,
      region: 0.5,
      branch: 0.35,
      dealer: 0,
    },
  },
  ratioWeights: { supplyDemand: 0.4, operation: 0.35, strategy: 0.25 },
  wklyRatiosByCategory: { 音频产品: 0.25 },
  kBig: 1.2,
  bufferRatio: 0.1,
  bigCustomers: { A: true },
  skipList: ["WF-C710N-LTD"],
  colorVariants: [
    {
      materialCode: "P1",
      modelId: "WH-1000XM6",
      colorName: "曜石黑",
      target: 10,
      doLast3Months: 620,
    },
  ],
  promptText: "解释分配理由。",
};

describe("versioned demo configuration", () => {
  it("records a deterministic version and restores the previous snapshot", () => {
    const initial = createConfigurationState(baseline);
    const changed = commitConfiguration(
      initial,
      {
        ...initial.current,
        ratioWeights: { supplyDemand: 0.5, operation: 0.3, strategy: 0.2 },
      },
      {
        field: "PA Plan Ratio 权重",
        oldValue: "0.40 / 0.35 / 0.25",
        newValue: "0.50 / 0.30 / 0.20",
        time: "09:01",
      },
    );

    expect(changed.current.version).toBe(1);
    expect(changed.auditLog[0]).toMatchObject({
      id: "CFG-001",
      version: "v1.1",
    });

    const restored = rollbackConfiguration(changed, "09:02");
    expect(restored.current.ratioWeights).toEqual(baseline.ratioWeights);
    expect(restored.current.version).toBe(2);
    expect(restored.auditLog[0].field).toBe("配置版本回滚");
  });
});
