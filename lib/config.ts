const truthyValues = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  return value ? truthyValues.has(value.toLowerCase()) : false;
}

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "是真的吗";

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;

export const publicConfig = {
  appName: APP_NAME,
  appealApiEnabled: isTruthy(process.env.NEXT_PUBLIC_APPEAL_API_ENABLED),
  appealFallbackUrl:
    process.env.NEXT_PUBLIC_APPEAL_FALLBACK_URL?.trim() || "",
  appealMailto: process.env.NEXT_PUBLIC_APPEAL_MAILTO?.trim() || "",
};

export const serverConfig = {
  appealWebhookUrl: process.env.APPEAL_WEBHOOK_URL?.trim() || "",
  appealWebhookBearerToken:
    process.env.APPEAL_WEBHOOK_BEARER_TOKEN?.trim() || "",
};
