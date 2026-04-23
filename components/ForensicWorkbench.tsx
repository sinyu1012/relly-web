"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeImageWithAi as defaultAnalyzeImage } from "@/lib/aiDetection";
import { publicConfig } from "@/lib/config";
import { submitAppealDraft } from "@/lib/appeal";
import { createReportImageBlob } from "@/lib/reportImage";
import { validateImageFile } from "@/lib/scan/file";
import {
  createIdleProgress,
  runQuickScan as defaultRunQuickScan,
} from "@/lib/scan/runQuickScan";
import type { AiImageAnalysisResult, AppealDraft, QuickScanResult } from "@/lib/types";

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
  analyzeImage?: typeof defaultAnalyzeImage;
};

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
  analyzeImage = defaultAnalyzeImage,
}: Props) {
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
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
  const [aiImageAnalysis, setAiImageAnalysis] = useState<AiImageAnalysisResult | null>(null);
  const [aiImageAnalysisError, setAiImageAnalysisError] = useState("");
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

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
          setAiImageAnalysis(null);
          setAiImageAnalysisError("");
          return;
        } catch (error) {
          setUploadError(
            error instanceof Error ? error.message : "读取剪贴板图片失败。",
          );
          return;
        }
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
      setAiImageAnalysis(null);
      setAiImageAnalysisError("");
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
    setAiImageAnalysis(null);
    setAiImageAnalysisError("");
    setProgress(createIdleProgress());
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
    setAiImageAnalysis(null);
    setAiImageAnalysisError("");

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

  const handleAnalyzeImage = async () => {
    if (!selectedAsset || !result) {
      setAiImageAnalysisError("请先完成本地判断，再上传给 AI 分析。");
      return;
    }

    setIsAnalyzingImage(true);
    setAiImageAnalysisError("");

    try {
      const analysis = await analyzeImage({
        file: selectedAsset.file,
        result,
      });
      setAiImageAnalysis(analysis);
    } catch (error) {
      setAiImageAnalysisError(
        error instanceof Error ? error.message : "AI 图片分析失败，请稍后重试。",
      );
    } finally {
      setIsAnalyzingImage(false);
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
            uploadError={uploadError}
            onFileSelected={handleFileSelected}
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
            aiImageAnalysis={aiImageAnalysis}
            aiImageAnalysisError={aiImageAnalysisError}
            isAnalyzingImage={isAnalyzingImage}
            onExportReport={() => {
              void handleExportReportImage();
            }}
            onAnalyzeImage={() => {
              void handleAnalyzeImage();
            }}
            onOpenAppeal={() => {
              setAppealOpen(true);
              setAppealMessage("");
            }}
          />
        </div>
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
