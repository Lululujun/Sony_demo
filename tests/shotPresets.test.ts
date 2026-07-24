import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOT_PRESET,
  SHOT_PRESETS,
  SHOT_PRESET_INTENTS,
  isShotPreset,
  parseShotPreset,
} from "../src/core/shotPresets";

describe("screenshot preset registry", () => {
  it("contains exactly nine unique presets with an intent", () => {
    expect(SHOT_PRESETS).toHaveLength(9);
    expect(new Set(SHOT_PRESETS).size).toBe(9);
    expect(Object.keys(SHOT_PRESET_INTENTS).sort()).toEqual(
      [...SHOT_PRESETS].sort(),
    );
  });

  it("accepts registered presets and rejects typos deterministically", () => {
    expect(isShotPreset("layering-p2")).toBe(true);
    expect(isShotPreset("ratios-colors")).toBe(false);
    expect(parseShotPreset("ratios-colors")).toBe(DEFAULT_SHOT_PRESET);
    expect(parseShotPreset(null)).toBe(DEFAULT_SHOT_PRESET);
  });
});
