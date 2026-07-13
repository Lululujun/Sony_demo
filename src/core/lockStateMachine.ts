import type {
  LockAuditEntry,
  LockEvent,
  LockOrder,
  LockStatus,
  LockTransitionResult,
} from "./types";

export const DEFAULT_SOFT_LOCK_TTL_MS = 60_000;
export const CONFIRMED_SCORE_DELTA = 2;
export const TIMEOUT_SCORE_DELTA = -5;

export interface CreateLockOrderInput {
  id: string;
  dealerId: string;
  dealerName: string;
  sku: string;
  allocatedUnits: number;
  createdAt?: number;
}

function toUnits(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
  return Math.floor(value);
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative timestamp`);
  }
}

function cloneOrder(order: LockOrder): LockOrder {
  return {
    ...order,
    auditTrail: order.auditTrail.map((entry) => ({ ...entry })),
  };
}

function withAudit(
  order: LockOrder,
  entry: Omit<LockAuditEntry, "sequence">,
): LockOrder {
  return {
    ...order,
    auditTrail: [
      ...order.auditTrail.map((item) => ({ ...item })),
      { ...entry, sequence: order.auditTrail.length + 1 },
    ],
  };
}

function rejected(order: LockOrder, message: string): LockTransitionResult {
  return {
    order: cloneOrder(order),
    accepted: false,
    releasedToSupply: 0,
    message,
  };
}

export function createLockOrder(input: CreateLockOrderInput): LockOrder {
  const allocatedUnits = toUnits(input.allocatedUnits, "input.allocatedUnits");
  const createdAt = input.createdAt ?? 0;
  assertTimestamp(createdAt, "input.createdAt");
  if (!input.id.trim() || !input.dealerId.trim() || !input.sku.trim()) {
    throw new Error("id, dealerId and sku must not be empty");
  }

  return {
    id: input.id,
    dealerId: input.dealerId,
    dealerName: input.dealerName,
    sku: input.sku,
    allocatedUnits,
    lockedUnits: 0,
    releasedUnits: 0,
    creditCapUnitsAtCheck: 0,
    status: "ALLOCATED",
    releaseReason: "NONE",
    scoreDelta: 0,
    auditTrail: [
      {
        sequence: 1,
        at: createdAt,
        event: "CREATED",
        from: "ALLOCATED",
        to: "ALLOCATED",
        units: allocatedUnits,
        releasedUnits: 0,
        scoreDelta: 0,
        message: `生成 ${allocatedUnits} 台待锁单配额。`,
      },
    ],
  };
}

function requestLock(
  current: LockOrder,
  event: Extract<LockEvent, { type: "REQUEST_LOCK" }>,
): LockTransitionResult {
  if (current.status !== "ALLOCATED") {
    return rejected(current, `仅 ALLOCATED 状态可发起软锁定，当前为 ${current.status}。`);
  }
  assertTimestamp(event.now, "event.now");
  const creditCapUnits = toUnits(event.creditCapUnits, "event.creditCapUnits");
  const ttlMs = event.ttlMs ?? DEFAULT_SOFT_LOCK_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("event.ttlMs must be a finite positive number");
  }

  const lockableUnits = Math.min(current.allocatedUnits, creditCapUnits);
  const releasedImmediately = current.allocatedUnits - lockableUnits;

  if (lockableUnits === 0) {
    const next: LockOrder = {
      ...current,
      status: "RELEASED",
      creditCapUnitsAtCheck: creditCapUnits,
      lockedUnits: 0,
      releasedUnits: current.releasedUnits + current.allocatedUnits,
      releaseReason: "CREDIT_REJECTED",
      softLockExpiresAt: undefined,
    };
    const audited = withAudit(next, {
      at: event.now,
      event: event.type,
      from: current.status,
      to: "RELEASED",
      units: 0,
      releasedUnits: current.allocatedUnits,
      scoreDelta: 0,
      message: "额度折算数量为 0，锁单不成立，全部配额立即回流且不记违约。",
    });
    return {
      order: audited,
      accepted: true,
      releasedToSupply: current.allocatedUnits,
      message: audited.auditTrail.at(-1)?.message ?? "额度拦截",
    };
  }

  const partial = lockableUnits < current.allocatedUnits;
  const next: LockOrder = {
    ...current,
    status: "SOFT_LOCKED",
    creditCapUnitsAtCheck: creditCapUnits,
    lockedUnits: lockableUnits,
    releasedUnits: current.releasedUnits + releasedImmediately,
    releaseReason: partial ? "CREDIT_PARTIAL" : "NONE",
    softLockExpiresAt: event.now + ttlMs,
  };
  const message = partial
    ? `额度仅覆盖 ${lockableUnits} 台，部分锁单；其余 ${releasedImmediately} 台立即回流。`
    : `额度校验通过，${lockableUnits} 台进入软锁定。`;
  const audited = withAudit(next, {
    at: event.now,
    event: event.type,
    from: current.status,
    to: "SOFT_LOCKED",
    units: lockableUnits,
    releasedUnits: releasedImmediately,
    scoreDelta: 0,
    message,
  });
  return {
    order: audited,
    accepted: true,
    releasedToSupply: releasedImmediately,
    message,
  };
}

function confirmPayment(
  current: LockOrder,
  event: Extract<LockEvent, { type: "CONFIRM_PAYMENT" }>,
): LockTransitionResult {
  if (current.status !== "SOFT_LOCKED") {
    return rejected(current, `仅 SOFT_LOCKED 状态可确认支付，当前为 ${current.status}。`);
  }
  assertTimestamp(event.now, "event.now");
  if (
    current.softLockExpiresAt !== undefined &&
    event.now >= current.softLockExpiresAt
  ) {
    return rejected(current, "软锁已到期，请先执行 TICK 释放货量。 ");
  }

  const next: LockOrder = {
    ...current,
    status: "CONFIRMED",
    softLockExpiresAt: undefined,
    scoreDelta: current.scoreDelta + CONFIRMED_SCORE_DELTA,
  };
  const message = `支付确认，${current.lockedUnits} 台正式锁定；履约分 +${CONFIRMED_SCORE_DELTA}。`;
  const audited = withAudit(next, {
    at: event.now,
    event: event.type,
    from: current.status,
    to: "CONFIRMED",
    units: current.lockedUnits,
    releasedUnits: 0,
    scoreDelta: CONFIRMED_SCORE_DELTA,
    message,
  });
  return { order: audited, accepted: true, releasedToSupply: 0, message };
}

function waive(
  current: LockOrder,
  event: Extract<LockEvent, { type: "WAIVE" }>,
): LockTransitionResult {
  if (current.status !== "ALLOCATED" && current.status !== "SOFT_LOCKED") {
    return rejected(current, `当前 ${current.status} 状态不可主动放弃。`);
  }
  assertTimestamp(event.now, "event.now");
  const unitsToRelease =
    current.status === "SOFT_LOCKED" ? current.lockedUnits : current.allocatedUnits;
  const next: LockOrder = {
    ...current,
    status: "WAIVED",
    lockedUnits: 0,
    releasedUnits: current.releasedUnits + unitsToRelease,
    releaseReason: "ACTIVE_WAIVER",
    softLockExpiresAt: undefined,
  };
  const message = `经销商主动放弃，${unitsToRelease} 台立即回流，不扣履约分。`;
  const audited = withAudit(next, {
    at: event.now,
    event: event.type,
    from: current.status,
    to: "WAIVED",
    units: 0,
    releasedUnits: unitsToRelease,
    scoreDelta: 0,
    message,
  });
  return {
    order: audited,
    accepted: true,
    releasedToSupply: unitsToRelease,
    message,
  };
}

function tick(
  current: LockOrder,
  event: Extract<LockEvent, { type: "TICK" }>,
): LockTransitionResult {
  if (current.status !== "SOFT_LOCKED") {
    return rejected(current, `当前 ${current.status} 状态无需超时检查。`);
  }
  assertTimestamp(event.now, "event.now");
  if (
    current.softLockExpiresAt === undefined ||
    event.now < current.softLockExpiresAt
  ) {
    return rejected(current, "软锁仍在有效期内。 ");
  }

  const unitsToRelease = current.lockedUnits;
  const next: LockOrder = {
    ...current,
    status: "RELEASED",
    lockedUnits: 0,
    releasedUnits: current.releasedUnits + unitsToRelease,
    releaseReason: "PAYMENT_TIMEOUT",
    softLockExpiresAt: undefined,
    scoreDelta: current.scoreDelta + TIMEOUT_SCORE_DELTA,
  };
  const message = `支付超时，${unitsToRelease} 台释放回流；履约分 ${TIMEOUT_SCORE_DELTA}。`;
  const audited = withAudit(next, {
    at: event.now,
    event: event.type,
    from: current.status,
    to: "RELEASED",
    units: 0,
    releasedUnits: unitsToRelease,
    scoreDelta: TIMEOUT_SCORE_DELTA,
    message,
  });
  return {
    order: audited,
    accepted: true,
    releasedToSupply: unitsToRelease,
    message,
  };
}

export function transitionLock(
  order: LockOrder,
  event: LockEvent,
): LockTransitionResult {
  const current = cloneOrder(order);
  switch (event.type) {
    case "REQUEST_LOCK":
      return requestLock(current, event);
    case "CONFIRM_PAYMENT":
      return confirmPayment(current, event);
    case "WAIVE":
      return waive(current, event);
    case "TICK":
      return tick(current, event);
  }
}

export interface AdvanceLocksResult {
  orders: LockOrder[];
  releasedToSupply: number;
}

export function advanceLockOrders(
  orders: readonly LockOrder[],
  now: number,
): AdvanceLocksResult {
  assertTimestamp(now, "now");
  let releasedToSupply = 0;
  const nextOrders = orders.map((order) => {
    if (order.status !== "SOFT_LOCKED") {
      return cloneOrder(order);
    }
    const transition = transitionLock(order, { type: "TICK", now });
    releasedToSupply += transition.releasedToSupply;
    return transition.order;
  });
  return { orders: nextOrders, releasedToSupply };
}

export function isTerminalLockStatus(status: LockStatus): boolean {
  return status === "CONFIRMED" || status === "WAIVED" || status === "RELEASED";
}
