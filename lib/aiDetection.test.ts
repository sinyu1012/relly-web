import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeImageWithAi } from "@/lib/aiDetection";
import type { AiImageAnalysisResult } from "@/lib/types";

const mockAnalysis: AiImageAnalysisResult = {
  aiRiskScore: 88,
  riskBand: "high",
  summary: "图片中的核心主张与常识高度冲突，建议核对权威来源。",
  findings: ["图片文字声称了高度异常的人事关系。"],
  checks: [
    {
      label: "核心主张",
      status: "risk",
      detail: "人物身份和公司关系存在明显常识冲突。",
    },
  ],
  nextActions: ["查询权威发布源。"],
  model: "test-model",
  analyzedAt: "2026-04-23T00:00:00.000Z",
  disclaimer: "AI 图片分析会把原图发送给外部 AI 服务。",
};

describe("analyzeImageWithAi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads only the image file without local forensic context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockAnalysis), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["demo"], "demo.jpg", { type: "image/jpeg" });

    await analyzeImageWithAi({ file });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai-detect",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get("image")).toBe(file);
    expect(body.has("imageContext")).toBe(false);
  });
});
