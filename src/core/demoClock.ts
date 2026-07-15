export type DemoRuntimeMode = "normal" | "presentation" | "shot";

export const LIVE_SOFT_LOCK_TTL_MS = 15 * 60_000;
export const SHOT_SOFT_LOCK_TTL_MS = 5 * 60_000;

const LIVE_CLOCK_OFFSET_MS = 20_000;
const SHOT_CLOCK_OFFSET_MS = 10 * 60_000;

export interface CountdownState {
  label: string;
  remainingMs: number;
  progressPct: number;
}

export function runtimeModeFromSearch(search: string): DemoRuntimeMode {
  const params = new URLSearchParams(search);
  if (params.get("shot") === "1") return "shot";
  if (params.get("demo") === "1" || params.get("mode") === "presentation") {
    return "presentation";
  }
  return "normal";
}

export function shouldAutoTimeout(mode: DemoRuntimeMode): boolean {
  return mode === "normal";
}

export function softLockTtlForMode(mode: DemoRuntimeMode): number {
  return mode === "shot" ? SHOT_SOFT_LOCK_TTL_MS : LIVE_SOFT_LOCK_TTL_MS;
}

export function clockStartForMode(
  simulationDateMs: number,
  mode: DemoRuntimeMode,
): number {
  return (
    simulationDateMs +
    (mode === "shot" ? SHOT_CLOCK_OFFSET_MS : LIVE_CLOCK_OFFSET_MS)
  );
}

export function countdownState(
  startedAt: number,
  expiresAt: number,
  now: number,
): CountdownState {
  const totalMs = Math.max(1, expiresAt - startedAt);
  const remainingMs = Math.max(0, expiresAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    remainingMs,
    progressPct: Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)),
  };
}
