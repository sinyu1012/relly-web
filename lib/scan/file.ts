import { MAX_FILE_SIZE_BYTES, SUPPORTED_MIME_TYPES } from "@/lib/config";

const supportedMimeTypeSet = new Set<string>(SUPPORTED_MIME_TYPES);

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImageFile(file: File): void {
  if (!supportedMimeTypeSet.has(file.type)) {
    throw new Error("目前仅支持 JPEG、PNG、WebP 图片。");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`文件过大，请控制在 ${formatFileSize(MAX_FILE_SIZE_BYTES)} 以内。`);
  }
}
