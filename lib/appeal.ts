import type { AppealDraft } from "@/lib/types";

export async function submitAppealDraft(
  draft: AppealDraft,
): Promise<{ caseId: string; status: string }> {
  const response = await fetch("/api/appeal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    let detail = "申诉提交失败，请稍后重试。";

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
      // noop
    }

    throw new Error(detail);
  }

  return (await response.json()) as { caseId: string; status: string };
}

