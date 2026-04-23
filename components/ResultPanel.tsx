"use client";

import type {
  AiImageAnalysisResult,
  MetadataField,
  ProvenanceAction,
  QuickScanResult,
} from "@/lib/types";

import styles from "./ResultPanel.module.css";

type Props = {
  result: QuickScanResult | null;
  reportImageUrl: string;
  reportExportError: string;
  isExportingReport: boolean;
  aiImageAnalysis: AiImageAnalysisResult | null;
  aiImageAnalysisError: string;
  isAnalyzingImage: boolean;
  onExportReport: () => void;
  onAnalyzeImage: () => void;
  onOpenAppeal: () => void;
};

const riskLabels: Record<QuickScanResult["riskBand"], string> = {
  low: "低风险",
  uncertain: "不确定",
  elevated: "偏高风险",
  high: "高风险",
};

const aiStatusLabels: Record<QuickScanResult["provenance"]["aiFootprint"]["status"], string> = {
  detected: "检测到 AI 元信息",
  not_detected: "未发现明确 AI 元信息",
  unknown: "无法确认",
};

const checkStatusLabels: Record<string, string> = {
  pass: "通过",
  info: "提示",
  warn: "注意",
  risk: "风险",
  error: "错误",
};

function FieldList({
  fields,
  emptyText = "暂无可展示字段。",
}: {
  fields: MetadataField[];
  emptyText?: string;
}) {
  if (!fields.length) {
    return <p className={styles.mutedText}>{emptyText}</p>;
  }

  return (
    <dl className={styles.definitionList}>
      {fields.map((field) => (
        <div key={`${field.label}-${field.value}`}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActionList({ actions }: { actions: ProvenanceAction[] }) {
  if (!actions.length) {
    return <p className={styles.mutedText}>未读取到 C2PA actions。</p>;
  }

  return (
    <ol className={styles.actionList}>
      {actions.map((action, index) => (
        <li key={`${action.action}-${index}`}>
          <strong>{action.action}</strong>
          <span>{action.softwareAgent ?? "软件代理未声明"}</span>
          <span>{action.digitalSourceType ?? "来源类型未声明"}</span>
          {action.when ? <span>{action.when}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function ResultPanel({
  result,
  reportImageUrl,
  reportExportError,
  isExportingReport,
  aiImageAnalysis,
  aiImageAnalysisError,
  isAnalyzingImage,
  onExportReport,
  onAnalyzeImage,
  onOpenAppeal,
}: Props) {
  if (!result) {
    return (
      <section className={styles.panel} aria-labelledby="result-heading">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Step 03</p>
            <h2 id="result-heading">结果页</h2>
          </div>
          <p className={styles.meta}>快扫完成后，这里会展示风险带、证据项和建议动作。</p>
        </div>
        <div className={styles.emptyState}>
          <span>RESULT PENDING</span>
          <p>还没有本地结果。上传图片并开始判断后，会在这里生成证据型报告。</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="result-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Step 03</p>
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
          {result.provenance.aiFootprint.status === "detected" ? (
            <p className={styles.aiNotice}>
              {result.provenance.aiFootprint.model ?? "GenAI"} ·{" "}
              {result.provenance.aiFootprint.signals[0]}
            </p>
          ) : null}
          <p className={styles.disclaimer}>{result.disclaimer}</p>

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onExportReport}
              disabled={isExportingReport}
            >
              {isExportingReport ? "生成中…" : "生成图片报告"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onAnalyzeImage}
              disabled={isAnalyzingImage}
            >
              {isAnalyzingImage ? "分析中…" : "AI 分析图片"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onOpenAppeal}
            >
              提交申诉
            </button>
          </div>
          <p className={styles.aiUploadNote}>
            AI 分析会上传原图到外部服务；本地判断和图片报告仍不上传原图。
          </p>

          {reportExportError ? (
            <p className={styles.errorText} role="alert">
              {reportExportError}
            </p>
          ) : null}
          {aiImageAnalysisError ? (
            <p className={styles.errorText} role="alert">
              {aiImageAnalysisError}
            </p>
          ) : null}
        </div>
      </div>

      {aiImageAnalysis ? (
        <div className={styles.aiAnalysisPanel}>
          <div className={styles.aiAnalysisHeader}>
            <div>
              <h3>AI 图片分析</h3>
              <p>视觉模型输出，仅作为可疑点提示。</p>
            </div>
            <div className={styles.aiAnalysisScore}>
              <span
                className={[
                  styles.riskPill,
                  styles[`risk-${aiImageAnalysis.riskBand}`],
                ].join(" ")}
              >
                {riskLabels[aiImageAnalysis.riskBand]}
              </span>
              <strong>{aiImageAnalysis.aiRiskScore} / 100</strong>
            </div>
          </div>

          <p className={styles.summaryText}>{aiImageAnalysis.summary}</p>

          <div className={styles.aiAnalysisGrid}>
            <div>
              <h4>主要发现</h4>
              <ul className={styles.messageList}>
                {aiImageAnalysis.findings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>建议动作</h4>
              <ul className={styles.messageList}>
                {aiImageAnalysis.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.aiChecks}>
            {aiImageAnalysis.checks.map((check) => (
              <div key={`${check.label}-${check.detail}`}>
                <span className={styles[`check-${check.status}`]}>
                  {checkStatusLabels[check.status] ?? check.status}
                </span>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            ))}
          </div>

          <p className={styles.disclaimer}>
            {aiImageAnalysis.disclaimer} 模型：{aiImageAnalysis.model}
          </p>
        </div>
      ) : null}

      {reportImageUrl ? (
        <div className={styles.reportPreview}>
          <div className={styles.reportPreviewHeader}>
            <div>
              <h3>图片报告</h3>
              <p>已生成 PNG，可直接保存或转发。</p>
            </div>
            <a
              className={styles.reportDownload}
              download={`${result.caseId.toLowerCase()}-report.png`}
              href={reportImageUrl}
            >
              保存图片
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="图片报告预览" src={reportImageUrl} />
        </div>
      ) : null}

      <div className={styles.detailGrid}>
        <article className={styles.infoCard}>
          <h3>内容凭证 / C2PA</h3>
          <p>{result.provenance.summary}</p>
          <FieldList fields={result.provenance.details} />
          {result.provenance.validationMessages.length ? (
            <ul className={styles.messageList}>
              {result.provenance.validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className={styles.infoCard}>
          <h3>AI 元信息线索</h3>
          <p
            className={[
              styles.aiStatus,
              styles[`ai-${result.provenance.aiFootprint.status}`],
            ].join(" ")}
          >
            {aiStatusLabels[result.provenance.aiFootprint.status]}
          </p>
          <FieldList
            fields={[
              {
                label: "Model",
                value: result.provenance.aiFootprint.model ?? "未声明",
              },
              ...result.provenance.aiFootprint.signals.map((signal, index) => ({
                label: `Signal ${index + 1}`,
                value: signal,
              })),
            ]}
          />
        </article>
      </div>

      <div className={styles.detailGrid}>
        <article className={styles.infoCard}>
          <h3>文件信息</h3>
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

        <article className={styles.infoCard}>
          <h3>C2PA Actions</h3>
          <ActionList actions={result.provenance.actions} />
        </article>
      </div>

      <div className={styles.metadataSection}>
        <h3>更多元数据</h3>
        {result.provenance.claimGeneratorInfo.length ? (
          <details className={styles.metadataGroup} open>
            <summary>Claim Generator</summary>
            <FieldList fields={result.provenance.claimGeneratorInfo} />
          </details>
        ) : null}
        {result.provenance.signature.length ? (
          <details className={styles.metadataGroup}>
            <summary>Signature</summary>
            <FieldList fields={result.provenance.signature} />
          </details>
        ) : null}
        {result.provenance.assertions.length ? (
          <details className={styles.metadataGroup}>
            <summary>C2PA Assertions</summary>
            <FieldList fields={result.provenance.assertions} />
          </details>
        ) : null}
        {result.metadata.groups.map((group, index) => (
          <details
            className={styles.metadataGroup}
            key={group.title}
            open={index < 2}
          >
            <summary>{group.title}</summary>
            <FieldList fields={group.fields} />
          </details>
        ))}
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
