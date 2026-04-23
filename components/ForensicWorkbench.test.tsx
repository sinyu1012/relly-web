import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForensicWorkbench } from "@/components/ForensicWorkbench";
import type { AiImageAnalysisResult, QuickScanResult } from "@/lib/types";

function buildMockResult(previewUrl: string): QuickScanResult {
  return {
    caseId: "CASE-ABC123456789",
    fileName: "demo.jpg",
    previewUrl,
    riskScore: 36,
    riskBand: "uncertain",
    summary: "当前证据有限，建议补充原始文件或更多上下文再判断。",
    disclaimer: "本结果用于来源核对与风险提示，不构成法律、新闻或平台治理上的最终结论。",
    fileFingerprint: {
      sha256: "a".repeat(64),
      perceptualHash: "f".repeat(16),
    },
    provenance: {
      status: "missing",
      summary: "未检测到可验证的 Content Credentials。没有凭证不等于图像异常。",
      validationState: null,
      activeManifest: null,
      generator: null,
      title: null,
      validationMessages: [],
      details: [{ label: "C2PA Status", value: "无" }],
      claimGeneratorInfo: [],
      signature: [],
      assertions: [],
      actions: [],
      aiFootprint: {
        status: "unknown",
        model: null,
        signals: ["未检测到可展开的 C2PA manifest。"],
      },
    },
    metadata: {
      format: "JPEG",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      dimensions: { width: 1200, height: 800 },
      camera: null,
      software: null,
      createdAt: null,
      hasExif: false,
      hasXmp: false,
      gps: { present: false, redacted: true },
      note: "未读取到足够元数据。",
      fields: [
        { label: "MIME", value: "image/jpeg" },
        { label: "Size", value: "1 KB" },
      ],
      groups: [
        {
          title: "文件信息",
          fields: [{ label: "MIME", value: "image/jpeg" }],
        },
      ],
    },
    signals: [
      {
        id: "provenance",
        category: "provenance",
        status: "info",
        weight: 40,
        title: "Content Credentials",
        detail: "未检测到可验证的 Content Credentials。",
        source: "@contentauth/c2pa-web",
      },
    ],
    nextActions: ["下载本地报告并保留 case ID。"],
  };
}

const mockAiImageAnalysis: AiImageAnalysisResult = {
  aiRiskScore: 82,
  riskBand: "high",
  summary: "AI 视觉分析发现画面存在不自然边缘和文字伪影，建议核对来源。",
  findings: ["画面中文字边缘存在不自然断裂。"],
  checks: [
    {
      label: "文字和边缘",
      status: "risk",
      detail: "局部文字和边缘过渡不自然，可能来自合成或二次编辑。",
    },
  ],
  nextActions: ["核对原始发布源或权威报道。"],
  model: "test-model",
  analyzedAt: "2026-04-23T00:00:00.000Z",
  disclaimer: "AI 图片分析会把原图发送给外部 AI 服务。",
};

describe("ForensicWorkbench", () => {
  it("keeps the upload step focused on local images", () => {
    render(<ForensicWorkbench />);

    expect(screen.getByRole("heading", { name: "上传图片" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "读取 URL" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("https://example.com/image.jpg")).not.toBeInTheDocument();
  });

  it("runs the mocked scan flow and renders the result summary", async () => {
    const runQuickScan = vi.fn().mockImplementation(async ({ previewUrl }) =>
      buildMockResult(previewUrl),
    );

    const { container } = render(<ForensicWorkbench runQuickScan={runQuickScan} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["demo"], "demo.jpg", { type: "image/jpeg" })],
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "开始判断" }));

    await waitFor(() => {
      expect(runQuickScan).toHaveBeenCalled();
    });

    expect(
      await screen.findByText("当前证据有限，建议补充原始文件或更多上下文再判断。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("本结果用于来源核对与风险提示，不构成法律、新闻或平台治理上的最终结论。"),
    ).toBeInTheDocument();
  });

  it("runs AI image analysis through the injected server-proxy helper", async () => {
    const runQuickScan = vi.fn().mockImplementation(async ({ previewUrl }) =>
      buildMockResult(previewUrl),
    );
    const analyzeImage = vi.fn().mockResolvedValue(mockAiImageAnalysis);

    const { container } = render(
      <ForensicWorkbench
        runQuickScan={runQuickScan}
        analyzeImage={analyzeImage}
      />,
    );
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(["demo"], "demo.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [file],
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "开始判断" }));
    await screen.findByText("当前证据有限，建议补充原始文件或更多上下文再判断。");

    await userEvent.click(screen.getByRole("button", { name: "AI 分析图片" }));

    await waitFor(() => {
      expect(analyzeImage).toHaveBeenCalledWith({
        file,
      });
    });

    expect(await screen.findByText("AI 图片分析结果")).toBeInTheDocument();
    expect(await screen.findByText("AI 图片分析详情")).toBeInTheDocument();
    expect(
      await screen.findAllByText("AI 视觉分析发现画面存在不自然边缘和文字伪影，建议核对来源。"),
    ).toHaveLength(2);
    expect(screen.getByText("局部文字和边缘过渡不自然，可能来自合成或二次编辑。")).toBeInTheDocument();
  });
});
