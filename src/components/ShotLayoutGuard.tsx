"use client";

import { useEffect } from "react";
import {
  SHOT_PRESET_INTENTS,
  type ShotPresetId,
} from "@/src/core/shotPresets";
import { useDemo } from "@/src/store/DemoContext";

const CRITICAL_SELECTORS: Record<ShotPresetId, readonly string[]> = {
  "workbench-result": [
    ".solver-card",
  ],
  "workbench-audit": [
    ".result-card",
    ".trace-console--row",
  ],
  scenarios: [
    ".scenario-cards",
    ".scenario-analysis-grid",
  ],
  "layering-p1": [
    ".layering-main-grid",
    ".trace-console--band",
  ],
  "layering-p2": [
    ".layering-main-grid",
    ".trace-console--band",
  ],
  "ratios-special": [
    "[data-testid='ratio-section-rules']",
    "[data-testid='ratio-section-special']",
    "[data-testid='color-model-check']",
  ],
  "turnover-psi": [
    ".turnover-metric-strip",
    ".turnover-grid",
  ],
  calibration: [
    "[data-testid='calibration-modal']",
    ".calibration-footer",
  ],
  "console-alerts": [
    ".console-diagnostics-column",
  ],
};

interface VisibleRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function intersectRect(left: VisibleRect, right: DOMRect): VisibleRect {
  return {
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
    left: Math.max(left.left, right.left),
  };
}

function isClippingElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  const values = [
    style.overflow,
    style.overflowX,
    style.overflowY,
  ].join(" ");
  return /(auto|scroll|hidden|clip)/.test(values);
}

function visibilityIssue(element: Element, selector: string): string | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return `${selector} 不可见`;
  }

  let visible: VisibleRect = {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  };
  let parent = element.parentElement;
  while (parent) {
    if (isClippingElement(parent)) {
      visible = intersectRect(visible, parent.getBoundingClientRect());
    }
    parent = parent.parentElement;
  }

  const tolerance = 2;
  if (
    rect.top < visible.top - tolerance ||
    rect.left < visible.left - tolerance ||
    rect.right > visible.right + tolerance ||
    rect.bottom > visible.bottom + tolerance
  ) {
    return `${selector} 被裁切（元素 ${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}；可见区 ${Math.round(visible.left)},${Math.round(visible.top)},${Math.round(visible.right)},${Math.round(visible.bottom)}）`;
  }
  return null;
}

function traceLineIssue(): string | null {
  const reasons = document.querySelectorAll<HTMLElement>(
    ".trace-console--band .trace-step-card p",
  );
  const maxLines = window.innerWidth >= 1600 ? 1 : 2;
  for (const reason of reasons) {
    const lineHeight = Number.parseFloat(
      window.getComputedStyle(reason).lineHeight,
    );
    if (
      Number.isFinite(lineHeight) &&
      reason.getBoundingClientRect().height > lineHeight * maxLines + 2
    ) {
      return `trace 理由超过 ${maxLines} 行`;
    }
  }
  return null;
}

export function ShotLayoutGuard() {
  const {
    runtimeMode,
    shotPreset,
    view,
    layeringScenario,
    calibrationOpen,
  } = useDemo();

  useEffect(() => {
    const root = document.documentElement;
    delete root.dataset.shotReady;
    delete root.dataset.shotStatus;
    delete root.dataset.shotIssues;
    if (runtimeMode !== "shot" || !shotPreset) return;

    let cancelled = false;

    const inspect = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      if (cancelled) return;

      const issues: string[] = [];
      const intent = SHOT_PRESET_INTENTS[shotPreset];
      if (view !== intent.view) {
        issues.push(`视图错误：${view}，预期 ${intent.view}`);
      }
      if (
        intent.layeringScenario &&
        layeringScenario !== intent.layeringScenario
      ) {
        issues.push(
          `分层场景错误：${layeringScenario}，预期 ${intent.layeringScenario}`,
        );
      }
      if (Boolean(intent.calibrationOpen) !== calibrationOpen) {
        issues.push(
          `校准弹窗状态错误：${String(calibrationOpen)}，预期 ${String(Boolean(intent.calibrationOpen))}`,
        );
      }

      if (
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2 ||
        document.body.scrollWidth > document.body.clientWidth + 2
      ) {
        issues.push(
          `页面横向溢出：html ${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}，body ${document.body.scrollWidth}/${document.body.clientWidth}`,
        );
      }

      CRITICAL_SELECTORS[shotPreset].forEach((selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          issues.push(`缺少关键元素 ${selector}`);
          return;
        }
        const issue = visibilityIssue(element, selector);
        if (issue) issues.push(issue);
      });

      const lineIssue = traceLineIssue();
      if (lineIssue) issues.push(lineIssue);

      if (shotPreset.startsWith("layering-")) {
        const grid = document.querySelector(".layering-main-grid");
        const band = document.querySelector(".trace-console--band");
        if (grid && band) {
          const gridWidth = grid.getBoundingClientRect().width;
          const bandWidth = band.getBoundingClientRect().width;
          if (bandWidth < gridWidth - 2) {
            issues.push(
              `分层 trace 未铺满：${Math.round(bandWidth)}/${Math.round(gridWidth)}`,
            );
          }
        }
      }

      const pageText =
        document.querySelector("main")?.textContent?.replace(/\s+/g, " ") ??
        "";
      if (
        (shotPreset === "workbench-result" ||
          shotPreset === "workbench-audit") &&
        !["108", "50", "52", "210"].every((value) =>
          pageText.includes(value),
        )
      ) {
        issues.push("PPT 基线 A/B/C=108/50/52、Σ=210 未完整出现");
      }
      if (
        shotPreset === "ratios-special" &&
        !pageText.includes("12 + 8 = 20")
      ) {
        issues.push("多颜色 12 + 8 = 20 收口未出现");
      }

      root.dataset.shotReady = "true";
      root.dataset.shotStatus = issues.length === 0 ? "pass" : "fail";
      root.dataset.shotIssues = issues.join(" | ") || "none";

      if (issues.length > 0) {
        console.warn(`[shot-check] ${shotPreset}: ${issues.join(" | ")}`);
      }
    };

    void inspect();
    return () => {
      cancelled = true;
    };
  }, [
    calibrationOpen,
    layeringScenario,
    runtimeMode,
    shotPreset,
    view,
  ]);

  return null;
}
