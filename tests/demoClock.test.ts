import { describe, expect, it } from "vitest";

import {
  LIVE_SOFT_LOCK_TTL_MS,
  SHOT_SOFT_LOCK_TTL_MS,
  clockStartForMode,
  countdownState,
  runtimeModeFromSearch,
  shouldAutoTimeout,
  softLockTtlForMode,
} from "../src/core/demoClock";

describe("demo clock", () => {
  it("selects normal, presentation and deterministic shot modes from the URL", () => {
    expect(runtimeModeFromSearch("")).toBe("normal");
    expect(runtimeModeFromSearch("?demo=1")).toBe("presentation");
    expect(runtimeModeFromSearch("?mode=presentation")).toBe("presentation");
    expect(runtimeModeFromSearch("?demo=1&shot=1")).toBe("shot");
  });

  it("only enables automatic timeout for the normal online experience", () => {
    expect(shouldAutoTimeout("normal")).toBe(true);
    expect(shouldAutoTimeout("presentation")).toBe(false);
    expect(shouldAutoTimeout("shot")).toBe(false);
    expect(softLockTtlForMode("normal")).toBe(LIVE_SOFT_LOCK_TTL_MS);
    expect(softLockTtlForMode("presentation")).toBe(LIVE_SOFT_LOCK_TTL_MS);
    expect(softLockTtlForMode("shot")).toBe(SHOT_SOFT_LOCK_TTL_MS);
  });

  it("freezes shot mode at a stable clock offset and formats countdown progress", () => {
    const base = 1_000_000;
    expect(clockStartForMode(base, "normal")).toBe(base + 20_000);
    expect(clockStartForMode(base, "shot")).toBe(base + 10 * 60_000);

    expect(countdownState(0, 300_000, 0)).toEqual({
      label: "05:00",
      remainingMs: 300_000,
      progressPct: 100,
    });
    expect(countdownState(0, 300_000, 150_500)).toMatchObject({
      label: "02:30",
      remainingMs: 149_500,
    });
    expect(countdownState(0, 300_000, 400_000)).toEqual({
      label: "00:00",
      remainingMs: 0,
      progressPct: 0,
    });
  });
});
