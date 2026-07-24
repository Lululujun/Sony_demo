"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";

export type TraceVariant = "row" | "band";

export interface TraceStep {
  index: number;
  scope: string;
  action: string;
  value?: number | string;
  reason: string;
  refId?: string;
}

export interface TraceConsoleProps {
  title: string;
  subtitle?: string;
  technicalLabel?: string;
  steps: readonly TraceStep[];
  variant: TraceVariant;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  activeRefId?: string | null;
  onStepClick?: (refId: string) => void;
  onStepSelect?: (step: TraceStep) => void;
  visibleSteps?: readonly number[];
  footer?: ReactNode;
  className?: string;
}

export const TRACE_ROW_MIN_WIDTH = 720;

export function traceVariantNeedsWidthWarning(
  variant: TraceVariant,
  width: number,
): boolean {
  return variant === "row" && width < TRACE_ROW_MIN_WIDTH;
}

export function calculateTraceRevealDelta(
  trackLeft: number,
  trackRight: number,
  stepLeft: number,
  stepRight: number,
  padding = 24,
): number {
  if (stepLeft < trackLeft + padding) {
    return stepLeft - trackLeft - padding;
  }
  if (stepRight > trackRight - padding) {
    return stepRight - trackRight + padding;
  }
  return 0;
}

export function calculateTraceEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): { left: boolean; right: boolean } {
  const max = Math.max(0, scrollWidth - clientWidth);
  return {
    left: scrollLeft > 1,
    right: scrollLeft < max - 1,
  };
}

function actionTone(action: string): string {
  if (action === "STOP") return "stop";
  if (action === "DESCEND") return "descend";
  if (action === "ALLOC") return "allocate";
  return "score";
}

