"use client";

import type { QuickScanResult } from "@/lib/types";

import styles from "./ResultPanel.module.css";

type Props = {
  result: QuickScanResult | null;
  onExportReport: () => void;
  onOpenAppeal: () => void;
};

const riskLabels: Record<QuickScanResult["riskBand"], string> = {
  low: "低风险",
  uncertain: "不确定",
  elevated: "偏高风险",
  high: "高风险",
};

export function ResultPanel({ result, onExportReport, onOpenAppeal }: Props) {
  if (!result) {
    return (
      <section className={styles.panel} aria-labelledby="result-heading">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Step 04</p>
            <h2 id="result-heading">结果页</h2>
          </div>
          <p className={styles.meta}>快扫完成后，这里会展示风险带、证据项和建议动作。</p>
        </div>
        <div className={styles.emptyState}>
          <span>RESULT PENDING</span>
          <p>还没有本地结果。上传图片并开始快扫后，会在这里生成证据型报告。</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="result-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 04</p>
          <h2 id="result-heading">结果页</h2>
        </div>
        <p className={styles.meta}>case ID：{result.caseId}</p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.previewCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`图片预览：${result.fileName}`}
            className={styles.previewImage}
            src={result.previewUrl}
          />
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.resultTopline}>
            <span
              className={[
                styles.riskPill,
                styles[`risk-${result.riskBand}`],
              ].join(" ")}
            >
              {riskLabels[result.riskBand]}
            </span>
            <strong>{result.riskScore} / 100</strong>
          </div>
          <div className={styles.riskRail} aria-hidden="true">
            <span style={{ width: `${result.riskScore}%` }} />
          </div>
          <p className={styles.summaryText}>{result.summary}</p>
          <p className={styles.disclaimer}>{result.disclaimer}</p>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onExportReport}
            >
              导出报告 JSON
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onOpenAppeal}
            >
              提交申诉
            </button>
          </div>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <article className={styles.infoCard}>
          <h3>来源凭证</h3>
          <p>{result.provenance.summary}</p>
          <dl className={styles.definitionList}>
            <div>
              <dt>Validation</dt>
              <dd>{result.provenance.validationState ?? "无"}</dd>
            </div>
            <div>
              <dt>Manifest</dt>
              <dd>{result.provenance.activeManifest ?? "无"}</dd>
            </div>
            <div>
              <dt>Generator</dt>
              <dd>{result.provenance.generator ?? "未声明"}</dd>
            </div>
          </dl>
          {result.provenance.validationMessages.length ? (
            <ul className={styles.messageList}>
              {result.provenance.validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className={styles.infoCard}>
          <h3>元数据摘要</h3>
          <dl className={styles.definitionList}>
            <div>
              <dt>格式</dt>
              <dd>{result.metadata.format}</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>
                {result.metadata.dimensions
                  ? `${result.metadata.dimensions.width} × ${result.metadata.dimensions.height}`
                  : "未读取"}
              </dd>
            </div>
            <div>
              <dt>设备</dt>
              <dd>{result.metadata.camera ?? "未记录"}</dd>
            </div>
            <div>
              <dt>软件</dt>
              <dd>{result.metadata.software ?? "未记录"}</dd>
            </div>
            <div>
              <dt>GPS</dt>
              <dd>{result.metadata.gps.present ? "存在（默认隐藏）" : "未检测到"}</dd>
            </div>
          </dl>
          <p className={styles.metadataNote}>{result.metadata.note}</p>
        </article>
      </div>

      <div className={styles.signalSection}>
        <h3>证据项</h3>
        <div className={styles.tableWrap}>
          <table className={styles.signalTable}>
            <thead>
              <tr>
                <th scope="col">信号项</th>
                <th scope="col">状态</th>
                <th scope="col">来源</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {result.signals.map((signal) => (
                <tr key={signal.id}>
                  <th scope="row">{signal.title}</th>
                  <td>{signal.status}</td>
                  <td>{signal.source}</td>
                  <td>{signal.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.nextSection}>
        <h3>建议动作</h3>
        <ul className={styles.nextActionList}>
          {result.nextActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

