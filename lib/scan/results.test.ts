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
};

const baseProvenance: ProvenanceSummary = {
  status: "trusted",
  summary: "检测到可信的 Content Credentials。",
  validationState: "Trusted",
  activeManifest: "manifest",
  generator: "Camera",
  title: "example.jpg",
  validationMessages: [],
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
});
