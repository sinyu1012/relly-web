import type { MetadataField, QuickScanResult } from "@/lib/types";

const REPORT_WIDTH = 1200;
const REPORT_HEIGHT = 1850;

const COLORS = {
  bg: "#0A0A0A",
  text: "#F5F5F5",
  muted: "#9A9A9A",
  border: "#3A3A3A",
  accent: "#4DA3FF",
  warning: "#FFD400",
  risk: "#FF453A",
  success: "#2DD36F",
  surface: "#151515",
};

const riskLabels: Record<QuickScanResult["riskBand"], string> = {
  low: "低风险",
  uncertain: "不确定",
  elevated: "偏高风险",
  high: "高风险",
};

function riskColor(riskBand: QuickScanResult["riskBand"]): string {
  if (riskBand === "low") {
    return COLORS.success;
  }

  if (riskBand === "uncertain") {
    return COLORS.warning;
  }

  return COLORS.risk;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片报告预览生成失败。"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("浏览器未能生成 PNG 报告。"));
    }, "image/png");
  });
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4,
): number {
  const tokens = text.match(/(\s+|[A-Za-z0-9:/._-]+|.)/g) ?? [];
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (const token of tokens) {
    const next = current + token;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current.trimEnd());
      current = token.trimStart();
    } else {
      current = token;
    }

    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current.trimEnd());
  } else if (current) {
    truncated = true;
  }

  lines.forEach((line, index) => {
    let output = line;
    if (truncated && index === lines.length - 1) {
      while (ctx.measureText(`${output}...`).width > maxWidth && output.length > 0) {
        output = output.slice(0, -1);
      }
      output = `${output}...`;
    }

    ctx.fillText(output, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function drawLabelValue(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  labelWidth = 150,
): number {
  ctx.font = "22px Menlo, Consolas, monospace";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, x, y);
  ctx.font =
    "22px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = COLORS.text;
  return drawWrappedText(ctx, value, x + labelWidth, y, width - labelWidth, 29, 2);
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = "700 32px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  const width = ctx.measureText(text).width + 44;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, 56);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 22, y + 38);
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let targetWidth = width;
  let targetHeight = height;
  let targetX = x;
  let targetY = y;

  if (sourceRatio > targetRatio) {
    targetHeight = width / sourceRatio;
    targetY = y + (height - targetHeight) / 2;
  } else {
    targetWidth = height * sourceRatio;
    targetX = x + (width - targetWidth) / 2;
  }

  ctx.drawImage(image, targetX, targetY, targetWidth, targetHeight);
}

function findMetadataField(result: QuickScanResult, label: string): MetadataField | null {
  return (
    result.metadata.groups
      .flatMap((group) => group.fields)
      .find((field) => field.label === label) ?? null
  );
}

function firstValue(fields: MetadataField[], label: string): string | null {
  return fields.find((field) => field.label === label)?.value ?? null;
}

export async function createReportImageBlob(result: QuickScanResult): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = REPORT_WIDTH;
  canvas.height = REPORT_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("浏览器不支持图片报告生成。");
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, REPORT_WIDTH, REPORT_HEIGHT);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, REPORT_WIDTH - 72, REPORT_HEIGHT - 72);

  ctx.fillStyle = COLORS.text;
  ctx.font =
    "700 58px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText("是真的吗", 76, 120);
  ctx.font = "22px Menlo, Consolas, monospace";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText("LOCAL EVIDENCE REPORT", 80, 162);

  drawPill(ctx, riskLabels[result.riskBand], 76, 205, riskColor(result.riskBand));

  ctx.font = "700 76px Menlo, Consolas, monospace";
  ctx.fillStyle = riskColor(result.riskBand);
  ctx.fillText(`${result.riskScore}`, 410, 255);
  ctx.font = "26px Menlo, Consolas, monospace";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText("/ 100", 510, 252);

  ctx.font =
    "28px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillStyle = COLORS.text;
  drawWrappedText(ctx, result.summary, 76, 330, 1040, 40, 2);

  const preview = await loadImage(result.previewUrl);
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(76, 450, 430, 430);
  drawContainedImage(ctx, preview, 76, 450, 430, 430);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(76, 450, 430, 430);

  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(540, 450, 584, 430);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(540, 450, 584, 430);

  let y = 508;
  ctx.font = "700 30px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillStyle = COLORS.text;
  ctx.fillText("关键证据", 582, y);
  y += 50;

  const aiSignal =
    result.provenance.aiFootprint.status === "detected"
      ? result.provenance.aiFootprint.signals[0]
      : findMetadataField(result, "C2PA Text Hints")?.value;
  const c2paStatus =
    result.provenance.validationState ??
    firstValue(result.provenance.details, "C2PA Status") ??
    "无";
  const generator =
    result.provenance.generator ??
    firstValue(result.provenance.claimGeneratorInfo, "Name") ??
    "未声明";

  y = drawLabelValue(ctx, "C2PA", c2paStatus, 582, y, 500) + 8;
  y = drawLabelValue(ctx, "生成器", generator, 582, y, 500) + 8;
  y = drawLabelValue(
    ctx,
    "AI 线索",
    aiSignal ?? "未发现明确 AI 元信息",
    582,
    y,
    500,
  ) + 8;
  y = drawLabelValue(
    ctx,
    "尺寸",
    result.metadata.dimensions
      ? `${result.metadata.dimensions.width} x ${result.metadata.dimensions.height}`
      : "未读取",
    582,
    y,
    500,
  ) + 8;
  drawLabelValue(
    ctx,
    "SHA",
    `${result.fileFingerprint.sha256.slice(0, 24)}...`,
    582,
    y,
    500,
  );

  const evidenceTop = 930;
  const evidenceHeight = 500;
  const evidenceBottom = evidenceTop + evidenceHeight - 34;
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(76, evidenceTop, 1048, evidenceHeight);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(76, evidenceTop, 1048, evidenceHeight);
  ctx.font = "700 30px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillStyle = COLORS.text;
  ctx.fillText("证据项", 112, evidenceTop + 60);

  y = evidenceTop + 110;
  for (const [index, signal] of result.signals.slice(0, 5).entries()) {
    const statusColor =
      signal.status === "risk"
        ? COLORS.risk
        : signal.status === "warn"
          ? COLORS.warning
          : signal.status === "pass"
            ? COLORS.success
            : COLORS.accent;

    ctx.fillStyle = statusColor;
    ctx.font = "700 22px Menlo, Consolas, monospace";
    ctx.fillText(signal.status.toUpperCase(), 112, y);
    ctx.fillStyle = COLORS.text;
    ctx.font =
      "700 25px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    ctx.fillText(signal.title, 240, y);
    ctx.fillStyle = COLORS.muted;
    ctx.font =
      "22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    const nextY = drawWrappedText(ctx, signal.detail, 240, y + 36, 820, 28, 2);
    y = Math.max(y + 82, nextY + 22);

    if (y > evidenceBottom && index < result.signals.length - 1) {
      ctx.font = "22px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("更多证据项已在页面详情中展示。", 240, evidenceBottom);
      break;
    }
  }

  const noteTop = 1480;
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(76, noteTop, 1048, 180);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(76, noteTop, 1048, 180);
  ctx.font = "700 28px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillStyle = COLORS.text;
  ctx.fillText("说明", 112, noteTop + 56);
  ctx.font = "23px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  ctx.fillStyle = COLORS.muted;
  drawWrappedText(ctx, result.disclaimer, 112, noteTop + 102, 950, 32, 2);

  ctx.font = "20px Menlo, Consolas, monospace";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Case ID: ${result.caseId}`, 76, 1738);
  ctx.fillText(`Generated: ${new Date().toISOString()}`, 76, 1772);

  return canvasToBlob(canvas);
}
