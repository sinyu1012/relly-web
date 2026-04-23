import type { ScanStage } from "@/lib/types";

export const RISK_DISCLAIMER =
  "本结果用于来源核对与风险提示，不构成法律、新闻或平台治理上的最终结论。";

export const STAGE_DEFINITIONS: Array<
  Omit<ScanStage, "state">
> = [
  {
    id: "normalize",
    label: "校验文件",
    description: "检查格式、大小和基础可读性",
    progress: 10,
  },
  {
    id: "metadata",
    label: "读取元数据",
    description: "提取 EXIF / XMP 与基础图像信息",
    progress: 30,
  },
  {
    id: "provenance",
    label: "校验凭证",
    description: "检查 Content Credentials / C2PA",
    progress: 55,
  },
  {
    id: "hash",
    label: "计算哈希",
    description: "生成本地 SHA-256 指纹",
    progress: 75,
  },
  {
    id: "fingerprint",
    label: "生成图像指纹",
    description: "生成基础感知哈希用于后续比对",
    progress: 90,
  },
  {
    id: "result",
    label: "整合结果",
    description: "汇总证据与风险提示",
    progress: 100,
  },
];

