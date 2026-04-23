import exifr from "exifr";

import type { MetadataSummary } from "@/lib/types";

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
  xmp?: unknown;
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
  };
}

export async function extractMetadata(file: File): Promise<MetadataSummary> {
  const parsed = (await exifr.parse(file, {
    tiff: true,
    exif: true,
    gps: true,
    xmp: true,
    iptc: false,
    icc: false,
  })) as ParsedExif | null;

  if (!parsed) {
    return buildFallbackMetadata(
      file,
      "未读取到标准 EXIF/XMP 元数据，仅保留基础文件信息。",
    );
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

  return {
    format: file.type.split("/")[1]?.toUpperCase() || "UNKNOWN",
    mimeType: file.type,
    sizeBytes: file.size,
    dimensions: getDimensions(parsed),
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
  };
}

