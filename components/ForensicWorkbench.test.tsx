import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForensicWorkbench } from "@/components/ForensicWorkbench";
import type { QuickScanResult } from "@/lib/types";

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

describe("ForensicWorkbench", () => {
  it("shows a friendly URL fallback message when remote fetching is blocked", async () => {
    const user = userEvent.setup();
    const resolveRemoteAsset = vi.fn().mockRejectedValue(
      new Error("目标站点不允许跨域读取，请先下载图片再上传本地文件。"),
    );

    render(<ForensicWorkbench resolveRemoteAsset={resolveRemoteAsset} />);

    await user.type(
      screen.getByPlaceholderText("https://example.com/image.jpg"),
      "https://example.com/test.jpg",
    );
    await user.click(screen.getByRole("button", { name: "读取 URL" }));

    expect(resolveRemoteAsset).toHaveBeenCalled();
    expect(
      await screen.findByText("目标站点不允许跨域读取，请先下载图片再上传本地文件。"),
    ).toBeInTheDocument();
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
});
