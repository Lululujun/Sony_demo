"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Hourglass,
  LockKeyhole,
  PackageOpen,
  Play,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import type { LockOrder, LockStatus } from "@/src/core/types";
import { countdownState } from "@/src/core/demoClock";
import { SKU_CATALOG } from "@/src/mock/seed";
import { useDemo } from "@/src/store/DemoContext";
import { CardTitle, PageHeading, StatusPill } from "@/src/components/ui/Primitives";

const COLUMNS: Array<{ id: string; title: string; statuses: LockStatus[] }> = [
  { id: "pending", title: "待锁单", statuses: ["ALLOCATED"] },
  { id: "soft", title: "软锁定", statuses: ["SOFT_LOCKED"] },
  { id: "paid", title: "已支付", statuses: ["CONFIRMED"] },
  { id: "released", title: "已释放", statuses: ["RELEASED", "WAIVED"] },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function statusPill(order: LockOrder) {
  if (order.status === "CONFIRMED") return <StatusPill tone="emerald">已支付</StatusPill>;
  if (order.status === "SOFT_LOCKED") return <StatusPill tone="amber">待支付</StatusPill>;
  if (order.status === "WAIVED") return <StatusPill tone="stone">主动放弃</StatusPill>;
  if (order.status === "RELEASED" && order.releaseReason === "PAYMENT_TIMEOUT") return <StatusPill tone="red">支付超时</StatusPill>;
  if (order.status === "RELEASED") return <StatusPill tone="amber">额度释放</StatusPill>;
  return <StatusPill tone="blue">待锁单</StatusPill>;
}

export function LockingPage() {
  const {
    lockOrders,
    releasedPool,
    clockNow,
    autoTimeoutEnabled,
    requestOrderLock,
    confirmOrder,
    waiveOrder,
    timeoutOrder,
  } = useDemo();
  const [shakingId, setShakingId] = useState<string | null>(null);

  const totalAllocated = lockOrders.reduce((sum, order) => sum + order.allocatedUnits, 0);
  const totalLocked = lockOrders.reduce((sum, order) => sum + order.lockedUnits, 0);
  const paid = lockOrders
    .filter((order) => order.status === "CONFIRMED")
    .reduce((sum, order) => sum + order.lockedUnits, 0);

  const intercepts = useMemo(
    () => lockOrders.flatMap((order) =>
      order.auditTrail
        .filter((entry) => entry.event === "REQUEST_LOCK" && entry.releasedUnits > 0)
        .map((entry) => ({ order, entry })),
    ),
    [lockOrders],
  );

  const statusCounts = {
    allocated: lockOrders.filter((order) => order.status === "ALLOCATED").length,
    soft: lockOrders.filter((order) => order.status === "SOFT_LOCKED").length,
    paid: lockOrders.filter((order) => order.status === "CONFIRMED").length,
    released: lockOrders.filter((order) => order.status === "RELEASED" || order.status === "WAIVED").length,
  };

  return (
    <div className="page locking-page" data-testid="page-locking">
      <PageHeading
        title="锁单看板"
        help="分货额度在锁单时再次按实时资金余额校验，部分覆盖的数量进入软锁，其余立即回流。"
      />

      <section className="lock-stepper card" aria-label="锁单状态流">
        <StepNode label="分配" count={statusCounts.allocated} active={statusCounts.allocated > 0} />
        <span>→</span>
        <StepNode label="软锁定" count={statusCounts.soft} active={statusCounts.soft > 0} tone="amber" />
        <span>→</span>
        <StepNode label="已支付" count={statusCounts.paid} active={statusCounts.paid > 0} tone="emerald" />
        <i />
        <StepNode label="主动放弃" count={lockOrders.filter((order) => order.status === "WAIVED").length} />
        <StepNode label="超时释放" count={lockOrders.filter((order) => order.releaseReason === "PAYMENT_TIMEOUT").length} tone="red" />
      </section>

      <div className="locking-layout">
        <section className="kanban-board-v2">
          {COLUMNS.map((column) => {
            const orders = lockOrders.filter((order) => column.statuses.includes(order.status));
            return (
              <div className="kanban-column-v2" key={column.id} data-testid={`kanban-${column.id}`}>
                <div className="kanban-column-head"><h2>{column.title}</h2><span>{orders.length}</span></div>
                <div className="kanban-column-body">
                  {orders.length > 0 ? orders.map((order) => (
                    <LockCard
                      key={order.id}
                      order={order}
                      now={clockNow}
                      autoTimeoutEnabled={autoTimeoutEnabled}
                      shaking={shakingId === order.id}
                      onRequest={() => {
                        if (order.dealerId === "B" || order.dealerId === "F") {
                          setShakingId(order.id);
                          window.setTimeout(() => setShakingId(null), 320);
                        }
                        requestOrderLock(order.id);
                      }}
                      onConfirm={() => confirmOrder(order.id)}
                      onWaive={() => waiveOrder(order.id)}
                      onTimeout={() => timeoutOrder(order.id)}
                    />
                  )) : (
                    <div className="kanban-empty">
                      <img src="/logo.png" alt="" />
                      <span>暂无卡片</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="locking-insights">
          <section className="card funnel-card">
            <CardTitle title="今日锁单漏斗" />
            <FunnelRow label="分配配额" value={totalAllocated} total={Math.max(1, totalAllocated)} tone="blue" />
            <FunnelRow label="进入软锁" value={totalLocked} total={Math.max(1, totalAllocated)} tone="amber" />
            <FunnelRow label="支付确认" value={paid} total={Math.max(1, totalAllocated)} tone="emerald" />
          </section>

          <section className={`card reflow-card ${releasedPool > 0 ? "has-reflow" : ""}`}>
            <div><span>释放回流</span><small>已同步到分货工作台</small></div>
            <strong>+{releasedPool}<sup>台</sup></strong>
          </section>

          <section className="card intercept-card">
            <CardTitle title="额度拦截记录" detail="锁单时读取实时余额" />
            <div className="intercept-list">
              {intercepts.length ? intercepts.map(({ order, entry }) => (
                <div key={`${order.id}-${entry.sequence}`}>
                  <span className="intercept-icon"><ShieldAlert size={16} /></span>
                  <p><strong>{order.dealerName}</strong><small>仅覆盖 {entry.units}/{order.allocatedUnits} 台，释放 {entry.releasedUnits} 台</small></p>
                  <time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              )) : (
                <div className="intercept-empty"><Check size={17} /> 暂无额度拦截</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StepNode({ label, count, active, tone = "stone" }: { label: string; count: number; active?: boolean; tone?: "stone" | "amber" | "emerald" | "red" }) {
  return (
    <span className={`lock-step ${active ? "active" : ""} ${tone}`}>
      {label}{count > 0 && <b>{count}</b>}
    </span>
  );
}

function LockCard({
  order,
  now,
  autoTimeoutEnabled,
  shaking,
  onRequest,
  onConfirm,
  onWaive,
  onTimeout,
}: {
  order: LockOrder;
  now: number;
  autoTimeoutEnabled: boolean;
  shaking: boolean;
  onRequest: () => void;
  onConfirm: () => void;
  onWaive: () => void;
  onTimeout: () => void;
}) {
  const price = SKU_CATALOG.find((item) => item.name === order.sku || item.id === order.sku)?.unitPrice ?? 3_499;
  const soft = order.status === "SOFT_LOCKED";
  const lockStartedAt = order.auditTrail.findLast(
    (entry) => entry.event === "REQUEST_LOCK" && entry.to === "SOFT_LOCKED",
  )?.at;
  const countdown = soft && order.softLockExpiresAt !== undefined
    ? countdownState(
        lockStartedAt ?? order.softLockExpiresAt - 1,
        order.softLockExpiresAt,
        now,
      )
    : null;
  return (
    <article className={`lock-card ${soft ? "soft" : ""} ${order.status === "CONFIRMED" ? "paid" : ""} ${shaking ? "shake" : ""}`} data-testid={`order-${order.dealerId}`}>
      <div className="lock-card-head"><strong>{order.dealerName}</strong>{statusPill(order)}</div>
      <span className="lock-card-sku">{order.sku} · {order.id}</span>
      <div className="lock-card-values">
        <div><span>数量</span><strong>{order.lockedUnits || order.allocatedUnits}<small>台</small></strong></div>
        <div><span>金额</span><strong>¥{formatMoney((order.lockedUnits || order.allocatedUnits) * price)}</strong></div>
      </div>
      {order.releasedUnits > 0 && <div className="released-note">已释放 {order.releasedUnits} 台至回流池</div>}
      {countdown && (
        <div
          className="lock-countdown"
          data-auto-timeout={autoTimeoutEnabled ? "on" : "off"}
          title={autoTimeoutEnabled ? "归零后自动释放回流" : "演示模式下由“模拟超时”按钮受控触发"}
        >
          <div>
            <span>支付倒计时</span>
            <strong data-testid={`countdown-${order.dealerId}`}>{countdown.label}</strong>
          </div>
          <span><i style={{ width: `${countdown.progressPct}%` }} /></span>
        </div>
      )}
      <div className="lock-actions">
        {order.status === "ALLOCATED" && <button type="button" className="mini-button primary" onClick={onRequest}><LockKeyhole size={14} />发起锁单</button>}
        {soft && <button type="button" className="mini-button emerald" onClick={onConfirm}><CreditCard size={14} />确认支付</button>}
        {soft && <button type="button" className="mini-button amber" onClick={onTimeout} data-testid={`timeout-${order.dealerId}`}><Hourglass size={14} />模拟超时</button>}
        {(order.status === "ALLOCATED" || soft) && <button type="button" className="mini-button" onClick={onWaive}><Ban size={14} />主动放弃</button>}
      </div>
    </article>
  );
}

function FunnelRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: "blue" | "amber" | "emerald" }) {
  const pct = Math.min(100, (value / total) * 100);
  return (
    <div className="funnel-row">
      <div><span>{label}</span><strong>{value}<small>台</small></strong></div>
      <span className="funnel-track"><i className={tone} style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
