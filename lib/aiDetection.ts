import type { AiImageAnalysisResult } from "@/lib/types";

export type AiImageAnalysisInput = {
  file: File;
};

export async function analyzeImageWithAi({
  file,
}: AiImageAnalysisInput): Promise<AiImageAnalysisResult> {
  const formData = new FormData();
  formData.append("image", file);

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
