export type TierId =
  | "hq"
  | "channel"
  | "subChannel"
  | "region"
  | "branch"
  | "dealer";

export interface TierNode {
  id: string;
  name: string;
  tier: TierId;
  parentId: string | null;
  targetDemand: number;
  netDemand: number;
  achievementRate: number;
  paPlanRatio: number;
}

export interface LayeringConfig {
  stopThresholds: Record<TierId, number>;
}

export interface LayeringChildAllocation {
  nodeId: string;
  allocatedUnits: number;
  exactShare: number;
  fractionalRemainder: number;
}

export interface LayeringStep {
  step: number;
  nodeId: string;
  nodeName: string;
  tier: TierId;
  allocatedUnits: number;
  netDemand: number;
  satisfaction: number;
  threshold: number;
  action: "STOP" | "DESCEND";
  reason: string;
  childAllocations: LayeringChildAllocation[];
}

export interface LayeringDecision {
  nodeId: string;
  tier: TierId;
  satisfaction: number;
  stopped: boolean;
  reason: string;
  allocatedUnits: number;
  children: LayeringDecision[];
}

export interface LayeringSummary {
  decisions: LayeringDecision[];
  trace: LayeringStep[];
  totalSupply: number;
  frontierAllocated: number;
  supplyConserved: boolean;
}

export const DEFAULT_LAYERING_CONFIG: LayeringConfig = {
  stopThresholds: {
    hq: 1,
    channel: 0.8,
    subChannel: 0.65,
    region: 0.5,
    branch: 0.35,
    // A dealer is the terminal layer and is always stopped regardless of this
    // value. Keeping the key makes LayeringConfig a complete Record.
    dealer: 0,
  },
};

const TIER_ORDER: readonly TierId[] = [
  "hq",
  "channel",
  "subChannel",
  "region",
  "branch",
  "dealer",
];

const EPSILON = 1e-9;

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function normalizeNode(node: TierNode, field: string): TierNode {
  const id = node.id.trim();
  const name = node.name.trim();
  if (!id) throw new Error(`${field}.id must not be empty`);
  if (!name) throw new Error(`${field}.name must not be empty`);
  if (!TIER_ORDER.includes(node.tier)) {
    throw new Error(`${field}.tier is invalid: ${String(node.tier)}`);
  }
  assertFiniteNonNegative(node.targetDemand, `${field}.targetDemand`);
  assertFiniteNonNegative(node.netDemand, `${field}.netDemand`);
  assertFiniteNonNegative(node.achievementRate, `${field}.achievementRate`);
  assertFiniteNonNegative(node.paPlanRatio, `${field}.paPlanRatio`);

  return {
    ...node,
    id,
    name,
    parentId: node.parentId === null ? null : node.parentId.trim(),
  };
}

function validateThresholds(config: LayeringConfig): void {
  for (const tier of TIER_ORDER) {
    const value = config.stopThresholds[tier];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `config.stopThresholds.${tier} must be between 0 and 1`,
      );
    }
  }
}

function apportionUnits(
  supply: number,
  children: readonly TierNode[],
): LayeringChildAllocation[] {
  let weights = children.map((child) => child.paPlanRatio);
  let totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    weights = children.map((child) => child.netDemand);
    totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  }
  if (totalWeight <= 0) {
    weights = children.map(() => 1);
    totalWeight = children.length;
  }

  const allocations = children.map((child, index) => {
    const exactShare = (supply * weights[index]) / totalWeight;
    const allocatedUnits = Math.floor(exactShare + EPSILON);
    return {
      nodeId: child.id,
      allocatedUnits,
      exactShare,
      fractionalRemainder: Math.max(0, exactShare - allocatedUnits),
    };
  });

  let tail =
    supply -
    allocations.reduce((sum, allocation) => sum + allocation.allocatedUnits, 0);
  const tailOrder = [...allocations].sort((left, right) => {
    const remainderDifference =
      right.fractionalRemainder - left.fractionalRemainder;
    if (Math.abs(remainderDifference) > EPSILON) {
      return remainderDifference;
    }
    return lexicalCompare(left.nodeId, right.nodeId);
  });

  for (let index = 0; tail > 0; index += 1) {
    tailOrder[index % tailOrder.length].allocatedUnits += 1;
    tail -= 1;
  }

  return allocations
    .sort((left, right) => lexicalCompare(left.nodeId, right.nodeId))
    .map((allocation) => ({
      ...allocation,
      exactShare: round(allocation.exactShare),
      fractionalRemainder: round(allocation.fractionalRemainder),
    }));
}

/**
 * Chooses the highest safe allocation layer for every branch of an
 * organisation tree. `achievementRate` is retained for explanation only:
 * historical achievement is already reflected in each node's `netDemand`, so
 * applying it again would double count the same business signal.
 */
