import { describe, expect, it } from "vitest";

import { buildQuickScanResult, detectEditingSoftware, riskBandFromScore } from "@/lib/scan/results";
import type { MetadataSummary, ProvenanceSummary } from "@/lib/types";

const baseMetadata: MetadataSummary = {
  format: "JPEG",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  dimensions: { width: 1200, height: 800 },
  camera: "Canon / EOS",
  software: null,
  createdAt: "2026-04-23T00:00:00.000Z",
  hasExif: true,
  hasXmp: false,
  gps: { present: false, redacted: true },
  note: "检测到设备信息。",
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
};

const baseProvenance: ProvenanceSummary = {
  status: "trusted",
  summary: "检测到可信的 Content Credentials。",
  validationState: "Trusted",
  activeManifest: "manifest",
  generator: "Camera",
  title: "example.jpg",
  validationMessages: [],
  details: [
    { label: "C2PA Status", value: "Trusted" },
    { label: "Claim Generator", value: "Camera" },
  ],
  claimGeneratorInfo: [{ label: "Name", value: "Camera" }],
  signature: [],
  assertions: [],
  actions: [],
  aiFootprint: {
    status: "not_detected",
    model: null,
    signals: ["C2PA 中暂未发现明确 AI 生成来源字段。"],
  },
};

describe("riskBandFromScore", () => {
  it("maps score buckets to the expected bands", () => {
    expect(riskBandFromScore(10)).toBe("low");
    expect(riskBandFromScore(25)).toBe("uncertain");
    expect(riskBandFromScore(55)).toBe("elevated");
    expect(riskBandFromScore(80)).toBe("high");
  });
});

describe("detectEditingSoftware", () => {
  it("recognizes common editing software labels", () => {
    expect(detectEditingSoftware("Adobe Photoshop 2025")).toBe(true);
    expect(detectEditingSoftware("Canon EOS Utility")).toBe(false);
  });
});

describe("buildQuickScanResult", () => {
  it("creates a low-risk result with disclaimer and no absolute truth wording", () => {
    const result = buildQuickScanResult({
      fileName: "evidence.jpg",
      previewUrl: "blob:demo",
      metadata: baseMetadata,
      provenance: baseProvenance,
      fileFingerprint: {
        sha256: "a".repeat(64),
        perceptualHash: "f".repeat(16),
      },
      fingerprintFailed: false,
    });

    expect(result.riskBand).toBe("low");
    expect(result.disclaimer).toContain("不构成法律");
    expect(result.summary).not.toContain("是真的");
    expect(result.summary).not.toContain("是假的");
  });

  it("raises the band when provenance fails and editing software is present", () => {
    const result = buildQuickScanResult({
      fileName: "edited.webp",
      previewUrl: "blob:demo",
      metadata: {
        ...baseMetadata,
        camera: null,
        software: "Adobe Photoshop",
        hasExif: false,
      },
      provenance: {
        ...baseProvenance,
        status: "invalid",
        summary: "校验未通过。",
        validationState: "Invalid",
      },
      fileFingerprint: {
        sha256: "b".repeat(64),
        perceptualHash: null,
      },
      fingerprintFailed: true,
    });

    expect(["elevated", "high"]).toContain(result.riskBand);
    expect(result.signals.find((signal) => signal.id === "provenance")?.status).toBe(
      "risk",
    );
  });

  it("raises risk when C2PA contains AI footprint signals", () => {
    const result = buildQuickScanResult({
      fileName: "genai.png",
      previewUrl: "blob:demo",
      metadata: baseMetadata,
      provenance: {
        ...baseProvenance,
        status: "valid",
        validationState: "Valid",
        generator: "OpenAI Media Service API",
        aiFootprint: {
          status: "detected",
          model: "GPT-4o",
          signals: [
            "Digital Source Type: trainedAlgorithmicMedia",
            "Software Agent: GPT-4o",
          ],
        },
      },
      fileFingerprint: {
        sha256: "c".repeat(64),
        perceptualHash: "f".repeat(16),
      },
      fingerprintFailed: false,
    });

    expect(["elevated", "high"]).toContain(result.riskBand);
    expect(result.summary).toContain("AI");
    expect(result.signals.find((signal) => signal.id === "ai-footprint")?.status).toBe(
      "risk",
    );
  });
});
