"use client";

import type { QuickScanProgress } from "@/lib/types";

import styles from "./ScanStatus.module.css";

type Props = {
  progress: QuickScanProgress;
  isScanning: boolean;
  scanError: string;
};

export function ScanStatus({ progress, isScanning, scanError }: Props) {
  const hasCompleted = progress.stages.every((stage) => stage.state === "done");
  const activeStage =
    progress.stages.find((stage) => stage.state === "active") ??
    progress.stages.find((stage) => stage.id === progress.currentStageId) ??
    progress.stages[0];
  const progressValue = isScanning
    ? activeStage?.progress ?? 0
    : hasCompleted
      ? 100
      : 0;
  const headline = isScanning
    ? activeStage?.label ?? "判断中"
    : hasCompleted
      ? "判断完成"
      : "等待开始";
  const headlineDescription = isScanning
    ? activeStage?.description ?? "正在执行本地判断。"
    : hasCompleted
      ? "结果已生成，可继续查看证据项或导出图片报告。"
      : "选择图片后开始判断。";

  return (
    <section className={styles.panel} aria-labelledby="scan-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 02</p>
          <h2 id="scan-heading">判断进度</h2>
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
        <strong>{headline}</strong>
        <span>{headlineDescription}</span>
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
