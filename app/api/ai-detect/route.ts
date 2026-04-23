import { NextResponse } from "next/server";

import { SUPPORTED_MIME_TYPES } from "@/lib/config";
import type {
  AiImageAnalysisCheck,
  AiImageAnalysisResult,
  EvidenceStatus,
  RiskBand,
} from "@/lib/types";

export const runtime = "nodejs";

const AIHUBMIX_CHAT_COMPLETIONS_URL = "https://aihubmix.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_AI_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const IMAGE_DISCLAIMER =
  "AI 图片分析会把原图发送给外部 AI 服务，只能作为视觉可疑点提示，不构成事实核验、法律或平台治理上的最终结论。";

type AiHubMixResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const supportedMimeTypes = new Set<string>(SUPPORTED_MIME_TYPES);
const riskBands: RiskBand[] = ["low", "uncertain", "elevated", "high"];
const evidenceStatuses: EvidenceStatus[] = ["pass", "info", "warn", "risk", "error"];

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function riskBandFromScore(score: number): RiskBand {
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

function normalizeRiskBand(value: unknown, score: number): RiskBand {
  return typeof value === "string" && riskBands.includes(value as RiskBand)
    ? (value as RiskBand)
    : riskBandFromScore(score);
}

function normalizeStatus(value: unknown): EvidenceStatus {
  return typeof value === "string" && evidenceStatuses.includes(value as EvidenceStatus)
    ? (value as EvidenceStatus)
    : "info";
}

function normalizeString(value: unknown, fallback: string, maxLength = 260): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function normalizeStringArray(value: unknown, fallback: string[], maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => normalizeString(item, "", 240))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
}

function normalizeChecks(value: unknown): AiImageAnalysisCheck[] {
  if (!Array.isArray(value)) {
    return [
      {
        label: "视觉可疑点",
        status: "info",
        detail: "模型未返回结构化检查项，已降级为摘要判断。",
      },
    ];
  }

  const checks = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        label: normalizeString(record.label, "检查项", 48),
        status: normalizeStatus(record.status),
        detail: normalizeString(record.detail, "未给出具体说明。", 240),
      };
    })
    .filter((item): item is AiImageAnalysisCheck => Boolean(item))
    .slice(0, 6);

  return checks.length
    ? checks
    : [
        {
          label: "视觉可疑点",
          status: "info",
          detail: "模型未返回结构化检查项，已降级为摘要判断。",
        },
      ];
}

function extractOutputText(response: AiHubMixResponse): string | null {
  return response.choices
    ?.map((choice) => choice.message?.content)
    .find((content): content is string => typeof content === "string") ?? null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized.slice(start, end + 1));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseImageContext(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeAnalysis(
  payload: Record<string, unknown> | null,
  fallbackText: string,
  model: string,
): AiImageAnalysisResult {
  const score = clampScore(payload?.aiRiskScore ?? payload?.riskScore);
  const riskBand = normalizeRiskBand(payload?.riskBand, score);

  return {
    aiRiskScore: score,
    riskBand,
    summary: normalizeString(
      payload?.summary,
      fallbackText || "AI 已完成图片分析，但没有返回可展开的摘要。",
      280,
    ),
    findings: normalizeStringArray(
      payload?.findings,
      ["当前只完成了视觉层面的可疑点分析，仍建议核对原始来源和本地证据。"],
      6,
    ),
    checks: normalizeChecks(payload?.checks),
    nextActions: normalizeStringArray(
      payload?.nextActions,
      ["结合本地元数据和 C2PA 结果判断。", "核对原始来源或更早版本。"],
      4,
    ),
    model,
    analyzedAt: new Date().toISOString(),
    disclaimer: IMAGE_DISCLAIMER,
  };
}

function buildPrompt(): string {
  return [
    "你是“求真”产品中的 AI 图片分析模块。",
    "你的任务是观察图片内容，找出视觉层面的 AI 生成、合成、编辑或来源不一致风险。",
    "不要给出“真/假”绝对裁决；只输出风险提示和可核查的视觉依据。",
    "本地 EXIF、C2PA、哈希等证据会作为上下文提供；没有 EXIF 或没有 C2PA 不能被当作伪造证据，只能说明可核查信息不足。",
    "重点观察：不自然的文字、手部/肢体/边缘伪影、光影透视不一致、重复纹理、物体关系异常、截图或新闻图中的上下文矛盾、画面与本地证据摘要冲突。",
    "如果仅凭视觉无法确认，请明确说明不确定，并建议补充来源链接、原始文件或更早版本。",
    "只返回一个 JSON 对象，不要输出 Markdown。",
    "JSON 字段：aiRiskScore number 0-100；riskBand 为 low/uncertain/elevated/high；summary string；findings string[]；checks 数组，每项含 label、status、detail，status 为 pass/info/warn/risk；nextActions string[]。",
  ].join("\n");
}

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  const apiKey =
    process.env.AIHUBMIX_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim();
  const model =
    process.env.AIHUBMIX_MODEL?.trim() ||
    process.env.AI_DETECT_MODEL?.trim() ||
    DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "当前环境未配置 AI 图片分析。请在 Vercel 环境变量中设置 AIHUBMIX_API_KEY。",
      },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const image = formData?.get("image");
  const rawImageContext = formData?.get("imageContext");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "请上传需要 AI 分析的图片。" },
      { status: 400 },
    );
  }

  if (!supportedMimeTypes.has(image.type)) {
    return NextResponse.json(
      { error: "AI 图片分析目前仅支持 JPEG、PNG、WebP。" },
      { status: 400 },
    );
  }

  if (image.size > MAX_AI_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "AI 图片分析上传限制为 4 MB，请先压缩图片或继续使用本地判断。" },
      { status: 400 },
    );
  }

  const imageContext =
    typeof rawImageContext === "string" && rawImageContext.length <= 8000
      ? rawImageContext
      : "null";
  const parsedImageContext = parseImageContext(imageContext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(AIHUBMIX_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: buildPrompt(),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  imageContext: parsedImageContext,
                  instruction:
                    "请结合图片内容和本地证据摘要，输出结构化 AI 图片分析结果。",
                }),
              },
              {
                type: "image_url",
                image_url: {
                  url: await fileToDataUrl(image),
                },
              },
            ],
          },
        ],
        temperature: 0.2,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const providerPayload = (await response.json().catch(() => null)) as AiHubMixResponse | null;

    if (!response.ok || !providerPayload) {
      return NextResponse.json(
        { error: "AI 服务暂时不可用，请稍后重试。" },
        { status: 502 },
      );
    }

    const outputText = extractOutputText(providerPayload);
    if (!outputText) {
      return NextResponse.json(
        { error: "AI 服务未返回可解析结果，请稍后重试。" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      normalizeAnalysis(parseJsonObject(outputText), outputText, model),
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "AI 图片分析超时，请稍后重试。" : "AI 图片分析失败，请稍后重试。" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
