import exifr from "exifr";

import type { MetadataField, MetadataGroup, MetadataSummary } from "@/lib/types";

type ParsedExif = Record<string, unknown> & {
  Make?: string;
  Model?: string;
  Software?: string;
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  ImageWidth?: number;
  ImageHeight?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  PixelXDimension?: number;
  PixelYDimension?: number;
  latitude?: number;
  longitude?: number;
  GPSLatitude?: number;
  GPSLongitude?: number;
  BitDepth?: number;
  ColorType?: string;
  Compression?: string;
  Filter?: string;
  Interlace?: string;
  xmp?: unknown;
};

const GPS_DETAIL_KEYS = new Set([
  "latitude",
  "longitude",
  "GPSLatitude",
  "GPSLongitude",
  "GPSPosition",
  "GPSAltitude",
  "GPSHPositioningError",
]);

const FIELD_LABELS: Record<string, string> = {
  ImageWidth: "Image Width",
  ImageHeight: "Image Height",
  ExifImageWidth: "EXIF Image Width",
  ExifImageHeight: "EXIF Image Height",
  PixelXDimension: "Pixel X Dimension",
  PixelYDimension: "Pixel Y Dimension",
  BitDepth: "PNG Bit Depth",
  ColorType: "PNG Color Type",
  Compression: "PNG Compression",
  Filter: "PNG Filter",
  Interlace: "PNG Interlace",
  Make: "Camera Make",
  Model: "Camera Model",
  Software: "Software",
  DateTimeOriginal: "Date Time Original",
  CreateDate: "Create Date",
};

function coerceDate(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function getDimensions(parsed: ParsedExif): MetadataSummary["dimensions"] {
  const width =
    Number(parsed.ImageWidth) ||
    Number(parsed.ExifImageWidth) ||
    Number(parsed.PixelXDimension) ||
    0;
  const height =
    Number(parsed.ImageHeight) ||
    Number(parsed.ExifImageHeight) ||
    Number(parsed.PixelYDimension) ||
    0;

  if (!width || !height) {
    return null;
  }

  return { width, height };
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    return value.length > 220 ? `${value.slice(0, 220)}...` : value;
  }

  if (Array.isArray(value)) {
    const normalized = value.map(formatValue).filter(Boolean).join(", ");
    return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
  }

  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json.length > 220 ? `${json.slice(0, 220)}...` : json;
    } catch {
      return null;
    }
  }

  return null;
}

function makeField(label: string, value: unknown): MetadataField | null {
  const formatted = formatValue(value);
  return formatted ? { label, value: formatted } : null;
}

function buildFileFields(
  file: File,
  dimensions: MetadataSummary["dimensions"],
): MetadataField[] {
  return [
    makeField("MIME", file.type || "unknown"),
    makeField("Size", formatBytes(file.size)),
    makeField(
      "Modified",
      file.lastModified ? new Date(file.lastModified).toISOString() : null,
    ),
    makeField("Width", dimensions?.width ?? null),
    makeField("Height", dimensions?.height ?? null),
  ].filter((field): field is MetadataField => Boolean(field));
}

function buildParsedFields(parsed: ParsedExif): MetadataField[] {
  return Object.entries(parsed)
    .filter(([key]) => !GPS_DETAIL_KEYS.has(key))
    .map(([key, value]) => makeField(FIELD_LABELS[key] ?? key, value))
    .filter((field): field is MetadataField => Boolean(field))
    .slice(0, 48);
}

function buildPngHeaderFields(parsed: ParsedExif): MetadataField[] {
  return [
    makeField("PNG: Image Width", parsed.ImageWidth),
    makeField("PNG: Image Height", parsed.ImageHeight),
    makeField("PNG: Bit Depth", parsed.BitDepth),
    makeField("PNG: Color Type", parsed.ColorType),
    makeField("PNG: Compression", parsed.Compression),
    makeField("PNG: Filter", parsed.Filter),
    makeField("PNG: Interlace", parsed.Interlace),
  ].filter((field): field is MetadataField => Boolean(field));
}

function extractPrintableStrings(bytes: Uint8Array): string[] {
  const values: string[] = [];
  let current = "";

  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }

    if (current.length >= 4) {
      values.push(current);
    }
    current = "";
  }

  if (current.length >= 4) {
    values.push(current);
  }

  return values;
}

function extractC2paTextHints(bytes: Uint8Array): string[] {
  const hintPattern =
    /openai|gpt|dall|midjourney|stable diffusion|firefly|trainedalgorithmic|algorithmicmedia|digitalsourcetype|c2pa\.[a-z]+|claim_generator|media service/i;

  return Array.from(
    new Set(
      extractPrintableStrings(bytes)
        .filter((value) => hintPattern.test(value))
        .map((value) => (value.length > 160 ? `${value.slice(0, 160)}...` : value)),
    ),
  ).slice(0, 10);
}

