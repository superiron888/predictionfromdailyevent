import OpenAI from "openai";

export type RoiPhase = "think" | "write" | "judge" | "verify" | "search" | "other";

export interface RoiPricingConfig {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  searchUsdPerCall: number;
  extraToolUsdPerCall: number;
}

export interface RoiPhaseUsage {
  calls: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RoiTracker {
  model: string;
  question?: string;
  routeName?: string;
  currentPhase: RoiPhase;
  startedAtMs: number;
  pricing: RoiPricingConfig;
  modelCalls: number;
  searchCalls: number;
  extraToolCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  searchLatencyMs: number;
  phaseUsage: Record<RoiPhase, RoiPhaseUsage>;
}

export interface RoiRunSummary {
  model: string;
  question?: string;
  routeName?: string;
  modelCalls: number;
  searchCalls: number;
  extraToolCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  wallTimeMs: number;
  modelLatencyMs: number;
  searchLatencyMs: number;
  inputCostUsd: number;
  outputCostUsd: number;
  modelCostUsd: number;
  searchCostUsd: number;
  extraToolCostUsd: number;
  allInCostUsd: number;
  qualityScore: number | null;
  roiScore: number | null;
  speedScore: number | null;
  phaseUsage: Record<RoiPhase, RoiPhaseUsage>;
}

function emptyPhaseUsage(): RoiPhaseUsage {
  return {
    calls: 0,
    latencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

export function loadRoiPricingFromEnv(): RoiPricingConfig {
  return {
    inputUsdPer1M: Number(process.env.ROI_MODEL_INPUT_USD_PER_1M ?? "0"),
    outputUsdPer1M: Number(process.env.ROI_MODEL_OUTPUT_USD_PER_1M ?? "0"),
    searchUsdPerCall: Number(process.env.ROI_SEARCH_USD_PER_CALL ?? "0"),
    extraToolUsdPerCall: Number(process.env.ROI_EXTRA_TOOL_USD_PER_CALL ?? "0"),
  };
}

export function createRoiTracker(input: {
  model: string;
  question?: string;
  routeName?: string;
  pricing?: RoiPricingConfig;
}): RoiTracker {
  return {
    model: input.model,
    question: input.question,
    routeName: input.routeName,
    currentPhase: "other",
    startedAtMs: Date.now(),
    pricing: input.pricing ?? loadRoiPricingFromEnv(),
    modelCalls: 0,
    searchCalls: 0,
    extraToolCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    searchLatencyMs: 0,
    phaseUsage: {
      think: emptyPhaseUsage(),
      write: emptyPhaseUsage(),
      judge: emptyPhaseUsage(),
      verify: emptyPhaseUsage(),
      search: emptyPhaseUsage(),
      other: emptyPhaseUsage(),
    },
  };
}

export function setRoiPhase(tracker: RoiTracker, phase: RoiPhase): void {
  tracker.currentPhase = phase;
}

export function setRoiRouteName(tracker: RoiTracker, routeName: string): void {
  tracker.routeName = routeName;
}

export function recordModelUsage(
  tracker: RoiTracker,
  input: {
    phase?: RoiPhase;
    latencyMs: number;
    usage?: OpenAI.Completions.CompletionUsage | null;
  }
): void {
  const phase = input.phase ?? tracker.currentPhase ?? "other";
  const usage = input.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

  tracker.modelCalls += 1;
  tracker.promptTokens += promptTokens;
  tracker.completionTokens += completionTokens;
  tracker.totalTokens += totalTokens;

  const bucket = tracker.phaseUsage[phase] ?? tracker.phaseUsage.other;
  bucket.calls += 1;
  bucket.latencyMs += input.latencyMs;
  bucket.promptTokens += promptTokens;
  bucket.completionTokens += completionTokens;
  bucket.totalTokens += totalTokens;
}

export function recordSearchUsage(
  tracker: RoiTracker,
  input: { queries?: number; latencyMs: number }
): void {
  const calls = Math.max(1, input.queries ?? 1);
  tracker.searchCalls += calls;
  tracker.searchLatencyMs += input.latencyMs;

  const bucket = tracker.phaseUsage.search;
  bucket.calls += calls;
  bucket.latencyMs += input.latencyMs;
}

export function recordExtraToolUsage(
  tracker: RoiTracker,
  input?: { calls?: number }
): void {
  tracker.extraToolCalls += Math.max(1, input?.calls ?? 1);
}

export function finalizeRoiTracker(
  tracker: RoiTracker,
  input?: { wallTimeMs?: number; qualityScore?: number | null }
): RoiRunSummary {
  const wallTimeMs = input?.wallTimeMs ?? Date.now() - tracker.startedAtMs;
  const inputCostUsd = (tracker.promptTokens / 1_000_000) * tracker.pricing.inputUsdPer1M;
  const outputCostUsd =
    (tracker.completionTokens / 1_000_000) * tracker.pricing.outputUsdPer1M;
  const modelCostUsd = inputCostUsd + outputCostUsd;
  const searchCostUsd = tracker.searchCalls * tracker.pricing.searchUsdPerCall;
  const extraToolCostUsd = tracker.extraToolCalls * tracker.pricing.extraToolUsdPerCall;
  const allInCostUsd = modelCostUsd + searchCostUsd + extraToolCostUsd;
  const qualityScore = input?.qualityScore ?? null;
  const roiScore = qualityScore != null && allInCostUsd > 0 ? qualityScore / allInCostUsd : null;
  const speedScore = qualityScore != null && wallTimeMs > 0 ? qualityScore / wallTimeMs : null;

  const modelLatencyMs =
    tracker.phaseUsage.think.latencyMs +
    tracker.phaseUsage.write.latencyMs +
    tracker.phaseUsage.judge.latencyMs +
    tracker.phaseUsage.verify.latencyMs +
    tracker.phaseUsage.other.latencyMs;

  return {
    model: tracker.model,
    question: tracker.question,
    routeName: tracker.routeName,
    modelCalls: tracker.modelCalls,
    searchCalls: tracker.searchCalls,
    extraToolCalls: tracker.extraToolCalls,
    promptTokens: tracker.promptTokens,
    completionTokens: tracker.completionTokens,
    totalTokens: tracker.totalTokens,
    wallTimeMs,
    modelLatencyMs,
    searchLatencyMs: tracker.searchLatencyMs,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    modelCostUsd: roundUsd(modelCostUsd),
    searchCostUsd: roundUsd(searchCostUsd),
    extraToolCostUsd: roundUsd(extraToolCostUsd),
    allInCostUsd: roundUsd(allInCostUsd),
    qualityScore,
    roiScore: roiScore == null ? null : roundUsd(roiScore),
    speedScore: speedScore == null ? null : Number(speedScore.toFixed(6)),
    phaseUsage: tracker.phaseUsage,
  };
}

export function createTrackedOpenAIClient(client: OpenAI, tracker: RoiTracker): OpenAI {
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);
  const trackedCreate = ((...args: Parameters<typeof originalCreate>) => {
    const phase = tracker.currentPhase;
    const startedAt = Date.now();
    const request = originalCreate(...args);
    void request.then((response) => {
      recordModelUsage(tracker, {
        phase,
        latencyMs: Date.now() - startedAt,
        usage:
          response && typeof response === "object" && "usage" in response
            ? (response.usage ?? undefined)
            : undefined,
      });
    });
    return request;
  }) as typeof client.chat.completions.create;

  const trackedClient = Object.create(client) as OpenAI;
  (trackedClient as OpenAI & { chat: typeof client.chat }).chat = Object.create(client.chat);
  trackedClient.chat.completions = Object.create(client.chat.completions);
  trackedClient.chat.completions.create = trackedCreate;
  return trackedClient;
}
