import type {
  C2paSdk,
  ManifestStore,
  ValidationStatus,
} from "@contentauth/c2pa-web/inline";

import type { ProvenanceSummary } from "@/lib/types";

let sdkPromise: Promise<C2paSdk> | null = null;

async function getSdk(): Promise<C2paSdk> {
  if (!sdkPromise) {
    sdkPromise = import("@contentauth/c2pa-web/inline").then(({ createC2pa }) =>
      createC2pa(),
    );
  }

  return sdkPromise;
}

function summarizeValidationMessages(
  validationStatus: ValidationStatus[] | null | undefined,
): string[] {
  return (validationStatus ?? [])
    .map((item) => item.explanation || item.code)
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function summarizeManifestStore(store: ManifestStore): ProvenanceSummary {
  const validationState = store.validation_state ?? null;
  const activeManifestLabel = store.active_manifest ?? null;
  const activeManifest =
    activeManifestLabel && store.manifests
      ? store.manifests[activeManifestLabel]
      : null;
  const validationMessages = summarizeValidationMessages(store.validation_status);

  if (validationState === "Trusted") {
    return {
      status: "trusted",
      summary: "检测到可信的 Content Credentials，可用于辅助追溯来源。",
      validationState,
      activeManifest: activeManifestLabel,
      generator:
        activeManifest?.claim_generator_info?.[0]?.name ||
        activeManifest?.claim_generator ||
        null,
      title: activeManifest?.title || null,
      validationMessages,
    };
  }

  if (validationState === "Valid") {
    return {
      status: "valid",
      summary: "检测到可验证的 Content Credentials，但仍需结合上下文判断。",
      validationState,
      activeManifest: activeManifestLabel,
      generator:
        activeManifest?.claim_generator_info?.[0]?.name ||
        activeManifest?.claim_generator ||
        null,
      title: activeManifest?.title || null,
      validationMessages,
    };
  }

  if (validationState === "Invalid") {
    return {
      status: "invalid",
      summary: "检测到 Content Credentials，但校验未通过，应重点核对来源链路。",
      validationState,
      activeManifest: activeManifestLabel,
      generator:
        activeManifest?.claim_generator_info?.[0]?.name ||
        activeManifest?.claim_generator ||
        null,
      title: activeManifest?.title || null,
      validationMessages,
    };
  }

  return {
    status: "missing",
    summary: "未检测到可验证的 Content Credentials。没有凭证不等于图像异常。",
    validationState,
    activeManifest: activeManifestLabel,
    generator:
      activeManifest?.claim_generator_info?.[0]?.name ||
      activeManifest?.claim_generator ||
      null,
    title: activeManifest?.title || null,
    validationMessages,
  };
}

export async function verifyProvenance(file: File): Promise<ProvenanceSummary> {
  try {
    const sdk = await getSdk();
    const reader = await sdk.reader.fromBlob(file.type, file);

    if (!reader) {
      return {
        status: "missing",
        summary:
          "未检测到可验证的 Content Credentials。没有凭证不等于图像异常。",
        validationState: null,
        activeManifest: null,
        generator: null,
        title: null,
        validationMessages: [],
      };
    }

    try {
      const manifestStore = await reader.manifestStore();
      return summarizeManifestStore(manifestStore);
    } finally {
      await reader.free();
    }
  } catch (error) {
    return {
      status: "error",
      summary:
        error instanceof Error
          ? `C2PA 校验未完成：${error.message}`
          : "C2PA 校验未完成，已自动降级到其他本地证据。",
      validationState: null,
      activeManifest: null,
      generator: null,
      title: null,
      validationMessages: [],
    };
  }
}

