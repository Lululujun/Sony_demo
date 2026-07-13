"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { calibrateInventory } from "@/src/core/inventory";
import { CALIBRATION_TRUTH } from "@/src/mock/seed";
import { useDemo } from "@/src/store/DemoContext";
import { StatusPill } from "@/src/components/ui/Primitives";

export function CalibrationModal() {
  const { calibrationOpen, closeCalibration, applyCalibration, inventorySeeds } = useDemo();

  useEffect(() => {
    if (!calibrationOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCalibration();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [calibrationOpen, closeCalibration]);

  if (!calibrationOpen) return null;

  const rows = inventorySeeds.flatMap((seed) => {
    const row = CALIBRATION_TRUTH.find((item) => item.dealerId === seed.dealerId);
    if (!row) return [];
    const previousVelocity = seed.estimatedDailySellThrough;
    const result = calibrateInventory({
      estimatedInventory: row.estimated,
      truthInventory: row.truth,
      previousVelocity,
      thresholdUnits: 12,
    });
    return [{
      ...row,
      dealerName: seed.dealerName,
      result,
      adjustment: result.nextVelocity - previousVelocity,
      errorRate: row.estimated ? (result.absoluteError / row.estimated) * 100 : 0,
    }];
  });
  const scaleMax = Math.max(...rows.flatMap((row) => [row.estimated, row.truth]), 1);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeCalibration(); }}>
      <section className="calibration-modal" role="dialog" aria-modal="true" aria-labelledby="calibration-title" data-testid="calibration-modal">
        <header className="calibration-header">
          <div>
            <h2 id="calibration-title">周初库存校准</h2>
            <p>库存真值已到达，系统将微调可信渠道并隔离异常偏差。</p>
          </div>
          <button type="button" className="icon-button" onClick={closeCalibration} aria-label="关闭校准弹窗"><X size={18} /></button>
        </header>

        <div className="calibration-summary">
          <div><CheckCircle2 size={18} /><span>自动微调</span><strong>{rows.filter((row) => row.result.trusted).length}<small>家</small></strong></div>
          <div><AlertTriangle size={18} /><span>异常隔离</span><strong>{rows.filter((row) => !row.result.trusted).length}<small>家</small></strong></div>
          <div><span>偏差阈值</span><strong>±12<small>台</small></strong></div>
        </div>

        <div className="calibration-list">
          {rows.map((row) => (
            <div className={`calibration-row ${row.result.trusted ? "" : "untrusted"}`} key={row.dealerId}>
              <div className="calibration-dealer"><strong>{row.dealerName}</strong><span>偏差 {row.errorRate.toFixed(1)}%</span></div>
              <div className="calibration-bars">
                <div><span>估算</span><i><b style={{ width: `${(row.estimated / scaleMax) * 100}%` }} /></i><strong>{row.estimated}</strong></div>
                <div><span>真值</span><i><b style={{ width: `${(row.truth / scaleMax) * 100}%` }} /></i><strong>{row.truth}</strong></div>
              </div>
              <div className="calibration-action">
                {row.result.trusted ? (
                  <StatusPill tone="emerald">动销参数 {row.adjustment >= 0 ? "+" : ""}{row.adjustment.toFixed(2)}</StatusPill>
                ) : (
                  <StatusPill tone="amber">标记不可信 → 仅保底</StatusPill>
                )}
              </div>
            </div>
          ))}
        </div>

        <footer className="calibration-footer">
          <span>应用后，新参数会立即同步到分货工作台。</span>
          <div><button type="button" className="button ghost" onClick={closeCalibration}>暂不应用</button><button type="button" className="button primary" onClick={applyCalibration} data-testid="apply-calibration">应用并开始新的一周</button></div>
        </footer>
      </section>
    </div>
  );
}
