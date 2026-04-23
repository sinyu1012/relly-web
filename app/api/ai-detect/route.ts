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
      ["核对原始发布源、权威报道或更早版本。", "不要只凭单张截图转发结论。"],
      4,
    ),
    model,
    analyzedAt: new Date().toISOString(),
    disclaimer: IMAGE_DISCLAIMER,
  };
}

function buildPrompt(): string {
  return [
    "你是“求真”产品中的图片内容推理模块，目标是帮助用户发现“图片内容本身是否可疑”。",
    "只依据图片中可见内容和你的常识/公共知识推理：文字、标题、字幕、LOGO、人物、场景、界面、时间地点、物体关系和画面细节。",
    "不要引用、猜测或要求 EXIF、C2PA、哈希、文件名、上传时间等元信息；缺少这些元信息不能作为风险依据。",
    "先抽取图片显式或隐含的核心主张，再判断它是否与基本事实、常识、人物身份、公司关系、时间线、地理、物理规律、品牌/机构语境或平台界面样式冲突。",
    "对“一眼假”的荒诞新闻、截图或海报要提高风险分。例如图片声称“库克加入小米”“苹果 CEO 成为小米员工”这类与已知人物身份和商业关系高度冲突的内容，应标记为高风险，并说明需要核对权威来源。",
    "同时观察 AI/合成常见视觉问题：乱码文字、局部文字边缘异常、手部/肢体错误、透视光影不一致、重复纹理、物体关系不合理、截图 UI 拼贴痕迹。",
    "不要给出“真/假”绝对裁决；输出风险提示、可核查依据和下一步核验建议。若现代新闻或人事变动可能已经变化，请标注需要查证，不要装作确定。",
    "风险分参考：0-24 内容自洽且无明显视觉异常；25-49 证据不足或轻微可疑；50-74 有明显不一致或疑似合成；75-100 核心主张高度违背常识/公共知识或存在强烈合成迹象。",
    "只返回一个 JSON 对象，不要输出 Markdown。",
    "JSON 字段：aiRiskScore number 0-100；riskBand 为 low/uncertain/elevated/high；summary string；findings string[]；checks 数组，每项含 label、status、detail，status 为 pass/info/warn/risk；nextActions string[]。",
  ].join("\n");
}

function buildUserInstruction(): string {
  const today = new Date().toISOString().slice(0, 10);

  return [
    `当前日期：${today}。`,
    "请直接分析这张图片的可见内容。",
    "如果图片包含文字、新闻标题、聊天记录、海报或截图，请读出核心主张，并做常识/事实一致性推理。",
    "不要等待或引用任何 EXIF、C2PA、哈希、本地扫描摘要。",
    "输出结构化 AI 图片分析结果。",
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
                text: buildUserInstruction(),
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
