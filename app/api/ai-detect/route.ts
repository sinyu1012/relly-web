import { NextResponse } from "next/server";

import type {
  ClaimAnalysisCheck,
  ClaimAnalysisResult,
  EvidenceStatus,
  RiskBand,
} from "@/lib/types";

export const runtime = "nodejs";

const AIHUBMIX_CHAT_COMPLETIONS_URL = "https://aihubmix.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_CLAIM_LENGTH = 4000;
const CLAIM_DISCLAIMER =
  "AI 辅助核查只评估配文和主张的可疑程度，不构成事实核验、法律或平台治理上的最终结论。";

type AiDetectRequest = {
  claimText?: unknown;
  imageContext?: unknown;
};

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

function normalizeString(value: unknown, fallback: string, maxLength = 240): string {
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
    .map((item) => normalizeString(item, "", 220))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
}

function normalizeChecks(value: unknown): ClaimAnalysisCheck[] {
  if (!Array.isArray(value)) {
    return [
      {
        label: "可核查性",
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
        detail: normalizeString(record.detail, "未给出具体说明。", 220),
      };
    })
    .filter((item): item is ClaimAnalysisCheck => Boolean(item))
    .slice(0, 5);

  return checks.length
    ? checks
    : [
        {
          label: "可核查性",
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
): ClaimAnalysisResult {
  const score = clampScore(payload?.claimRiskScore ?? payload?.riskScore);
  const riskBand = normalizeRiskBand(payload?.riskBand, score);

  return {
    claimRiskScore: score,
    riskBand,
    summary: normalizeString(
      payload?.summary,
      fallbackText || "AI 已完成辅助核查，但没有返回可展开的摘要。",
      260,
    ),
    findings: normalizeStringArray(
      payload?.findings,
      ["当前只完成了配文层面的可疑度评估，仍建议核对原始来源。"],
      5,
    ),
    checks: normalizeChecks(payload?.checks),
    nextActions: normalizeStringArray(
      payload?.nextActions,
      ["核对原始来源链接。", "补充图片上下文或更早版本。"],
      4,
    ),
    model,
    analyzedAt: new Date().toISOString(),
    disclaimer: CLAIM_DISCLAIMER,
  };
}

function buildPrompt(): string {
  return [
    "你是“是真的吗”产品中的 AI 辅助核查模块。",
    "你的任务是评估用户提供的图片配文、转发语、标题或聊天截图文字是否存在明显可疑主张。",
    "不要判断图片文件本身真假；图片文件证据只作为上下文。",
    "没有 EXIF、没有 C2PA 或证据不足，不能被当作伪造证据，只能说明可核查信息不足。",
    "如果主张涉及新闻、灾害、公共政策、医疗、法律、金融、名人或实时事件，你必须说明需要联网或权威来源核查，不要编造事实来源。",
    "重点识别：极端数字、违反常识、时间线冲突、地点冲突、缺少来源、煽动式转发话术、过度确定性表述。",
    "只返回一个 JSON 对象，不要输出 Markdown。",
    "JSON 字段：claimRiskScore number 0-100；riskBand 为 low/uncertain/elevated/high；summary string；findings string[]；checks 数组，每项含 label、status、detail，status 为 pass/info/warn/risk；nextActions string[]。",
  ].join("\n");
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
          "当前环境未配置 AI 辅助核查。请在 Vercel 环境变量中设置 AIHUBMIX_API_KEY。",
      },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as AiDetectRequest | null;
  const claimText = typeof payload?.claimText === "string" ? payload.claimText.trim() : "";

  if (!claimText) {
    return NextResponse.json(
      { error: "请先输入需要核查的配文或消息。" },
      { status: 400 },
    );
  }

  if (claimText.length > MAX_CLAIM_LENGTH) {
    return NextResponse.json(
      { error: `配文过长，请控制在 ${MAX_CLAIM_LENGTH} 个字符以内。` },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

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
            content: JSON.stringify({
              claimText,
              imageContext: payload?.imageContext ?? null,
            }),
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
      { error: aborted ? "AI 辅助核查超时，请稍后重试。" : "AI 辅助核查失败，请稍后重试。" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
