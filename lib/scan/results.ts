import { RISK_DISCLAIMER } from "@/lib/scan/constants";
import type {
  EvidenceSignal,
  FileFingerprint,
  MetadataSummary,
  ProvenanceSummary,
  QuickScanResult,
  RiskBand,
} from "@/lib/types";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function riskBandFromScore(score: number): RiskBand {
  if (score >= 75) {
    return "high";
  }

  if (score >= 50) {
    return "elevated";
  }

  if (score >= 25) {
    return "uncertain";
  }

  return "low";
}

export function detectEditingSoftware(software: string | null): boolean {
  if (!software) {
    return false;
  }

  return /photoshop|lightroom|snapseed|gimp|canva|midjourney|stable diffusion|firefly|comfyui|pixlr|capture one/i.test(
    software,
  );
}

function buildSignals(
  metadata: MetadataSummary,
  provenance: ProvenanceSummary,
  fileFingerprint: FileFingerprint,
  fingerprintFailed: boolean,
): EvidenceSignal[] {
  const editingSoftware = detectEditingSoftware(metadata.software);

  const metadataStatus: EvidenceSignal["status"] = editingSoftware
    ? "warn"
    : metadata.hasExif || metadata.hasXmp
      ? "pass"
      : "info";
  const provenanceStatusMap: Record<
    ProvenanceSummary["status"],
    EvidenceSignal["status"]
  > = {
    trusted: "pass",
    valid: "pass",
    missing: "info",
    invalid: "risk",
    error: "warn",
  };

  return [
    {
      id: "input",
      category: "input",
      status: "pass",
      weight: 4,
      title: "文件输入",
      detail: `本地读取成功，格式为 ${metadata.format}。`,
      source: "browser",
    },
    {
      id: "metadata",
      category: "metadata",
      status: metadataStatus,
      weight: 18,
      title: "元数据",
      detail: metadata.note,
      source: "exifr",
    },
    {
      id: "provenance",
      category: "provenance",
      status: provenanceStatusMap[provenance.status],
      weight: 40,
      title: "Content Credentials",
      detail: provenance.summary,
      source: "@contentauth/c2pa-web",
    },
    {
      id: "hash",
      category: "hash",
      status: "info",
      weight: 12,
      title: "SHA-256 指纹",
      detail: `${fileFingerprint.sha256.slice(0, 16)}…`,
      source: "Web Crypto",
    },
    {
      id: "fingerprint",
      category: "fingerprint",
      status: fingerprintFailed ? "warn" : "pass",
      weight: 8,
      title: "基础图像指纹",
      detail: fingerprintFailed
        ? "感知哈希未生成成功，结果已降级为其他本地证据。"
        : `${fileFingerprint.perceptualHash?.slice(0, 16)}…`,
      source: "Canvas",
    },
  ];
}

function buildRiskScore(
  metadata: MetadataSummary,
  provenance: ProvenanceSummary,
  fingerprintFailed: boolean,
): number {
  let score = 28;

  switch (provenance.status) {
    case "trusted":
      score -= 20;
      break;
    case "valid":
      score -= 12;
      break;
    case "invalid":
      score += 35;
      break;
    case "error":
      score += 12;
      break;
    case "missing":
      score += 4;
      break;
  }

  if (detectEditingSoftware(metadata.software)) {
    score += 18;
  }

  if (!metadata.hasExif && !metadata.hasXmp) {
    score += 8;
  }

  if (metadata.camera && metadata.hasExif) {
    score -= 6;
  }

  if (fingerprintFailed) {
    score += 6;
  }

  return clampScore(score);
}

function buildSummary(
  band: RiskBand,
  provenance: ProvenanceSummary,
  metadata: MetadataSummary,
): string {
  if (band === "low") {
    return provenance.status === "trusted" || provenance.status === "valid"
      ? "已检测到可验证来源线索，且当前未发现足够证据表明图像存在明显异常。"
      : "当前未发现足够证据表明图像存在明显异常，但仍建议结合原始上下文核对。";
  }

  if (band === "uncertain") {
    return metadata.hasExif || metadata.hasXmp
      ? "当前证据有限，建议补充原始文件、来源链接或更多上下文再判断。"
      : "当前可用证据较少，建议补充原始文件或继续做外部深度分析。";
  }

  if (band === "elevated") {
    return "检测到多项需要核对的异常或缺失信号，建议先核对来源链路，再决定是否公开传播。";
  }

  return "检测到较强异常或校验失败信号，建议立即核对来源链路，并保留原始文件作进一步分析。";
}

function buildNextActions(band: RiskBand, provenance: ProvenanceSummary): string[] {
  const actions = ["下载本地报告并保留 case ID。"];

  if (provenance.status === "missing") {
    actions.push("如果你拥有原始文件，请优先补充带完整元数据的版本。");
  }

  if (band === "low") {
    actions.push("如需公开引用，建议同时保留原始来源链接。");
    return actions;
  }

  if (band === "uncertain") {
    actions.push("补充拍摄上下文、平台来源或更早版本截图。");
    actions.push("必要时再开启外部深度分析，而不是直接下结论。");
    return actions;
  }

  actions.push("在发布或转发前先核对来源链路。");
  actions.push("通过申诉入口补充原始文件、时间线和来源说明。");
  return actions;
}

export function buildQuickScanResult(input: {
  fileName: string;
  previewUrl: string;
  metadata: MetadataSummary;
  provenance: ProvenanceSummary;
  fileFingerprint: FileFingerprint;
  fingerprintFailed: boolean;
}): QuickScanResult {
  const riskScore = buildRiskScore(
    input.metadata,
    input.provenance,
    input.fingerprintFailed,
  );
  const riskBand = riskBandFromScore(riskScore);
  const signals = buildSignals(
    input.metadata,
    input.provenance,
    input.fileFingerprint,
    input.fingerprintFailed,
  );
  const caseId = `CASE-${input.fileFingerprint.sha256.slice(0, 12).toUpperCase()}`;

  return {
    caseId,
    fileName: input.fileName,
    previewUrl: input.previewUrl,
    fileFingerprint: input.fileFingerprint,
    riskScore,
    riskBand,
    summary: buildSummary(riskBand, input.provenance, input.metadata),
    signals,
    provenance: input.provenance,
    metadata: input.metadata,
    nextActions: buildNextActions(riskBand, input.provenance),
    disclaimer: RISK_DISCLAIMER,
  };
}

