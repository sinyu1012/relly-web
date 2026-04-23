"use client";

import { useEffect, useMemo, useState } from "react";

import { publicConfig } from "@/lib/config";
import { submitAppealDraft } from "@/lib/appeal";
import { resolveRemoteImage, validateImageFile } from "@/lib/scan/file";
import {
  createIdleProgress,
  runQuickScan as defaultRunQuickScan,
} from "@/lib/scan/runQuickScan";
import type { AppealDraft, ConsentState, QuickScanResult } from "@/lib/types";

import { AppealDrawer } from "./AppealDrawer";
import { ConsentPanel } from "./ConsentPanel";
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
};

const defaultConsent: ConsentState = {
  allowReverseSearch: false,
  allowRetention: false,
  forensicMode: false,
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
}: Props) {
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [scanError, setScanError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(createIdleProgress());
  const [consent, setConsent] = useState<ConsentState>(defaultConsent);
  const [result, setResult] = useState<QuickScanResult | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealNote, setAppealNote] = useState("");
  const [appealSourceUrl, setAppealSourceUrl] = useState("");
  const [appealMessage, setAppealMessage] = useState("");
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  useEffect(() => {
    return () => {
      if (selectedAsset) {
        URL.revokeObjectURL(selectedAsset.previewUrl);
      }
    };
  }, [selectedAsset]);

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
          setAppealMessage("");
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
      setAppealNote("");
      setAppealSourceUrl("");
      setAppealOpen(false);
      setAppealMessage("");
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
    setAppealNote("");
    setAppealSourceUrl("");
    setAppealOpen(false);
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

  const reportPayload = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      exportedAt: new Date().toISOString(),
      consent,
      result: {
        ...result,
        previewUrl: undefined,
      },
    };
  }, [consent, result]);

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
          <h1>上传一张图片，先在浏览器里做证据型快扫。</h1>
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
        <div className={styles.primaryColumn}>
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

          <ConsentPanel value={consent} onChange={setConsent} />

          <div className={styles.scanActionCard}>
            <div>
              <p className={styles.scanActionEyebrow}>Step 03</p>
              <h2>开始本地快扫</h2>
              <p>不会上传图片；你开启的同意项在 v1 仅用于记录意图。</p>
            </div>
            <button
              type="button"
              className={styles.scanButton}
              onClick={() => {
                void handleStartScan();
              }}
              disabled={!selectedAsset || isScanning}
            >
              {isScanning ? "快扫中…" : "开始本地快扫"}
            </button>
          </div>

          <ResultPanel
            result={result}
            onExportReport={() => {
              if (reportPayload && result) {
                downloadJson(`${result.caseId.toLowerCase()}-report.json`, reportPayload);
              }
            }}
            onOpenAppeal={() => {
              setAppealOpen(true);
              setAppealMessage("");
            }}
          />
        </div>

        <div className={styles.sidebarColumn}>
          <ScanStatus
            progress={progress}
            isScanning={isScanning}
            scanError={scanError}
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