export function TraceConsole({
  title,
  subtitle,
  technicalLabel,
  steps,
  variant,
  collapsible = false,
  defaultCollapsed = false,
  activeRefId,
  onStepClick,
  onStepSelect,
  visibleSteps,
  footer,
  className = "",
}: TraceConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const warnedForWidth = useRef(false);
  const prefersReduced = useRef(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const displayedSteps = useMemo(() => {
    if (!visibleSteps) return steps;
    const visible = new Set(visibleSteps);
    return steps.filter((_, index) => visible.has(index));
  }, [steps, visibleSteps]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      prefersReduced.current = media.matches;
    };
    syncPreference();
    media.addEventListener?.("change", syncPreference);
    return () => media.removeEventListener?.("change", syncPreference);
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" ||
      variant !== "row" ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const shouldWarn = traceVariantNeedsWidthWarning(
        variant,
        entry.contentRect.width,
      );
      if (shouldWarn && !warnedForWidth.current) {
        console.warn(
          `[TraceConsole] row 变体需要至少 ${TRACE_ROW_MIN_WIDTH}px 可用宽度；当前为 ${Math.round(entry.contentRect.width)}px，请改用 band 变体。`,
        );
        warnedForWidth.current = true;
      }
      if (!shouldWarn) warnedForWidth.current = false;
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [variant]);

  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const next = calculateTraceEdges(
      track.scrollLeft,
      track.scrollWidth,
      track.clientWidth,
    );
    setEdges((current) =>
      current.left === next.left && current.right === next.right
        ? current
        : next,
    );
  }, []);

  const revealStep = useCallback((index: number) => {
    const track = trackRef.current;
    const element = stepRefs.current.get(index);
    if (!track || !element) return;

    const trackRect = track.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const delta = calculateTraceRevealDelta(
      trackRect.left,
      trackRect.right,
      elementRect.left,
      elementRect.right,
    );
    if (delta === 0) return;

    track.scrollBy({
      left: delta,
      behavior: prefersReduced.current ? "auto" : "smooth",
    });
  }, []);

  const selectStep = useCallback(
    (index: number) => {
      const step = displayedSteps[index];
      if (!step) return;
      setActiveIndex(index);
      revealStep(index);
      onStepSelect?.(step);
      if (step.refId) onStepClick?.(step.refId);
    },
    [displayedSteps, onStepClick, onStepSelect, revealStep],
  );

  useEffect(() => {
    if (activeRefId === undefined) return;
    if (activeRefId === null) {
      setActiveIndex(null);
      return;
    }
    const index = displayedSteps.findIndex(
      (step) => step.refId === activeRefId,
    );
    setActiveIndex(index >= 0 ? index : null);
    if (index >= 0) {
      const frame = window.requestAnimationFrame(() => revealStep(index));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [activeRefId, displayedSteps, revealStep]);

  useEffect(() => {
    if (collapsed) {
      setEdges({ left: false, right: false });
      return;
    }
    const track = trackRef.current;
    if (!track) return;

    const frame = window.requestAnimationFrame(syncEdges);
    track.addEventListener("scroll", syncEdges, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncEdges);
    observer?.observe(track);

    return () => {
      window.cancelAnimationFrame(frame);
      track.removeEventListener("scroll", syncEdges);
      observer?.disconnect();
    };
  }, [collapsed, displayedSteps.length, syncEdges]);

  useEffect(() => {
    if (collapsed || activeIndex === null) return;
    const frame = window.requestAnimationFrame(() => revealStep(activeIndex));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, collapsed, revealStep]);

  useEffect(() => {
    if (collapsed) return;
    const track = trackRef.current;
    if (!track) return;

    const handleWheel = (event: WheelEvent) => {
      if (
        event.deltaY === 0 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ) {
        return;
      }
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 0) return;

      const atStart = track.scrollLeft <= 1;
      const atEnd = track.scrollLeft >= max - 1;
      if (
        (event.deltaY < 0 && atStart) ||
        (event.deltaY > 0 && atEnd)
      ) {
        return;
      }

      event.preventDefault();
      track.scrollLeft += event.deltaY;
    };

    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => track.removeEventListener("wheel", handleWheel);
  }, [collapsed, displayedSteps.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * track.clientWidth * 0.8,
      behavior: prefersReduced.current ? "auto" : "smooth",
    });
  };

  const handleTrackKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const last = displayedSteps.length - 1;
    if (last < 0) return;
    const current = activeIndex ?? 0;
    let next: number | null = null;

    if (event.key === "ArrowRight") next = Math.min(current + 1, last);
    else if (event.key === "ArrowLeft") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;

    event.preventDefault();
    selectStep(next);
    stepRefs.current.get(next)?.focus({ preventScroll: true });
  };

  if (variant === "row") {
    return (
      <div
        ref={containerRef}
        className={`audit-console trace-console trace-console--row ${className}`.trim()}
      >
        <div className="audit-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </div>
        {steps.map((step) => (
          <div className="trace-console-row-step" key={`${step.index}-${step.refId ?? step.reason}`}>
            <span>#{String(step.index).padStart(2, "0")}</span>
            <b>{step.scope}</b>
            <em>{step.action}</em>
            <strong>{step.value ?? "—"}</strong>
            <p>{step.reason}</p>
          </div>
        ))}
        {footer && <div className="audit-total">{footer}</div>}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={title}
      className={`card trace-console trace-console--band ${collapsed ? "collapsed" : ""} ${className}`.trim()}
      data-testid="trace-console-band"
    >
      <header className="trace-console-band-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="trace-console-header-actions">
          {!collapsed && displayedSteps.length > 0 && (
            <div
              className="trace-console-navigation"
              aria-label="轨迹步骤导航"
            >
              <button
                type="button"
                className="icon-button"
                onClick={() => scrollByPage(-1)}
                disabled={!edges.left}
                aria-label="上一组步骤"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="trace-counter" aria-live="polite">
                {activeIndex === null
                  ? "—"
                  : `#${String(displayedSteps[activeIndex]?.index ?? activeIndex + 1).padStart(2, "0")}`}{" "}
                / {steps.length}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={() => scrollByPage(1)}
                disabled={!edges.right}
                aria-label="下一组步骤"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          {collapsible && (
            <button
              type="button"
              className="button ghost trace-console-toggle"
              onClick={() => setCollapsed((current) => !current)}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              {collapsed ? "展开" : "收起"}
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div className="trace-console-band-surface">
          {technicalLabel && (
            <div className="trace-console-technical">{technicalLabel}</div>
          )}
          <div
            className="trace-console-band-scroll-shell"
            data-edge-left={edges.left}
            data-edge-right={edges.right}
          >
            <div
              ref={trackRef}
              className="trace-console-band-track"
              onKeyDown={handleTrackKeyDown}
              aria-label={`${title}步骤`}
            >
            {displayedSteps.map((step, index) => {
              const content = (
                <>
                  <span className="trace-step-kicker">
                    <span>#{String(step.index).padStart(2, "0")}</span>
                    <b>{step.scope}</b>
                  </span>
                  <span className={`trace-step-action ${actionTone(step.action)}`}>
                    <em>{step.action}</em>
                    <strong>{step.value ?? "—"}</strong>
                  </span>
                  <p title={step.reason}>{step.reason}</p>
                </>
              );
              const active = Boolean(
                activeIndex === index,
              );

              return (
                <button
                  ref={(element) => {
                    if (element) stepRefs.current.set(index, element);
                    else stepRefs.current.delete(index);
                  }}
                  type="button"
                  role="button"
                  tabIndex={
                    activeIndex === index ||
                    (activeIndex === null && index === 0)
                      ? 0
                      : -1
                  }
                  key={`${step.index}-${step.refId ?? step.reason}`}
                  data-testid={`trace-step-${step.refId ?? step.index}`}
                  className={`trace-step-card interactive ${active ? "active" : ""}`}
                  onClick={() => selectStep(index)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`步骤 ${step.index}，${step.scope}，${step.action}`}
                >
                  {content}
                </button>
              );
            })}
            </div>
          </div>
          {footer && <div className="trace-console-band-total">{footer}</div>}
        </div>
      )}
    </div>
  );
}
