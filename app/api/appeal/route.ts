import { NextResponse } from "next/server";

import { serverConfig } from "@/lib/config";
import type { AppealDraft } from "@/lib/types";

export const runtime = "nodejs";

function isAppealDraft(value: unknown): value is AppealDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppealDraft>;

  return (
    typeof candidate.caseId === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.sourceUrl === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.attachmentNames)
  );
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!isAppealDraft(payload)) {
    return NextResponse.json(
      { error: "请求格式无效，无法提交申诉。" },
      { status: 400 },
    );
  }

  if (!serverConfig.appealWebhookUrl) {
    return NextResponse.json(
      {
        error:
          "当前环境未配置服务端申诉接收地址，请改用 case.json 下载或外部工单入口。",
      },
      { status: 503 },
    );
  }

  const response = await fetch(serverConfig.appealWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(serverConfig.appealWebhookBearerToken
        ? {
            authorization: `Bearer ${serverConfig.appealWebhookBearerToken}`,
          }
        : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  }).catch(() => null);

  if (!response || !response.ok) {
    return NextResponse.json(
      { error: "服务端申诉转发失败，请稍后重试或先下载 case.json。" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    caseId: payload.caseId,
    status: "accepted",
  });
}

