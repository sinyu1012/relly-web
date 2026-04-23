import type { ClaimAnalysisResult, QuickScanResult } from "@/lib/types";

export type ClaimAnalysisInput = {
  claimText: string;
  result: QuickScanResult | null;
};

function buildImageContext(result: QuickScanResult | null) {
  if (!result) {
    return null;
  }

  return {
    caseId: result.caseId,
    imageRiskScore: result.riskScore,
    imageRiskBand: result.riskBand,
    imageSummary: result.summary,
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

export async function analyzeClaimWithAi({
  claimText,
  result,
}: ClaimAnalysisInput): Promise<ClaimAnalysisResult> {
  const response = await fetch("/api/ai-detect", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      claimText,
      imageContext: buildImageContext(result),
    }),
  });

  if (!response.ok) {
    let detail = "AI 辅助核查失败，请稍后重试。";

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

  return (await response.json()) as ClaimAnalysisResult;
}
