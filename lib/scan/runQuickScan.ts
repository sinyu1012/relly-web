import { STAGE_DEFINITIONS } from "@/lib/scan/constants";
import { verifyProvenance } from "@/lib/scan/c2pa";
import { validateImageFile } from "@/lib/scan/file";
import { createPerceptualHash } from "@/lib/scan/fingerprint";
import { sha256File } from "@/lib/scan/hash";
import { buildFallbackMetadata, extractMetadata } from "@/lib/scan/metadata";
import { buildQuickScanResult } from "@/lib/scan/results";
import type { QuickScanProgress, QuickScanResult, ScanStage } from "@/lib/types";

function buildStages(
  activeStageId: string,
  failedStageId?: string,
): QuickScanProgress {
  const stages: ScanStage[] = STAGE_DEFINITIONS.map((stage) => {
    const isBeforeActive =
      STAGE_DEFINITIONS.findIndex((item) => item.id === stage.id) <
      STAGE_DEFINITIONS.findIndex((item) => item.id === activeStageId);

    if (failedStageId === stage.id) {
      return { ...stage, state: "error" };
    }

    if (stage.id === activeStageId) {
      return { ...stage, state: "active" };
    }

    if (isBeforeActive) {
      return { ...stage, state: "done" };
    }

    return { ...stage, state: "pending" };
  });

  return {
    currentStageId: activeStageId,
    stages,
  };
}

export function createIdleProgress(): QuickScanProgress {
  return {
    currentStageId: STAGE_DEFINITIONS[0].id,
    stages: STAGE_DEFINITIONS.map((stage) => ({ ...stage, state: "pending" })),
  };
}

export async function runQuickScan(input: {
  file: File;
  previewUrl: string;
  onProgress?: (progress: QuickScanProgress) => void;
}): Promise<QuickScanResult> {
  const { file, previewUrl, onProgress } = input;

  onProgress?.(buildStages("normalize"));
  validateImageFile(file);

  onProgress?.(buildStages("metadata"));
  const metadata = await extractMetadata(file).catch((error) =>
    buildFallbackMetadata(
      file,
      error instanceof Error
        ? `元数据读取失败：${error.message}`
        : "元数据读取失败，已自动降级为基础文件信息。",
    ),
  );

  onProgress?.(buildStages("provenance"));
  const provenance = await verifyProvenance(file);

  onProgress?.(buildStages("hash"));
  const sha256 = await sha256File(file);

  onProgress?.(buildStages("fingerprint"));
  let perceptualHash: string | null = null;
  let fingerprintFailed = false;

  try {
    perceptualHash = await createPerceptualHash(file);
  } catch {
    fingerprintFailed = true;
  }

  onProgress?.(buildStages("result"));

  const result = buildQuickScanResult({
    fileName: file.name,
    previewUrl,
    metadata,
    provenance,
    fileFingerprint: {
      sha256,
      perceptualHash,
    },
    fingerprintFailed,
  });

  onProgress?.({
    currentStageId: "result",
    stages: STAGE_DEFINITIONS.map((stage) => ({ ...stage, state: "done" })),
  });

  return result;
}
