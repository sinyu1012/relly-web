"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeClaimWithAi as defaultAnalyzeClaim } from "@/lib/aiDetection";
import { publicConfig } from "@/lib/config";
import { submitAppealDraft } from "@/lib/appeal";
import { createReportImageBlob } from "@/lib/reportImage";
import { resolveRemoteImage, validateImageFile } from "@/lib/scan/file";
import {
  createIdleProgress,
  runQuickScan as defaultRunQuickScan,
} from "@/lib/scan/runQuickScan";
import type { AppealDraft, ClaimAnalysisResult, QuickScanResult } from "@/lib/types";

import { AppealDrawer } from "./AppealDrawer";
import styles from "./ForensicWorkbench.module.css";
import { ResultPanel } from "./ResultPanel";
import { ScanStatus } from "./ScanStatus";
import { UploadPanel } from "./UploadPanel";

type SelectedAsset = {
  file: File;
  previewUrl: string;
};

type Props = {
  runQuickScan?: typeof defaultRunQuickScan;
  resolveRemoteAsset?: typeof resolveRemoteImage;
  analyzeClaim?: typeof defaultAnalyzeClaim;
};

const riskLabels: Record<ClaimAnalysisResult["riskBand"], string> = {
  low: "低风险",
  uncertain: "不确定",
  elevated: "偏高风险",
  high: "高风险",
};

const checkStatusLabels: Record<string, string> = {
  pass: "通过",
  info: "提示",
  warn: "注意",
  risk: "风险",
  error: "错误",
};

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, blobUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
}

function buildFallbackHref(draft: AppealDraft): { href: string; label: string } {
  if (publicConfig.appealMailto) {
    const subject = encodeURIComponent(`图片申诉 ${draft.caseId}`);
    const body = encodeURIComponent(
      `Case ID: ${draft.caseId}\n来源链接: ${draft.sourceUrl || "未填写"}\n附件: ${
        draft.attachmentNames.join(", ") || "无"
      }\n\n补充说明:\n${draft.note || "未填写"}`,
    );
    return {
      href: `mailto:${publicConfig.appealMailto}?subject=${subject}&body=${body}`,
      label: "通过邮件补充",
    };
  }

  if (publicConfig.appealFallbackUrl) {
    return {
      href: publicConfig.appealFallbackUrl,
      label: "打开外部工单",
    };
  }

  return {
    href: "",
    label: "",
  };
}

