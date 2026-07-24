import { describe, expect, it } from "vitest";
import {
  TRACE_ROW_MIN_WIDTH,
  traceVariantNeedsWidthWarning,
} from "../src/components/ui/TraceConsole";

describe("TraceConsole width contract", () => {
  it("warns when the row variant is rendered in a narrow container", () => {
    expect(traceVariantNeedsWidthWarning("row", 400)).toBe(true);
    expect(
      traceVariantNeedsWidthWarning("row", TRACE_ROW_MIN_WIDTH - 1),
    ).toBe(true);
  });

  it("allows row at the contract boundary and band at any width", () => {
    expect(
      traceVariantNeedsWidthWarning("row", TRACE_ROW_MIN_WIDTH),
    ).toBe(false);
    expect(traceVariantNeedsWidthWarning("band", 320)).toBe(false);
  });
});
