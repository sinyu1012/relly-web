"use client";

import type { QuickScanProgress } from "@/lib/types";

import styles from "./ScanStatus.module.css";

type Props = {
  progress: QuickScanProgress;
  isScanning: boolean;
  scanError: string;
};

export function ScanStatus({ progress, isScanning, scanError }: Props) {
  const activeStage =
    progress.stages.find((stage) => stage.state === "active") ??
    progress.stages.find((stage) => stage.id === progress.currentStageId) ??
    progress.stages[0];
  const progressValue = isScanning ? activeStage?.progress ?? 0 : 0;

  return (
    <section className={styles.panel} aria-labelledby="scan-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 03</p>
          <h2 id="scan-heading">本地快扫进度</h2>
        </div>
        <p className={styles.meta}>扫描流程按阶段执行，不会直接给出真假裁决。</p>
      </div>

      <div className={styles.progressRail}>
        <div
          className={styles.progressFill}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressValue}
          style={{ width: `${progressValue}%` }}
        />
      </div>

      <div className={styles.progressHeadline} aria-live="polite">
        <strong>{isScanning ? activeStage?.label : "等待开始"}</strong>
        <span>{isScanning ? activeStage?.description : "选择图片后开始本地快扫。"}</span>
      </div>

      <ol className={styles.stageList}>
        {progress.stages.map((stage) => (
          <li
            key={stage.id}
            className={[
              styles.stageItem,
              stage.state === "active" ? styles.stageActive : "",
              stage.state === "done" ? styles.stageDone : "",
              stage.state === "error" ? styles.stageError : "",
            ].join(" ")}
          >
            <span className={styles.stageBadge}>{stage.progress}%</span>
            <div>
              <strong>{stage.label}</strong>
              <p>{stage.description}</p>
            </div>
          </li>
        ))}
      </ol>

      {scanError ? (
        <p className={styles.errorText} role="alert">
          {scanError}
        </p>
      ) : null}
    </section>
  );
}