export function ForensicWorkbench({
  runQuickScan = defaultRunQuickScan,
  resolveRemoteAsset = resolveRemoteImage,
  analyzeClaim = defaultAnalyzeClaim,
}: Props) {
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [scanError, setScanError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(createIdleProgress());
  const [result, setResult] = useState<QuickScanResult | null>(null);
  const [reportImageUrl, setReportImageUrl] = useState("");
  const [reportExportError, setReportExportError] = useState("");
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealNote, setAppealNote] = useState("");
  const [appealSourceUrl, setAppealSourceUrl] = useState("");
  const [appealMessage, setAppealMessage] = useState("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [claimAnalysis, setClaimAnalysis] = useState<ClaimAnalysisResult | null>(null);
  const [claimAnalysisError, setClaimAnalysisError] = useState("");
  const [isAnalyzingClaim, setIsAnalyzingClaim] = useState(false);

  useEffect(() => {
    return () => {
      if (selectedAsset) {
        URL.revokeObjectURL(selectedAsset.previewUrl);
      }
    };
  }, [selectedAsset]);

  useEffect(() => {
    return () => {
      if (reportImageUrl) {
        URL.revokeObjectURL(reportImageUrl);
      }
    };
  }, [reportImageUrl]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const clipboardItems = Array.from(event.clipboardData?.items ?? []);
      const imageFile = clipboardItems
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();

      if (imageFile) {
        event.preventDefault();
        try {
          validateImageFile(imageFile);
          const previewUrl = URL.createObjectURL(imageFile);
          setSelectedAsset((current) => {
            if (current) {
              URL.revokeObjectURL(current.previewUrl);
            }

            return {
              file: imageFile,
              previewUrl,
            };
          });
          setUploadError("");
          setScanError("");
          setResult(null);
          setReportImageUrl("");
          setReportExportError("");
          setAppealMessage("");
          setClaimAnalysis(null);
          setClaimAnalysisError("");
          return;
        } catch (error) {
          setUploadError(
            error instanceof Error ? error.message : "读取剪贴板图片失败。",
          );
          return;
        }
      }

      const pastedText = event.clipboardData?.getData("text/plain")?.trim();
      if (pastedText && isLikelyUrl(pastedText)) {
        setRemoteUrl(pastedText);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleFileSelected = (file: File) => {
    try {
      validateImageFile(file);
      const previewUrl = URL.createObjectURL(file);

      setSelectedAsset((current) => {
        if (current) {
          URL.revokeObjectURL(current.previewUrl);
        }

        return {
          file,
          previewUrl,
        };
      });
      setUploadError("");
      setScanError("");
      setResult(null);
      setReportImageUrl("");
      setReportExportError("");
      setAppealNote("");
      setAppealSourceUrl("");
      setAppealOpen(false);
      setAppealMessage("");
      setClaimAnalysis(null);
      setClaimAnalysisError("");
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "当前文件无法读取。",
      );
    }
  };

  const handleClearSelection = () => {
    setSelectedAsset((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    setUploadError("");
    setScanError("");
    setResult(null);
    setReportImageUrl("");
    setReportExportError("");
    setAppealNote("");
    setAppealSourceUrl("");
    setAppealOpen(false);
    setClaimAnalysis(null);
    setClaimAnalysisError("");
    setProgress(createIdleProgress());
  };

  const handleResolveRemoteUrl = async () => {
    setUploadError("");

    if (!remoteUrl.trim()) {
      setUploadError("请先输入公开图片 URL。");
      return;
    }

    try {
      const file = await resolveRemoteAsset(remoteUrl.trim());
      handleFileSelected(file);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "远程图片读取失败。",
      );
    }
  };

  const handleStartScan = async () => {
    if (!selectedAsset) {
      setScanError("请先选择图片。");
      return;
    }

    setIsScanning(true);
    setScanError("");
    setAppealMessage("");
    setReportImageUrl("");
    setReportExportError("");
    setClaimAnalysis(null);
    setClaimAnalysisError("");

    try {
      const nextResult = await runQuickScan({
        file: selectedAsset.file,
        previewUrl: selectedAsset.previewUrl,
        onProgress: setProgress,
      });
      setResult(nextResult);
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : "本地快扫失败，请重试。",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleAnalyzeClaim = async () => {
    const normalizedClaimText = claimText.trim();

    if (!normalizedClaimText) {
      setClaimAnalysisError("请先输入需要核查的配文或消息。");
      return;
    }

    setIsAnalyzingClaim(true);
    setClaimAnalysisError("");

    try {
      const analysis = await analyzeClaim({
        claimText: normalizedClaimText,
        result,
      });
      setClaimAnalysis(analysis);
    } catch (error) {
      setClaimAnalysisError(
        error instanceof Error ? error.message : "AI 辅助核查失败，请稍后重试。",
      );
    } finally {
      setIsAnalyzingClaim(false);
    }
  };

  const handleExportReportImage = async () => {
    if (!result) {
      return;
    }

    setIsExportingReport(true);
    setReportExportError("");

    try {
      const blob = await createReportImageBlob(result);
      const nextReportUrl = URL.createObjectURL(blob);
      setReportImageUrl(nextReportUrl);
      downloadBlob(`${result.caseId.toLowerCase()}-report.png`, nextReportUrl);
    } catch (error) {
      setReportExportError(
        error instanceof Error ? error.message : "图片报告生成失败，请重试。",
      );
    } finally {
      setIsExportingReport(false);
    }
  };

  const appealDraft = useMemo<AppealDraft | null>(() => {
    if (!result) {
      return null;
    }

    return {
      caseId: result.caseId,
      note: appealNote.trim(),
      sourceUrl: appealSourceUrl.trim(),
      attachmentNames: selectedAsset ? [selectedAsset.file.name] : [],
      createdAt: new Date().toISOString(),
    };
  }, [appealNote, appealSourceUrl, result, selectedAsset]);

  const fallback = useMemo(
    () => (appealDraft ? buildFallbackHref(appealDraft) : { href: "", label: "" }),
    [appealDraft],
  );

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>CHINESE-FIRST · MOBILE-FIRST · LOCAL</p>
          <h1>上传图片，判断真伪</h1>
          <p className={styles.heroText}>
            这个版本只整合本地可得证据：EXIF / XMP、Content Credentials、
            SHA-256 和基础图像指纹。结果用于核对来源，不替代人工判断。
          </p>
        </div>
        <div className={styles.heroPanel}>
          <dl>
            <div>
              <dt>默认模式</dt>
              <dd>本地处理</dd>
            </div>
            <div>
              <dt>首版范围</dt>
              <dd>快扫 / 导出 / 申诉</dd>
            </div>
            <div>
              <dt>不做</dt>
              <dd>绝对真假裁决</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className={styles.grid}>
        <div className={styles.uploadSlot}>
          <UploadPanel
            selectedFileName={selectedAsset?.file.name ?? null}
            selectedFileSize={selectedAsset?.file.size ?? null}
            previewUrl={selectedAsset?.previewUrl ?? null}
            remoteUrl={remoteUrl}
            uploadError={uploadError}
            onRemoteUrlChange={setRemoteUrl}
            onFileSelected={handleFileSelected}
            onResolveRemoteUrl={handleResolveRemoteUrl}
            onClearSelection={handleClearSelection}
          />
        </div>

        <div className={styles.scanActionCard}>
          <div>
            <p className={styles.scanActionEyebrow}>Step 02</p>
            <h2>开始判断</h2>
            <p>不会上传图片；直接在浏览器里完成本地判断。</p>
          </div>
          <button
            type="button"
            className={styles.scanButton}
            onClick={() => {
              void handleStartScan();
            }}
            disabled={!selectedAsset || isScanning}
          >
            {isScanning ? "判断中…" : "开始判断"}
          </button>
        </div>

        <div className={styles.scanStatusSlot}>
          <ScanStatus
            progress={progress}
            isScanning={isScanning}
            scanError={scanError}
          />
        </div>

        <div className={styles.resultSlot}>
          <ResultPanel
            result={result}
            reportImageUrl={reportImageUrl}
            reportExportError={reportExportError}
            isExportingReport={isExportingReport}
            onExportReport={() => {
              void handleExportReportImage();
            }}
            onOpenAppeal={() => {
              setAppealOpen(true);
              setAppealMessage("");
            }}
          />
        </div>

        <section className={styles.claimSlot} aria-labelledby="claim-heading">
          <div className={styles.claimHeader}>
            <div>
              <p className={styles.scanActionEyebrow}>Step 04</p>
              <h2 id="claim-heading">AI 辅助核查配文</h2>
            </div>
            <span className={styles.claimMode}>服务端代理</span>
          </div>

          <p className={styles.claimIntro}>
            粘贴转发语、标题或聊天截图文字。只发送这段文字和本地结果摘要，不上传原图。
          </p>

          <textarea
            className={styles.claimTextarea}
            maxLength={4000}
            value={claimText}
            onChange={(event) => {
              setClaimText(event.target.value);
              setClaimAnalysisError("");
            }}
            placeholder="例如：这张图说某地今晚发生 9.8 级地震，官方不让说。"
          />

          <div className={styles.claimActions}>
            <button
              type="button"
              className={styles.claimButton}
              disabled={!claimText.trim() || isAnalyzingClaim}
              onClick={() => {
                void handleAnalyzeClaim();
              }}
            >
              {isAnalyzingClaim ? "核查中…" : "AI 辅助核查"}
            </button>
            <span>{claimText.length} / 4000</span>
          </div>

          {claimAnalysisError ? (
            <p className={styles.claimError} role="alert">
              {claimAnalysisError}
            </p>
          ) : null}

          {claimAnalysis ? (
            <div className={styles.claimResult}>
              <div className={styles.claimResultTopline}>
                <span
                  className={[
                    styles.claimRiskPill,
                    styles[`claimRisk-${claimAnalysis.riskBand}`],
                  ].join(" ")}
                >
                  {riskLabels[claimAnalysis.riskBand]}
                </span>
                <strong>{claimAnalysis.claimRiskScore} / 100</strong>
              </div>
              <p className={styles.claimSummary}>{claimAnalysis.summary}</p>

              <div className={styles.claimResultGrid}>
                <div>
                  <h3>主要发现</h3>
                  <ul className={styles.claimList}>
                    {claimAnalysis.findings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>核查建议</h3>
                  <ul className={styles.claimList}>
                    {claimAnalysis.nextActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className={styles.claimChecks}>
                {claimAnalysis.checks.map((check) => (
                  <div key={`${check.label}-${check.detail}`}>
                    <span className={styles[`check-${check.status}`]}>
                      {checkStatusLabels[check.status] ?? check.status}
                    </span>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                ))}
              </div>

              <p className={styles.claimDisclaimer}>
                {claimAnalysis.disclaimer} 模型：{claimAnalysis.model}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <AppealDrawer
        isOpen={appealOpen}
        note={appealNote}
        sourceUrl={appealSourceUrl}
        attachmentNames={appealDraft?.attachmentNames ?? []}
        message={appealMessage}
        isSubmitting={isSubmittingAppeal}
        canSubmitApi={publicConfig.appealApiEnabled}
        fallbackHref={fallback.href}
        fallbackLabel={fallback.label}
        onClose={() => setAppealOpen(false)}
        onNoteChange={setAppealNote}
        onSourceUrlChange={setAppealSourceUrl}
        onDownloadDraft={() => {
          if (appealDraft) {
            downloadJson(`${appealDraft.caseId.toLowerCase()}-appeal.json`, appealDraft);
            setAppealMessage("已下载 case.json，可用于后续人工流转。");
          }
        }}
        onSubmit={async () => {
          if (!appealDraft) {
            return;
          }

          if (!publicConfig.appealApiEnabled) {
            setAppealMessage("当前环境未启用服务端申诉，请下载 case.json 或使用外部入口。");
            return;
          }

          setIsSubmittingAppeal(true);
          try {
            const response = await submitAppealDraft(appealDraft);
            setAppealMessage(`申诉已提交，状态：${response.status}。`);
          } catch (error) {
            setAppealMessage(
              error instanceof Error ? error.message : "申诉提交失败，请稍后重试。",
            );
          } finally {
            setIsSubmittingAppeal(false);
          }
        }}
      />
    </>
  );
}