async function readPngChunkGroup(file: File): Promise<MetadataGroup | null> {
  if (file.type !== "image/png") {
    return null;
  }

  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];

  if (
    view.byteLength < signature.length ||
    !signature.every((byte, index) => view.getUint8(index) === byte)
  ) {
    return null;
  }

  const decoder = new TextDecoder("ascii");
  const counts = new Map<string, { count: number; bytes: number }>();
  let position = signature.length;
  let chunkCount = 0;
  let c2paBytes = 0;
  const c2paHints: string[] = [];

  while (position + 12 <= view.byteLength) {
    const length = view.getUint32(position);
    const type = decoder.decode(new Uint8Array(buffer, position + 4, 4));
    const nextPosition = position + 12 + length;

    if (nextPosition > view.byteLength) {
      break;
    }

    const current = counts.get(type) ?? { count: 0, bytes: 0 };
    counts.set(type, {
      count: current.count + 1,
      bytes: current.bytes + length,
    });
    chunkCount += 1;

    if (type === "caBX") {
      c2paBytes += length;
      c2paHints.push(
        ...extractC2paTextHints(new Uint8Array(buffer, position + 8, length)),
      );
    }

    position = nextPosition;

    if (type === "IEND") {
      break;
    }
  }

  const chunkSummary = Array.from(counts.entries())
    .map(([type, item]) => (item.count > 1 ? `${type} x${item.count}` : type))
    .join(", ");

  return {
    title: "PNG / 容器数据",
    fields: [
      makeField("Chunk Count", chunkCount),
      makeField("Chunks", chunkSummary),
      makeField(
        "C2PA caBX Chunk",
        c2paBytes ? `present (${formatBytes(c2paBytes)})` : "not found",
      ),
      makeField(
        "C2PA Text Hints",
        Array.from(new Set(c2paHints)).join(" / ") || null,
      ),
    ].filter((field): field is MetadataField => Boolean(field)),
  };
}

function buildMetadataNote(
  parsed: ParsedExif,
  hasExif: boolean,
  hasXmp: boolean,
): string {
  if (parsed.Software) {
    return `元数据记录了软件来源：${parsed.Software}。这类信息需要结合上下文理解，不单独代表篡改。`;
  }

  if (parsed.Make || parsed.Model) {
    return `检测到设备信息：${[parsed.Make, parsed.Model]
      .filter(Boolean)
      .join(" / ")}。`;
  }

  if (hasExif || hasXmp) {
    return "检测到基础元数据，但可用于判断的线索较有限。";
  }

  return "未读取到足够元数据，这不等于图像异常，只表示可核对信息较少。";
}

export function buildFallbackMetadata(file: File, note: string): MetadataSummary {
  const fields = buildFileFields(file, null);

  return {
    format: file.type.split("/")[1]?.toUpperCase() || "UNKNOWN",
    mimeType: file.type,
    sizeBytes: file.size,
    dimensions: null,
    camera: null,
    software: null,
    createdAt: null,
    hasExif: false,
    hasXmp: false,
    gps: {
      present: false,
      redacted: true,
    },
    note,
    fields,
    groups: [
      {
        title: "文件信息",
        fields,
      },
    ],
  };
}

export async function extractMetadata(file: File): Promise<MetadataSummary> {
  const [parsed, pngChunkGroup] = await Promise.all([
    exifr.parse(file, {
      ihdr: true,
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: false,
      icc: false,
    }) as Promise<ParsedExif | null>,
    readPngChunkGroup(file).catch(() => null),
  ]);

  if (!parsed) {
    const fallback = buildFallbackMetadata(
      file,
      "未读取到标准 EXIF/XMP 元数据，仅保留基础文件信息。",
    );

    return pngChunkGroup
      ? {
          ...fallback,
          groups: [...fallback.groups, pngChunkGroup],
        }
      : fallback;
  }

  const hasGps = Boolean(
    parsed.latitude ??
      parsed.longitude ??
      parsed.GPSLatitude ??
      parsed.GPSLongitude,
  );
  const hasExif = Boolean(
    parsed.Make ||
      parsed.Model ||
      parsed.Software ||
      parsed.DateTimeOriginal ||
      parsed.CreateDate,
  );
  const hasXmp = Boolean(parsed.xmp);
  const dimensions = getDimensions(parsed);
  const fields = buildFileFields(file, dimensions);
  const pngFields = buildPngHeaderFields(parsed);
  const rawFields = buildParsedFields(parsed);
  const groups: MetadataGroup[] = [
    {
      title: "文件信息",
      fields,
    },
  ];

  if (pngFields.length) {
    groups.push({
      title: "PNG 图像信息",
      fields: pngFields,
    });
  }

  if (pngChunkGroup) {
    groups.push(pngChunkGroup);
  }

  if (rawFields.length) {
    groups.push({
      title: "EXIF / XMP / 其他字段",
      fields: rawFields,
    });
  }

  return {
    format: file.type.split("/")[1]?.toUpperCase() || "UNKNOWN",
    mimeType: file.type,
    sizeBytes: file.size,
    dimensions,
    camera: [parsed.Make, parsed.Model].filter(Boolean).join(" / ") || null,
    software: parsed.Software || null,
    createdAt: coerceDate(parsed.DateTimeOriginal ?? parsed.CreateDate),
    hasExif,
    hasXmp,
    gps: {
      present: hasGps,
      redacted: true,
    },
    note: buildMetadataNote(parsed, hasExif, hasXmp),
    fields,
    groups,
  };
}
