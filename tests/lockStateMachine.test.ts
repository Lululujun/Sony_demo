import { describe, expect, it } from "vitest";

import {
  CONFIRMED_SCORE_DELTA,
  TIMEOUT_SCORE_DELTA,
  advanceLockOrders,
  createLockOrder,
  transitionLock,
} from "../src/core/lockStateMachine";

function allocated(units = 10) {
  return createLockOrder({
    id: "LOCK-001",
    dealerId: "A",
    dealerName: "华东数码-A",
    sku: "WH-1000XM6",
    allocatedUnits: units,
    createdAt: 1_000,
  });
}

describe("lock state machine", () => {
  it("performs continuous credit checking and partially locks what is covered", () => {
    const original = allocated(10);
    const transition = transitionLock(original, {
      type: "REQUEST_LOCK",
      now: 2_000,
      creditCapUnits: 6,
      ttlMs: 60_000,
    });

    expect(original.status).toBe("ALLOCATED");
    expect(transition).toMatchObject({
      accepted: true,
      releasedToSupply: 4,
      order: {
        status: "SOFT_LOCKED",
        lockedUnits: 6,
        releasedUnits: 4,
        creditCapUnitsAtCheck: 6,
        releaseReason: "CREDIT_PARTIAL",
        softLockExpiresAt: 62_000,
      },
    });
    expect(transition.order.auditTrail.at(-1)?.message).toContain("部分锁单");
  });

  it("rejects zero credit, releases all stock, and does not penalize the dealer", () => {
    const transition = transitionLock(allocated(8), {
      type: "REQUEST_LOCK",
      now: 2_000,
      creditCapUnits: 0,
    });

    expect(transition).toMatchObject({
      accepted: true,
      releasedToSupply: 8,
      order: {
        status: "RELEASED",
        releaseReason: "CREDIT_REJECTED",
        releasedUnits: 8,
        scoreDelta: 0,
      },
    });
  });

  it("confirms payment before expiry and records a positive fulfillment score", () => {
    const softLocked = transitionLock(allocated(10), {
      type: "REQUEST_LOCK",
      now: 2_000,
      creditCapUnits: 10,
      ttlMs: 60_000,
    }).order;
    const confirmed = transitionLock(softLocked, {
      type: "CONFIRM_PAYMENT",
      now: 30_000,
    });

    expect(confirmed).toMatchObject({
      accepted: true,
      releasedToSupply: 0,
      order: {
        status: "CONFIRMED",
        lockedUnits: 10,
        scoreDelta: CONFIRMED_SCORE_DELTA,
      },
    });
  });

  it("distinguishes active waiver from timeout breach", () => {
    const partial = transitionLock(allocated(10), {
      type: "REQUEST_LOCK",
      now: 2_000,
      creditCapUnits: 6,
      ttlMs: 60_000,
    }).order;
    const waived = transitionLock(partial, { type: "WAIVE", now: 3_000 });
    const timedOut = transitionLock(partial, { type: "TICK", now: 62_000 });

    expect(waived).toMatchObject({
      releasedToSupply: 6,
      order: {
        status: "WAIVED",
        releasedUnits: 10,
        releaseReason: "ACTIVE_WAIVER",
        scoreDelta: 0,
      },
    });
    expect(timedOut).toMatchObject({
      releasedToSupply: 6,
      order: {
        status: "RELEASED",
        releasedUnits: 10,
        releaseReason: "PAYMENT_TIMEOUT",
        scoreDelta: TIMEOUT_SCORE_DELTA,
      },
    });
  });

  it("keeps invalid transitions unchanged and advances a board in one pure tick", () => {
    const first = transitionLock(allocated(4), {
      type: "REQUEST_LOCK",
      now: 2_000,
      creditCapUnits: 4,
      ttlMs: 1_000,
    }).order;
    const second = allocated(5);
    const snapshot = JSON.parse(JSON.stringify([first, second]));
    const advanced = advanceLockOrders([first, second], 3_000);

    expect(advanced.releasedToSupply).toBe(4);
    expect(advanced.orders.map((order) => order.status)).toEqual([
      "RELEASED",
      "ALLOCATED",
    ]);
    expect([first, second]).toEqual(snapshot);

    const invalid = transitionLock(second, {
      type: "CONFIRM_PAYMENT",
      now: 3_000,
    });
    expect(invalid.accepted).toBe(false);
    expect(invalid.order).toEqual(second);
  });
});
