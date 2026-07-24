export const SHOT_PRESETS = [
  "workbench-result",
  "workbench-audit",
  "scenarios",
  "layering-p1",
  "layering-p2",
  "ratios-special",
  "turnover-psi",
  "calibration",
  "console-alerts",
] as const;

export type ShotPresetId = (typeof SHOT_PRESETS)[number];

export const DEFAULT_SHOT_PRESET: ShotPresetId = "workbench-result";

export type ShotPresetView =
  | "layering"
  | "workbench"
  | "scenarios"
  | "ratios"
  | "turnover"
  | "console";

export interface ShotPresetIntent {
  view: ShotPresetView;
  layeringScenario?: "p1" | "p2";
  calibrationOpen?: boolean;
}

export const SHOT_PRESET_INTENTS: Record<ShotPresetId, ShotPresetIntent> = {
  "workbench-result": { view: "workbench" },
  "workbench-audit": { view: "workbench" },
  scenarios: { view: "scenarios" },
  "layering-p1": { view: "layering", layeringScenario: "p1" },
  "layering-p2": { view: "layering", layeringScenario: "p2" },
  "ratios-special": { view: "ratios" },
  "turnover-psi": { view: "turnover" },
  calibration: { view: "turnover", calibrationOpen: true },
  "console-alerts": { view: "console" },
};

export function isShotPreset(value: string | null): value is ShotPresetId {
  return Boolean(
    value &&
      (SHOT_PRESETS as readonly string[]).includes(value),
  );
}

export function parseShotPreset(value: string | null): ShotPresetId {
  return isShotPreset(value) ? value : DEFAULT_SHOT_PRESET;
}
