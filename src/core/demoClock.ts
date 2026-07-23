export type DemoRuntimeMode = "normal" | "presentation" | "shot";

export function runtimeModeFromSearch(search: string): DemoRuntimeMode {
  const params = new URLSearchParams(search);
  if (params.get("shot") === "1") return "shot";
  if (params.get("demo") === "1" || params.get("mode") === "presentation") {
    return "presentation";
  }
  return "normal";
}
