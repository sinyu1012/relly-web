export type RiskBand = "low" | "uncertain" | "elevated" | "high";

export type EvidenceCategory =
  | "input"
  | "metadata"
  | "provenance"
  | "hash"
  | "fingerprint";

export type EvidenceStatus = "pass" | "info" | "warn" | "risk" | "error";

export type ScanStageState = "pending" | "active" | "done" | "error";

export interface ConsentState {
  allowReverseSearch: boolean;
  allowRetention: boolean;
  forensicMode: boolean;
}

export interface EvidenceSignal {
  id: string;
  category: EvidenceCategory;
  status: EvidenceStatus;
  weight: number;
  title: string;
  detail: string;
  source: string;
}

export interface FileFingerprint {
  sha256: string;
  perceptualHash: string | null;
}

export interface RedactedGps {
  present: boolean;
  redacted: boolean;
}

export interface MetadataSummary {
  format: string;
  mimeType: string;
  sizeBytes: number;
  dimensions: {
    width: number;
    height: number;
  } | null;
  camera: string | null;
  software: string | null;
  createdAt: string | null;
  hasExif: boolean;
  hasXmp: boolean;
  gps: RedactedGps;
  note: string;
}

export type ProvenanceStatus =
  | "missing"
  | "valid"
  | "trusted"
  | "invalid"
  | "error";

export interface ProvenanceSummary {
  status: ProvenanceStatus;
  summary: string;
  validationState: string | null;
  activeManifest: string | null;
  generator: string | null;
  title: string | null;
  validationMessages: string[];
}

export interface QuickScanResult {
  caseId: string;
  fileName: string;
  previewUrl: string;
  fileFingerprint: FileFingerprint;
  riskScore: number;
  riskBand: RiskBand;
  summary: string;
  signals: EvidenceSignal[];
  provenance: ProvenanceSummary;
  metadata: MetadataSummary;
  nextActions: string[];
  disclaimer: string;
}

export interface AppealDraft {
  caseId: string;
  note: string;
  sourceUrl: string;
  attachmentNames: string[];
  createdAt: string;
}

export interface ScanStage {
  id: string;
  label: string;
  description: string;
  progress: number;
  state: ScanStageState;
}

export interface QuickScanProgress {
  currentStageId: string;
  stages: ScanStage[];
}

export interface RemoteImageResolveError extends Error {
  code:
    | "unsupported_type"
    | "file_too_large"
    | "remote_fetch_failed"
    | "remote_fetch_blocked";
}

