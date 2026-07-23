import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYERING_CONFIG,
  decideLayering,
  type TierId,
  type TierNode,
} from "../src/core/layering";

function node(
  id: string,
  name: string,
  tier: TierId,
  parentId: string | null,
  netDemand: number,
  paPlanRatio: number,
): TierNode {
  return {
    id,
    name,
    tier,
    parentId,
    targetDemand: netDemand,
    netDemand,
    achievementRate: 0,
    paPlanRatio,
  };
}

function scenarioTree(): { root: TierNode; tree: TierNode[] } {
  const root = node("HQ", "索尼中国", "hq", null, 500, 1);
  const tree: TierNode[] = [root];
  const channelSettings = [
    ["A", 120, 0.4],
    ["B", 180, 0.35],
    ["C", 200, 0.25],
  ] as const;

  for (const [id, demand, ratio] of channelSettings) {
    tree.push(
      node(`CH-${id}`, `渠道${id}`, "channel", "HQ", demand, ratio),
      node(`SUB-${id}`, `子渠道${id}`, "subChannel", `CH-${id}`, demand, 1),
      node(`REG-${id}`, `大区${id}`, "region", `SUB-${id}`, demand, 1),
      node(`BR-${id}`, `分公司${id}`, "branch", `REG-${id}`, demand, 1),
      node(`DL-${id}`, `经销商${id}`, "dealer", `BR-${id}`, demand, 1),
    );
  }
  return { root, tree };
}

describe("decideLayering", () => {
  it("stops a 115% P1 scenario at headquarters", () => {
    const { root, tree } = scenarioTree();
    const summary = decideLayering(root, tree, 575);

    expect(summary.decisions[0]).toMatchObject({
      nodeId: "HQ",
      satisfaction: 1.15,
      stopped: true,
      allocatedUnits: 575,
      children: [],
    });
    expect(summary.trace).toHaveLength(1);
    expect(summary.trace[0].action).toBe("STOP");
    expect(summary).toMatchObject({
      totalSupply: 575,
      frontierAllocated: 575,
      supplyConserved: true,
    });
  });

  it("reproduces P2: channel A stops while B and C descend", () => {
    const { root, tree } = scenarioTree();
    const summary = decideLayering(root, tree, 310);
    const hq = summary.decisions[0];
    const [channelA, channelB, channelC] = hq.children;

    expect(hq).toMatchObject({ satisfaction: 0.62, stopped: false });
    expect(
      summary.trace[0].childAllocations.map((item) => [
        item.nodeId,
        item.allocatedUnits,
      ]),
    ).toEqual([
      ["CH-A", 124],
      ["CH-B", 109],
      ["CH-C", 77],
    ]);
    expect(channelA).toMatchObject({
      nodeId: "CH-A",
      allocatedUnits: 124,
      satisfaction: 1.033333,
      stopped: true,
    });
    expect(channelB).toMatchObject({
      nodeId: "CH-B",
      allocatedUnits: 109,
      satisfaction: 0.605556,
      stopped: false,
    });
    expect(channelC).toMatchObject({
      nodeId: "CH-C",
      allocatedUnits: 77,
      satisfaction: 0.385,
      stopped: false,
    });
    expect(summary.frontierAllocated).toBe(310);
    expect(summary.supplyConserved).toBe(true);
  });

  it("lets a PIC threshold change stop channel B one layer earlier", () => {
    const { root, tree } = scenarioTree();
    const summary = decideLayering(root, tree, 310, {
      stopThresholds: {
        ...DEFAULT_LAYERING_CONFIG.stopThresholds,
        channel: 0.6,
      },
    });
    const channelB = summary.decisions[0].children[1];

    expect(channelB).toMatchObject({
      nodeId: "CH-B",
      stopped: true,
      allocatedUnits: 109,
    });
    expect(channelB.children).toEqual([]);
  });

  it("falls back from zero PA ratios to net demand and then equal shares", () => {
    const first = scenarioTree();
    first.tree
      .filter((item) => item.tier === "channel")
      .forEach((item) => {
        item.paPlanRatio = 0;
      });
    const demandFallback = decideLayering(first.root, first.tree, 310);
    expect(
      demandFallback.trace[0].childAllocations.map((item) => item.allocatedUnits),
    ).toEqual([74, 112, 124]);

    const second = scenarioTree();
    second.tree
      .filter((item) => item.tier === "channel")
      .forEach((item) => {
        item.paPlanRatio = 0;
        item.netDemand = 0;
      });
    const equalFallback = decideLayering(second.root, second.tree, 310);
    expect(
      equalFallback.trace[0].childAllocations.map((item) => item.allocatedUnits),
    ).toEqual([104, 103, 103]);
    expect(equalFallback.supplyConserved).toBe(true);
  });

  it("is deterministic, does not mutate input, and records each visited node", () => {
    const { root, tree } = scenarioTree();
    const before = JSON.parse(JSON.stringify({ root, tree }));
    const first = decideLayering(root, tree, 310);
    const second = decideLayering(root, tree, 310);

    expect(first).toEqual(second);
    expect({ root, tree }).toEqual(before);
    expect(first.trace.map((step) => step.step)).toEqual(
      first.trace.map((_, index) => index + 1),
    );
    expect(first.trace.every((step) => step.reason.length > 0)).toBe(true);
  });

  it("rejects malformed trees and invalid thresholds", () => {
    const { root, tree } = scenarioTree();
    const orphaned = tree.map((item) =>
      item.id === "CH-A" ? { ...item, parentId: "MISSING" } : item,
    );
    expect(() => decideLayering(root, orphaned, 10)).toThrow(/unknown parent/);

    const skippedTier = tree.map((item) =>
      item.id === "CH-A" ? { ...item, tier: "region" as const } : item,
    );
    expect(() => decideLayering(root, skippedTier, 10)).toThrow(/must be tier/);

    expect(() =>
      decideLayering(root, tree, 10, {
        stopThresholds: {
          ...DEFAULT_LAYERING_CONFIG.stopThresholds,
          channel: 1.1,
        },
      }),
    ).toThrow(/between 0 and 1/);
  });
});
