import type { AiImageAnalysisResult, QuickScanResult } from "@/lib/types";

export type AiImageAnalysisInput = {
  file: File;
  result: QuickScanResult;
};

function buildImageContext(result: QuickScanResult) {
  return {
    caseId: result.caseId,
    localRiskScore: result.riskScore,
    localRiskBand: result.riskBand,
    localSummary: result.summary,
    file: {
      name: result.fileName,
      format: result.metadata.format,
      dimensions: result.metadata.dimensions,
      hasExif: result.metadata.hasExif,
      hasXmp: result.metadata.hasXmp,
      camera: result.metadata.camera,
      software: result.metadata.software,
    },
    aiFootprint: {
      status: result.provenance.aiFootprint.status,
      model: result.provenance.aiFootprint.model,
      signals: result.provenance.aiFootprint.signals.slice(0, 4),
    },
    evidenceSignals: result.signals.slice(0, 8).map((signal) => ({
      title: signal.title,
      status: signal.status,
      detail: signal.detail,
      source: signal.source,
    })),
  };
}

export async function analyzeImageWithAi({
  file,
  result,
}: AiImageAnalysisInput): Promise<AiImageAnalysisResult> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("imageContext", JSON.stringify(buildImageContext(result)));

  const response = await fetch("/api/ai-detect", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let detail = "AI 图片分析失败，请稍后重试。";

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
      // noop
    }

    throw new Error(detail);
  }

  return (await response.json()) as AiImageAnalysisResult;
}
