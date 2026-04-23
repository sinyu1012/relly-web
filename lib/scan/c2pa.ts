import type {
  C2paSdk,
  Manifest,
  ManifestAssertion,
  ManifestStore,
  SignatureInfo,
  ValidationStatus,
} from "@contentauth/c2pa-web/inline";

import type {
  AiFootprintSummary,
  MetadataField,
  ProvenanceAction,
  ProvenanceSummary,
} from "@/lib/types";

let sdkPromise: Promise<C2paSdk> | null = null;

async function getSdk(): Promise<C2paSdk> {
  if (!sdkPromise) {
    sdkPromise = import("@contentauth/c2pa-web/inline").then(({ createC2pa }) =>
      createC2pa(),
    );
  }

  return sdkPromise;
}

function summarizeValidationMessages(
  validationStatus: ValidationStatus[] | null | undefined,
): string[] {
  return (validationStatus ?? [])
    .map((item) => item.explanation || item.code)
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function makeField(label: string, value: unknown): MetadataField | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return {
    label,
    value: String(value),
  };
}

function normalizeDigitalSourceType(value: unknown): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  return value.split("/").filter(Boolean).pop() ?? value;
}

function formatSoftwareAgent(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "name" in value) {
    const agent = value as { name?: unknown; version?: unknown };
    return [agent.name, agent.version].filter(Boolean).join(" ") || null;
  }

  return null;
}

function getGenerator(activeManifest: Manifest | null): string | null {
  return (
    activeManifest?.claim_generator_info?.[0]?.name ||
    activeManifest?.claim_generator ||
    null
  );
}

function buildDetails(
  validationState: string | null,
  activeManifestLabel: string | null,
  activeManifest: Manifest | null,
  validationMessages: string[],
): MetadataField[] {
  return [
    makeField("C2PA Status", validationState ?? "无"),
    makeField("Active Manifest", activeManifestLabel ?? "无"),
    makeField("Claim Generator", getGenerator(activeManifest) ?? "未声明"),
    makeField("Title", activeManifest?.title ?? null),
    makeField("Format", activeManifest?.format ?? null),
    makeField("Instance ID", activeManifest?.instance_id ?? null),
    makeField("Validation Messages", validationMessages.join(" / ") || null),
  ].filter((field): field is MetadataField => Boolean(field));
}

function buildClaimGeneratorInfo(activeManifest: Manifest | null): MetadataField[] {
  const info = activeManifest?.claim_generator_info?.[0];

  return [
    makeField("Name", info?.name ?? activeManifest?.claim_generator ?? null),
    makeField("Version", info?.version ?? null),
    makeField("Operating System", info?.operating_system ?? null),
  ].filter((field): field is MetadataField => Boolean(field));
}