export function decideLayering(
  inputRoot: TierNode,
  inputTree: readonly TierNode[],
  inputSupply: number,
  config: LayeringConfig = DEFAULT_LAYERING_CONFIG,
): LayeringSummary {
  validateThresholds(config);
  assertFiniteNonNegative(inputSupply, "supply");
  const supply = Math.floor(inputSupply);
  const root = normalizeNode(inputRoot, "root");
  if (root.tier !== "hq" || root.parentId !== null) {
    throw new Error("root must be the hq node and have parentId=null");
  }

  const nodes = new Map<string, TierNode>([[root.id, root]]);
  let rootSeenInTree = false;
  inputTree.forEach((inputNode, index) => {
    const node = normalizeNode(inputNode, `tree[${index}]`);
    if (node.id === root.id) {
      if (rootSeenInTree) throw new Error(`duplicate node id: ${node.id}`);
      rootSeenInTree = true;
      return;
    }
    if (nodes.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    if (node.tier === "hq") {
      throw new Error(`only the root may use tier hq: ${node.id}`);
    }
    nodes.set(node.id, node);
  });

  const childrenByParent = new Map<string, TierNode[]>();
  for (const node of nodes.values()) {
    if (node.id === root.id) continue;
    if (!node.parentId) {
      throw new Error(`non-root node must have a parentId: ${node.id}`);
    }
    const parent = nodes.get(node.parentId);
    if (!parent) {
      throw new Error(`unknown parent ${node.parentId} for node ${node.id}`);
    }
    const expectedTier = TIER_ORDER[TIER_ORDER.indexOf(parent.tier) + 1];
    if (node.tier !== expectedTier) {
      throw new Error(
        `node ${node.id} must be tier ${expectedTier ?? "none"} below ${parent.id}`,
      );
    }
    const siblings = childrenByParent.get(parent.id) ?? [];
    siblings.push(node);
    childrenByParent.set(parent.id, siblings);
  }

  for (const node of nodes.values()) {
    const children = childrenByParent.get(node.id) ?? [];
    if (node.tier === "dealer" && children.length > 0) {
      throw new Error(`dealer node must not have children: ${node.id}`);
    }
    if (node.tier !== "dealer" && children.length === 0) {
      throw new Error(`non-dealer node must have children: ${node.id}`);
    }
    children.sort((left, right) => lexicalCompare(left.id, right.id));
  }

  const trace: LayeringStep[] = [];
  let sequence = 0;

  const visit = (node: TierNode, allocatedUnits: number): LayeringDecision => {
    const threshold = config.stopThresholds[node.tier];
    const satisfaction =
      node.netDemand === 0 ? 1 : round(allocatedUnits / node.netDemand);
    const stopped =
      node.tier === "dealer" || satisfaction + EPSILON >= threshold;
    const reason =
      node.tier === "dealer"
        ? `已到经销商最小颗粒度，停靠并承接 ${allocatedUnits} 台。`
        : stopped
          ? `满足度 ${(satisfaction * 100).toFixed(1)}% ≥ ${(
              threshold * 100
            ).toFixed(1)}%，停靠在${node.name}。`
          : `满足度 ${(satisfaction * 100).toFixed(1)}% < ${(
              threshold * 100
            ).toFixed(1)}%，继续下沉。`;

    if (stopped) {
      trace.push({
        step: ++sequence,
        nodeId: node.id,
        nodeName: node.name,
        tier: node.tier,
        allocatedUnits,
        netDemand: node.netDemand,
        satisfaction,
        threshold,
        action: "STOP",
        reason,
        childAllocations: [],
      });
      return {
        nodeId: node.id,
        tier: node.tier,
        satisfaction,
        stopped: true,
        reason,
        allocatedUnits,
        children: [],
      };
    }

    const children = childrenByParent.get(node.id) ?? [];
    const childAllocations = apportionUnits(allocatedUnits, children);
    trace.push({
      step: ++sequence,
      nodeId: node.id,
      nodeName: node.name,
      tier: node.tier,
      allocatedUnits,
      netDemand: node.netDemand,
      satisfaction,
      threshold,
      action: "DESCEND",
      reason,
      childAllocations,
    });
    const allocationById = new Map(
      childAllocations.map((allocation) => [
        allocation.nodeId,
        allocation.allocatedUnits,
      ]),
    );
    return {
      nodeId: node.id,
      tier: node.tier,
      satisfaction,
      stopped: false,
      reason,
      allocatedUnits,
      children: children.map((child) =>
        visit(child, allocationById.get(child.id) ?? 0),
      ),
    };
  };

  const rootDecision = visit(root, supply);
  const frontierUnits = (decision: LayeringDecision): number =>
    decision.stopped
      ? decision.allocatedUnits
      : decision.children.reduce(
          (sum, child) => sum + frontierUnits(child),
          0,
        );
  const frontierAllocated = frontierUnits(rootDecision);

  return {
    decisions: [rootDecision],
    trace,
    totalSupply: supply,
    frontierAllocated,
    supplyConserved: frontierAllocated === supply,
  };
}
