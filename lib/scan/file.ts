import { MAX_FILE_SIZE_BYTES, SUPPORTED_MIME_TYPES } from "@/lib/config";
import type { RemoteImageResolveError } from "@/lib/types";

const supportedMimeTypeSet = new Set<string>(SUPPORTED_MIME_TYPES);

function buildFileError(
  message: string,
  code: RemoteImageResolveError["code"],
): RemoteImageResolveError {
  const error = new Error(message) as RemoteImageResolveError;
  error.code = code;
  return error;
}

function inferFileName(url: string, mimeType: string): string {
  try {
    const parsed = new URL(url);
    const rawName = parsed.pathname.split("/").pop();
    if (rawName && rawName.includes(".")) {
      return decodeURIComponent(rawName);
    }
  } catch {
    // noop
  }

  const extensionMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return `remote-image.${extensionMap[mimeType] ?? "bin"}`;
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImageFile(file: File): void {
  if (!supportedMimeTypeSet.has(file.type)) {
    throw buildFileError(
      "目前仅支持 JPEG、PNG、WebP 图片。",
      "unsupported_type",
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw buildFileError(
      `文件过大，请控制在 ${formatFileSize(MAX_FILE_SIZE_BYTES)} 以内。`,
      "file_too_large",
    );
  }
}

export async function resolveRemoteImage(url: string): Promise<File> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw buildFileError(
        "远程图片读取失败，请确认链接可直接访问。",
        "remote_fetch_failed",
      );
    }

    const blob = await response.blob();
    const mimeType = blob.type || "application/octet-stream";
    const file = new File([blob], inferFileName(url, mimeType), {
      type: mimeType,
      lastModified: Date.now(),
    });

    validateImageFile(file);
    return file;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      throw error;
    }

    throw buildFileError(
      "目标站点不允许跨域读取，请先下载图片再上传本地文件。",
      "remote_fetch_blocked",
    );
  }
}