function buildSignatureFields(signature: SignatureInfo | null | undefined): MetadataField[] {
  return [
    makeField("Algorithm", signature?.alg ?? null),
    makeField("Issuer", signature?.issuer ?? null),
    makeField("Common Name", signature?.common_name ?? null),
    makeField("Created At", signature?.time ?? null),
    makeField(
      "Revocation Status",
      signature?.revocation_status === undefined
        ? null
        : signature.revocation_status
          ? "revoked"
          : "not revoked",
    ),
  ].filter((field): field is MetadataField => Boolean(field));
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function extractActions(assertions: ManifestAssertion[] | undefined): ProvenanceAction[] {
  const actions: ProvenanceAction[] = [];

  for (const assertion of assertions ?? []) {
    if (!assertion.label.toLowerCase().includes("actions")) {
      continue;
    }

    const data = getRecord(assertion.data);
    const softwareAgents = Array.isArray(data?.softwareAgents)
      ? data.softwareAgents
      : Array.isArray(data?.software_agents)
        ? data.software_agents
        : [];
    const rawActions = Array.isArray(data?.actions)
      ? data.actions
      : Array.isArray(assertion.data)
        ? assertion.data
        : [];

    for (const rawAction of rawActions) {
      const action = getRecord(rawAction);
      if (!action) {
        continue;
      }

      const agentIndex =
        typeof action.softwareAgentIndex === "number"
          ? action.softwareAgentIndex
          : typeof action.software_agent_index === "number"
            ? action.software_agent_index
            : null;
      const indexedAgent =
        agentIndex !== null && softwareAgents[agentIndex]
          ? softwareAgents[agentIndex]
          : null;

      actions.push({
        action: String(action.action ?? "unknown"),
        when: typeof action.when === "string" ? action.when : null,
        softwareAgent:
          formatSoftwareAgent(action.softwareAgent) ??
          formatSoftwareAgent(action.software_agent) ??
          formatSoftwareAgent(indexedAgent),
        digitalSourceType:
          normalizeDigitalSourceType(action.digitalSourceType) ??
          normalizeDigitalSourceType(action.digital_source_type),
      });
    }
  }

  return actions.slice(0, 12);
}

function buildAssertionFields(assertions: ManifestAssertion[] | undefined): MetadataField[] {
  return (assertions ?? [])
    .map((assertion) =>
      makeField(
        assertion.label,
        [assertion.kind, assertion.created ? "created" : null]
          .filter(Boolean)
          .join(" / ") || "present",
      ),
    )
    .filter((field): field is MetadataField => Boolean(field))
    .slice(0, 16);
}

function detectModelName(text: string): string | null {
  const modelPatterns: Array<[RegExp, string]> = [
    [/gpt-?4o/i, "GPT-4o"],
    [/dall[- ]?e/i, "DALL-E"],
    [/midjourney/i, "Midjourney"],
    [/stable diffusion/i, "Stable Diffusion"],
    [/firefly/i, "Adobe Firefly"],
    [/comfyui/i, "ComfyUI"],
  ];

  return modelPatterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function buildAiFootprint(
  activeManifest: Manifest | null,
  actions: ProvenanceAction[],
  hasManifest: boolean,
): AiFootprintSummary {
  if (!hasManifest) {
    return {
      status: "unknown",
      model: null,
      signals: ["未检测到可展开的 C2PA manifest。"],
    };
  }

  const signals: string[] = [];
  const generator = getGenerator(activeManifest);
  const haystack = [
    generator,
    activeManifest?.claim_generator,
    activeManifest?.title,
    ...actions.flatMap((action) => [
      action.action,
      action.softwareAgent,
      action.digitalSourceType,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
  const lowerHaystack = haystack.toLowerCase();
  const aiSourceAction = actions.find((action) =>
    /trainedalgorithmic|algorithmicmedia|softwareimage|digitalcreation|synthetic/i.test(
      action.digitalSourceType ?? "",
    ),
  );
  const aiGenerator = /openai|gpt|dall|midjourney|stable diffusion|firefly|genai|comfyui/.test(
    lowerHaystack,
  );

  if (aiSourceAction?.digitalSourceType) {
    signals.push(`Digital Source Type: ${aiSourceAction.digitalSourceType}`);
  }

  if (generator && aiGenerator) {
    signals.push(`Claim Generator: ${generator}`);
  }

  const softwareAgent = actions.find((action) =>
    /openai|gpt|dall|midjourney|stable diffusion|firefly|genai|comfyui/i.test(
      action.softwareAgent ?? "",
    ),
  )?.softwareAgent;

  if (softwareAgent) {
    signals.push(`Software Agent: ${softwareAgent}`);
  }

  if (!signals.length) {
    return {
      status: "not_detected",
      model: null,
      signals: ["C2PA 中暂未发现明确 AI 生成来源字段。"],
    };
  }

  return {
    status: "detected",
    model: softwareAgent ?? detectModelName(haystack) ?? "GenAI",
    signals,
  };
}

function emptyProvenanceSummary(
  status: ProvenanceSummary["status"],
  summary: string,
): ProvenanceSummary {
  return {
    status,
    summary,
    validationState: null,
    activeManifest: null,
    generator: null,
    title: null,
    validationMessages: [],
    details: [
      {
        label: "C2PA Status",
        value: "无",
      },
    ],
    claimGeneratorInfo: [],
    signature: [],
    assertions: [],
    actions: [],
    aiFootprint: {
      status: "unknown",
      model: null,
      signals: ["未检测到可展开的 C2PA manifest。"],
    },
  };
}

function summarizeManifestStore(store: ManifestStore): ProvenanceSummary {
  const validationState = store.validation_state ?? null;
  const activeManifestLabel = store.active_manifest ?? null;
  const activeManifest =
    activeManifestLabel && store.manifests
      ? store.manifests[activeManifestLabel]
      : null;
  const validationMessages = summarizeValidationMessages(store.validation_status);
  const actions = extractActions(activeManifest?.assertions);
  const details = buildDetails(
    validationState,
    activeManifestLabel,
    activeManifest,
    validationMessages,
  );
  const claimGeneratorInfo = buildClaimGeneratorInfo(activeManifest);
  const signature = buildSignatureFields(activeManifest?.signature_info);
  const assertions = buildAssertionFields(activeManifest?.assertions);
  const aiFootprint = buildAiFootprint(activeManifest, actions, Boolean(activeManifest));
  const base = {
    validationState,
    activeManifest: activeManifestLabel,
    generator: getGenerator(activeManifest),
    title: activeManifest?.title || null,
    validationMessages,
    details,
    claimGeneratorInfo,
    signature,
    assertions,
    actions,
    aiFootprint,
  };

  if (validationState === "Trusted") {
    return {
      ...base,
      status: "trusted",
      summary: "检测到可信的 Content Credentials，可用于辅助追溯来源。",
    };
  }

  if (validationState === "Valid") {
    return {
      ...base,
      status: "valid",
      summary: "检测到可验证的 Content Credentials，但仍需结合上下文判断。",
    };
  }

  if (validationState === "Invalid") {
    return {
      ...base,
      status: "invalid",
      summary: "检测到 Content Credentials，但校验未通过，应重点核对来源链路。",
    };
  }

  return {
    ...base,
    status: "missing",
    summary: "未检测到可验证的 Content Credentials。没有凭证不等于图像异常。",
  };
}

export async function verifyProvenance(file: File): Promise<ProvenanceSummary> {
  try {
    const sdk = await getSdk();
    const reader = await sdk.reader.fromBlob(file.type, file);

    if (!reader) {
      return emptyProvenanceSummary(
        "missing",
        "未检测到可验证的 Content Credentials。没有凭证不等于图像异常。",
      );
    }

    try {
      const manifestStore = await reader.manifestStore();
      return summarizeManifestStore(manifestStore);
    } finally {
      await reader.free();
    }
  } catch (error) {
    return emptyProvenanceSummary(
      "error",
      error instanceof Error
        ? `C2PA 校验未完成：${error.message}`
        : "C2PA 校验未完成，已自动降级到其他本地证据。",
    );
  }
}
