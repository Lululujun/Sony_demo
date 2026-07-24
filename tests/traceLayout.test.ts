import { describe, expect, it } from "vitest";
import {
  calculateTraceEdges,
  calculateTraceRevealDelta,
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

describe("TraceConsole controlled scrolling", () => {
  it("keeps a fully visible card still and reveals clipped cards with context", () => {
    expect(calculateTraceRevealDelta(100, 900, 160, 400)).toBe(0);
    expect(calculateTraceRevealDelta(100, 900, 110, 350)).toBe(-14);
    expect(calculateTraceRevealDelta(100, 900, 700, 910)).toBe(34);
  });

  it("reports which direction still has reachable content", () => {
    expect(calculateTraceEdges(0, 1800, 800)).toEqual({
      left: false,
      right: true,
    });
    expect(calculateTraceEdges(500, 1800, 800)).toEqual({
      left: true,
      right: true,
    });
    expect(calculateTraceEdges(1000, 1800, 800)).toEqual({
      left: true,
      right: false,
    });
    expect(calculateTraceEdges(0, 700, 800)).toEqual({
      left: false,
      right: false,
    });
  });
});
