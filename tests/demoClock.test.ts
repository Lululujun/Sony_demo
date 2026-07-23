import { describe, expect, it } from "vitest";

import { runtimeModeFromSearch } from "../src/core/demoClock";

describe("demo clock", () => {
  it("selects normal, presentation and deterministic shot modes from the URL", () => {
    expect(runtimeModeFromSearch("")).toBe("normal");
    expect(runtimeModeFromSearch("?demo=1")).toBe("presentation");
    expect(runtimeModeFromSearch("?mode=presentation")).toBe("presentation");
    expect(runtimeModeFromSearch("?demo=1&shot=1")).toBe("shot");
  });

});
