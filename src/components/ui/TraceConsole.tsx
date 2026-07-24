"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  activeRefId = null,
  onStepClick,
  footer,
  className = "",
}: TraceConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const warnedForWidth = useRef(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
      className={`card trace-console trace-console--band ${collapsed ? "collapsed" : ""} ${className}`.trim()}
      data-testid="trace-console-band"
    >
      <header className="trace-console-band-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
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
      </header>

      {!collapsed && (
        <div className="trace-console-band-surface">
          {technicalLabel && (
            <div className="trace-console-technical">{technicalLabel}</div>
          )}
          <div className="trace-console-band-track">
            {steps.map((step) => {
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
                step.refId && activeRefId && step.refId === activeRefId,
              );

              return onStepClick && step.refId ? (
                <button
                  type="button"
                  key={`${step.index}-${step.refId}`}
                  data-testid={`trace-step-${step.refId}`}
                  className={`trace-step-card interactive ${active ? "active" : ""}`}
                  onClick={() => onStepClick(step.refId as string)}
                  aria-pressed={active}
                >
                  {content}
                </button>
              ) : (
                <article
                  key={`${step.index}-${step.refId ?? step.reason}`}
                  className="trace-step-card"
                >
                  {content}
                </article>
              );
            })}
          </div>
          {footer && <div className="trace-console-band-total">{footer}</div>}
        </div>
      )}
    </div>
  );
}
