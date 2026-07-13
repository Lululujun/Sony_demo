"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeading({
  title,
  help,
  context,
  actions,
}: {
  title: string;
  help: string;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-title-wrap">
        <h1>{title}</h1>
        <span className="help-wrap">
          <button type="button" className="icon-button" aria-label={`查看${title}说明`}>
            <CircleHelp size={17} />
          </button>
          <span className="help-popover" role="tooltip">{help}</span>
        </span>
        {context && <span className="page-heading-context">{context}</span>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
  );
}

export function StatusPill({
  tone = "stone",
  children,
}: {
  tone?: "stone" | "blue" | "emerald" | "amber" | "red";
  children: ReactNode;
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function CardTitle({
  title,
  detail,
  actions,
}: {
  title: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="card-title-row">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {actions && <div className="card-title-actions">{actions}</div>}
    </div>
  );
}
