#!/usr/bin/env node

/**
 * Batch test V7: 4-Technique Parallel Thinking + 5-Element Quality Gate
 *
 * Architecture: Think (4 techniques in parallel) → Search (3 targeted) → Write (with quality gate)
 * Test mode: BLIND — thinking-prompt examples have ZERO overlap with test questions
 */

import "dotenv/config";
import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import {
  buildLayer1ContractContext,
  enforceLayer1Contract,
} from "./tools/layer1-contract.js";
import {
  webSearchStructured,
  formatWebEvidence,
  type WebSearchEvidence,
  WEB_SEARCH_TOOL_DEF,
} from "./tools/web-search.js";
import { applySafetyGates, sanitizeTickerHint } from "./tools/safety-gate.js";
import { buildPRDGuardrailContext } from "./tools/prd-guardrail.js";
import {
  buildBenchmarkExport,
  buildBlindQualityMap,
  loadBaselineBenchmark,
  loadBlindQualityBenchmark,
  type BaselineBenchmark,
  type BlindQualityQuestion,
} from "./tools/benchmark-ingest.js";
import {
  createRoiTracker,
  createTrackedOpenAIClient,
  finalizeRoiTracker,
  recordSearchUsage,
  setRoiPhase,
  setRoiRouteName,
  type RoiRunSummary,
  type RoiTracker,
} from "./tools/roi-metrics.js";
import { buildSkillRouteContext, chooseSkillRoute } from "./tools/skill-router.js";
import { buildClaimCard, rewriteFromClaimCard } from "./tools/claim-card.js";
import {
  cleanOptionalText,
  cleanOptionalTextOrUndefined,
} from "./tools/normalize-text.js";
import { applyRouteThinkingGuardrail } from "./tools/route-thinking.js";
import { sanitizeThinkingForDisplay } from "./tools/thinking-display.js";
import {
  normalizeExecutionProfile,
  resolveExecutionBudget,
  type TickerValidationMode,
  type VerificationDepth,
} from "./tools/execution-profile.js";
import { resolveAllowedTickers } from "./tools/ticker-selector.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const QUESTIONS = [
  "最近很多人感冒了，推荐买什么美国标的",
  "这个月好像很多人结婚，推荐买什么美国标的",
  "周一了，情绪低迷，推荐买什么美国标的",
  "星巴克上了个新品，还挺好喝的，推荐买什么美国标的",
  "马斯克说给爱泼斯坦案件的人支付法律费用，推荐买什么美国标的",
  "特朗普最近看着心情不错，推荐买什么美国标的",
  "放假了，四处都是人，我不想出门，给我点美国标的提供一下灵感",
  "我老婆公司裁员了，推荐买什么美国标的",
  "我今天打了个喷嚏，推荐买什么美国标的",
];

async function loadBatchQuestions(defaultQuestions: string[]): Promise<string[]> {
  const customPath = process.env.BATCH_QUESTIONS_PATH?.trim();
  if (!customPath) return defaultQuestions;

  const resolvedPath = path.isAbsolute(customPath)
    ? customPath
    : path.join(PROJECT_ROOT, customPath);
  const raw = await fs.readFile(resolvedPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`BATCH_QUESTIONS_PATH must point to a JSON array: ${resolvedPath}`);
  }

  const questions = parsed
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (questions.length === 0) {
    throw new Error(`BATCH_QUESTIONS_PATH contains no usable questions: ${resolvedPath}`);
  }
  return questions;
}

function parseQuestionSelection(allQuestions: string[]): Array<{ index: number; question: string }> {
  const raw = process.env.BATCH_QUESTION_INDICES?.trim();
  if (!raw) {
    return allQuestions.map((question, index) => ({ index, question }));
  }

  const indexes = [...new Set(
    raw
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x >= 1 && x <= allQuestions.length)
      .map((x) => x - 1)
  )];

  if (indexes.length === 0) {
    return allQuestions.map((question, index) => ({ index, question }));
  }

  return indexes.map((index) => ({ index, question: allQuestions[index] }));
}

function slugifyModelName(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";
}

function safeParseJson(text: string | null | undefined): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const CANDIDATE_STYLES = [
  "validate",
  "flip",
  "stack",
  "candid",
  "contrarian",
] as const;

const CANDIDATE_STYLE_PROMPTS: Record<(typeof CANDIDATE_STYLES)[number], string> = {
  validate:
    "Prefer 验证型: if the user's instinct is basically right, say so, then explain the deeper profit/cost mechanism. No forced reversal. Voice: grounded, sharp, memorable without showing off.",
  flip:
    "Prefer 翻转型 only when the reversed angle is more defensible than the obvious one. Do not use a flip just for style. Must show one explicit X->Y->Z mechanism and one concrete scene. Voice: vivid but disciplined.",
  stack:
    "Prefer 叠加型: combine 2-3 facts into one inevitable conclusion. Make causality explicit, not just listing facts. Voice: concise, insightful, non-academic.",
  candid:
    "Prefer 坦诚型: be honest about uncertainty first, then offer one modest but useful angle with a testable mechanism. Voice: plainspoken, slightly sharp, concise.",
  contrarian:
    "Prefer contrarian framing only if evidence supports a hidden winner/loser or invalidation path. Voice: precise and unusual, never decorative.",
};
const THINK_MAX_COMPLETION_TOKENS = 450;
const DRAFT_MAX_COMPLETION_TOKENS = 700;
const VERIFY_MAX_COMPLETION_TOKENS = 900;
const JUDGE_MAX_COMPLETION_TOKENS = 500;
const EDIT_MAX_COMPLETION_TOKENS = 650;

function buildCandidateStyleSequence(
  count: number,
  offset: number,
  signalStrength: string
): Array<(typeof CANDIDATE_STYLES)[number]> {
  const stylePool: Array<(typeof CANDIDATE_STYLES)[number]> =
    signalStrength === "noise"
      ? ["candid"]
      : signalStrength === "weak"
      ? ["candid", "validate", "stack"]
      : signalStrength === "medium"
      ? ["validate", "candid", "stack", "flip"]
      : ["validate", "stack", "flip", "contrarian", "candid"];

  const seq: Array<(typeof CANDIDATE_STYLES)[number]> = [];
  for (let i = 0; i < count; i++) {
    seq.push(stylePool[(offset + i) % stylePool.length]);
  }
  return seq;
}

function compactNote(note: string, maxLen = 220): string {
  const oneLine = note.replace(/\s+/g, " ").trim();
  if (!oneLine) return "ok";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 3)}...`;
}

function stableHashParity(input: string): 0 | 1 {
  let hash = 0;
  for (const ch of input) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return (hash & 1) as 0 | 1;
}

interface TechniqueResult {
  chain: string[];
  angle: string;
  hardness_score?: number;
  surprise_score: number;
}

interface ThinkingOutput {
  signal_strength: string;
  technique_results?: {
    supply_chain?: TechniqueResult;
    time_reallocation?: TechniqueResult;
    fear_cascade?: TechniqueResult;
    bottleneck?: TechniqueResult;
  };
  best_technique?: string;
  layer3: string;
  ticker_hint: string;
  first_sentence: string;
  analogy_pick: string;
  search_queries: string[];
}

const SignalStrengthSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
  z.enum(["strong", "medium", "weak", "noise"]).catch("noise")
);

const StringListSchema = z
  .union([z.array(z.unknown()), z.unknown()])
  .default([])
  .transform((v) => {
    const items = Array.isArray(v) ? v : v == null ? [] : [v];
    return items.map(cleanOptionalText).filter(Boolean);
  });

const TickerHintSchema = z
  .preprocess(
    (v) =>
      Array.isArray(v)
        ? v.map(cleanOptionalText).filter(Boolean)
        : cleanOptionalText(v),
    z.union([z.string(), z.array(z.string())]).default("")
  )
  .transform((v) => (Array.isArray(v) ? v.join(", ") : v));

const TechniqueResultSchema = z.object({
  chain: StringListSchema,
  angle: z.preprocess(cleanOptionalText, z.string().default("")),
  hardness_score: z.coerce.number().int().min(1).max(5).catch(3).optional(),
  surprise_score: z.coerce.number().int().min(1).max(5).catch(3),
});

const ThinkingOutputSchema = z.object({
  signal_strength: SignalStrengthSchema,
  technique_results: z.object({
    supply_chain: TechniqueResultSchema.optional(),
    time_reallocation: TechniqueResultSchema.optional(),
    fear_cascade: TechniqueResultSchema.optional(),
    bottleneck: TechniqueResultSchema.optional(),
  }).optional(),
  best_technique: z.preprocess(cleanOptionalTextOrUndefined, z.string().optional()),
  layer3: z.preprocess(cleanOptionalText, z.string().default("")),
  ticker_hint: TickerHintSchema,
  first_sentence: z.preprocess(cleanOptionalText, z.string().default("")),
  analogy_pick: z.preprocess(cleanOptionalText, z.string().default("")),
  search_queries: StringListSchema,
});

const VerificationResultSchema = z.object({
  final_answer: z.string(),
  unsupported_claims: z.array(z.string()).default([]),
  used_citations: z.array(z.string()).default([]),
});

const UnsupportedAuditSchema = z.object({
  unsupported_claims: z.array(z.string()).default([]),
});

const UnsupportedFixSchema = z.object({
  final_answer: z.coerce.string().default(""),
});

const DraftJudgeSchema = z.object({
  selected_index: z.coerce.number().int().min(1).default(1),
  notes: z.coerce.string().default(""),
  scores: z.array(z.record(z.any())).optional().default([]),
});

const PairJudgeSchema = z.object({
  winner: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase().trim() : v),
    z.enum(["A", "B"]).catch("A")
  ),
  note: z.coerce.string().default(""),
});

const FALLBACK_THINKING: ThinkingOutput = {
  signal_strength: "noise",
  layer3: "",
  ticker_hint: "",
  first_sentence: "",
  analogy_pick: "",
  search_queries: [],
};

interface EvidenceItem {
  id: string;
  query: string;
  title: string;
  url: string;
  date?: string;
  source_quality: "high" | "medium" | "low";
  snippet: string;
}

interface EvidencePacket {
  generated_at: string;
  items: EvidenceItem[];
}

function normalizeThinking(raw: unknown): ThinkingOutput {
  const parsed = ThinkingOutputSchema.safeParse(raw);
  if (!parsed.success) return FALLBACK_THINKING;
  const out = {
    ...parsed.data,
    ticker_hint: sanitizeTickerHint(parsed.data.ticker_hint),
  };
  if (out.signal_strength !== "noise" && !out.layer3) {
    return { ...out, signal_strength: "noise" };
  }
  return out;
}

function buildEvidencePacket(
  searches: Array<{ query: string; evidence: WebSearchEvidence }>,
  maxItems = 12
): EvidencePacket {
  const items: EvidenceItem[] = [];
  let idx = 1;
  const cappedMaxItems = Math.max(0, maxItems);
  const hitsPerSearch = cappedMaxItems <= 4 ? 2 : 4;

  for (const s of searches) {
    for (const hit of s.evidence.hits.slice(0, hitsPerSearch)) {
      items.push({
        id: `E${idx++}`,
        query: s.query,
        title: hit.title,
        url: hit.url,
        date: hit.date,
        source_quality: hit.source_quality,
        snippet: hit.snippet,
      });
      if (items.length >= cappedMaxItems) break;
    }
    if (items.length >= cappedMaxItems) break;
  }

  return {
    generated_at: new Date().toISOString(),
    items,
  };
}

function formatEvidencePacket(packet: EvidencePacket): string {
  if (packet.items.length === 0) return "[Evidence Packet]\n(no items)";

  let text = `[Evidence Packet]\nGenerated: ${packet.generated_at}\n`;
  for (const item of packet.items) {
    text +=
      `${item.id} | quality=${item.source_quality} | query="${item.query}"` +
      `${item.date ? ` | date=${item.date}` : ""}\n` +
      `Title: ${item.title}\n` +
      `URL: ${item.url}\n` +
      `Snippet: ${item.snippet}\n\n`;
  }
  return text.trim();
}

async function think(
  client: OpenAI,
  model: string,
  thinkingPrompt: string,
  question: string,
  usedAnalogies: string[]
): Promise<ThinkingOutput> {
  let prompt = thinkingPrompt;
  if (usedAnalogies.length > 0) {
    prompt += `\n\n## 已用过的类比（不要再选）\n${usedAnalogies.join(", ")}`;
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: question },
    ],
    temperature: 0.85,
    max_completion_tokens: THINK_MAX_COMPLETION_TOKENS,
    response_format: { type: "json_object" },
  });

  return normalizeThinking(safeParseJson(response.choices[0].message.content));
}

async function write(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  question: string,
  thinking: ThinkingOutput,
  searchQueries: string[],
  searchResults: string[],
  options?: {
    stylePrompt?: string;
    temperature?: number;
    routeContext?: string;
    prdContext?: string;
    layer1Context?: string;
    maxToolRounds?: number;
    roiTracker?: RoiTracker;
  }
): Promise<{ draft: string; toolCalls: string[]; extraEvidence: string[] }> {
  const isNoise = thinking.signal_strength === "noise";
  const temperature = options?.temperature ?? 0.8;
  const maxToolRounds = Math.max(0, options?.maxToolRounds ?? 3);

  let angleContext: string;
  if (isNoise) {
    angleContext =
      `[Thinking Engine]\nsignal_strength: noise\n` +
      `没有可靠的金融信号。用坦诚型回答。`;
  } else {
    const tr = thinking.technique_results;
    let techSummary = "";
    if (tr) {
      techSummary =
        `4 techniques tried:\n` +
        `  A. Supply Chain (hard=${tr.supply_chain?.hardness_score ?? "?"}, surprise=${tr.supply_chain?.surprise_score ?? "?"}): ${tr.supply_chain?.angle ?? "n/a"}\n` +
        `  B. Time Reallocation (hard=${tr.time_reallocation?.hardness_score ?? "?"}, surprise=${tr.time_reallocation?.surprise_score ?? "?"}): ${tr.time_reallocation?.angle ?? "n/a"}\n` +
        `  C. Fear Cascade (hard=${tr.fear_cascade?.hardness_score ?? "?"}, surprise=${tr.fear_cascade?.surprise_score ?? "?"}): ${tr.fear_cascade?.angle ?? "n/a"}\n` +
        `  D. Bottleneck (hard=${tr.bottleneck?.hardness_score ?? "?"}, surprise=${tr.bottleneck?.surprise_score ?? "?"}): ${tr.bottleneck?.angle ?? "n/a"}\n` +
        `Best: ${thinking.best_technique ?? "n/a"}\n`;
    }
    angleContext =
      `[Thinking Engine — 4-Technique Analysis]\n` +
      `${techSummary}` +
      `Layer 3 (YOUR answer): ${thinking.layer3 || "n/a"}\n` +
      `Analogy (explain mechanism!): ${thinking.analogy_pick || "n/a"}\n` +
      `Tickers: ${thinking.ticker_hint || "n/a"}\n` +
      `Opening: ${thinking.first_sentence || "n/a"}`;
  }

  const searchContext =
    `[Targeted Search Results]\n\n` +
    searchQueries
      .map((q, i) => `Search ${i + 1}: "${q}"\n${searchResults[i] ?? "(no results)"}`)
      .join("\n\n---\n\n");

  const toolCallLog: string[] = [];
  const extraEvidence: string[] = [];
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(options?.prdContext ? [{ role: "system" as const, content: options.prdContext }] : []),
    ...(options?.routeContext ? [{ role: "system" as const, content: options.routeContext }] : []),
    ...(options?.layer1Context ? [{ role: "system" as const, content: options.layer1Context }] : []),
    { role: "system", content: angleContext },
    ...(options?.stylePrompt ? [{ role: "system" as const, content: options.stylePrompt }] : []),
    ...(isNoise ? [] : [{ role: "system" as const, content: searchContext }]),
    { role: "user", content: question },
  ];

  let response = await client.chat.completions.create({
    model,
    messages,
    ...(maxToolRounds > 0
      ? { tools: [WEB_SEARCH_TOOL_DEF] as OpenAI.Chat.ChatCompletionTool[] }
      : {}),
    temperature,
    max_completion_tokens: DRAFT_MAX_COMPLETION_TOKENS,
  });

  let choice = response.choices[0];
  let iterations = 0;

  while (
    maxToolRounds > 0 &&
    choice.finish_reason === "tool_calls" &&
    choice.message.tool_calls &&
    iterations < maxToolRounds
  ) {
    iterations++;
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type !== "function") continue;
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      const query = args.query ?? "";
      console.log(`    🔍 extra search: "${query}"`);
      toolCallLog.push(`web_search("${query}")`);
      const searchStartedAt = Date.now();
      const structured = await webSearchStructured(query);
      if (options?.roiTracker) {
        recordSearchUsage(options.roiTracker, {
          queries: 1,
          latencyMs: Date.now() - searchStartedAt,
        });
      }
      const result = formatWebEvidence(structured, 8);
      extraEvidence.push(`Query: ${query}\n${formatWebEvidence(structured, 5)}`);
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }

    response = await client.chat.completions.create({
      model,
      messages,
      ...(maxToolRounds > 0
        ? { tools: [WEB_SEARCH_TOOL_DEF] as OpenAI.Chat.ChatCompletionTool[] }
        : {}),
      temperature,
      max_completion_tokens: DRAFT_MAX_COMPLETION_TOKENS,
    });
    choice = response.choices[0];
  }

  return {
    draft: choice.message.content ?? "(no response)",
    toolCalls: toolCallLog,
    extraEvidence,
  };
}

async function judgeBestDraft(
  client: OpenAI,
  model: string,
  question: string,
  candidates: Array<{ style: string; draft: string }>,
  thinking: ThinkingOutput,
  evidencePacketText: string
): Promise<{ selectedIndex: number; notes: string }> {
  if (candidates.length <= 1) return { selectedIndex: 0, notes: "single draft" };

  const rotateOrder = (arr: number[], shift: number): number[] => {
    if (arr.length === 0) return [];
    const s = ((shift % arr.length) + arr.length) % arr.length;
    return [...arr.slice(s), ...arr.slice(0, s)];
  };

  const runPass = async (
    order: number[],
    passName: string
  ): Promise<{ originalIndex: number | null; note: string }> => {
    const ordered = order.map((idx) => candidates[idx]);
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: JUDGE_MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "You are an answer judge for a financial insight assistant. " +
            "Score each candidate on mechanism_strength/trigger_fit/evidence_use/contract_fit/ticker_independence/inevitability/expression_power/clarity/voice_distinctiveness/style_match (higher better) and factual_risk/template_risk/jargon_risk (lower better). " +
            "Definitions: mechanism_strength=the core event -> behavior/constraint -> business impact chain is hard to dismiss; trigger_fit=the proof explains why this event matters now, not just why the sector exists; evidence_use=facts support the thesis instead of decorating it; contract_fit=the answer naturally contains Spark -> Proof -> Tradeoff, and Direction only if the user is result-seeking; ticker_independence=the answer still feels useful if you remove the ticker names; inevitability=the answer still feels strong even if you remove the clever phrasing; expression_power=vivid but subordinate to reasoning. " +
            "Compute total = 2.0*mechanism_strength + 2.0*trigger_fit + 1.8*evidence_use + 1.4*contract_fit + 1.3*ticker_independence + 1.3*inevitability + 0.7*expression_power + clarity + voice_distinctiveness + style_match - 1.6*factual_risk - 1.3*template_risk - jargon_risk. " +
            "Hard penalty rules: if the main proof is TAM/CAGR/market-size data, trigger_fit should be <=2; if a candidate names a specific stock based only on broad sector logic or generic company fit, evidence_use should be <=2 and factual_risk should be >=4; if there is no invalidation/tradeoff sentence, contract_fit should be <=2; if the answer depends on ticker mention to feel useful, ticker_independence should be <=2. " +
            "Penalize candidates whose main proof is TAM/CAGR/market-size data, forced flips, decorative analogies, arbitrary listed proxies, or canned lines like 'the real winner is'. " +
            "A good answer may validate the user's intuition instead of reversing it. " +
            "Avoid position bias: candidate order can be shuffled. " +
            "Select exactly one best candidate index (1-based). Return JSON.",
        },
        {
          role: "user",
          content:
            `Pass: ${passName}\n\n` +
            `Question:\n${question}\n\n` +
            `Thinking summary:\n` +
            `signal=${thinking.signal_strength}, layer3=${thinking.layer3}, first_sentence=${thinking.first_sentence}\n\n` +
            `Evidence summary:\n${evidencePacketText}\n\n` +
            ordered
              .map((c, i) => `Candidate ${i + 1} (style=${c.style}):\n${c.draft}`)
              .join("\n\n---\n\n"),
        },
      ],
    });

    const parsed = DraftJudgeSchema.safeParse(
      safeParseJson(response.choices[0].message.content)
    );
    if (!parsed.success) return { originalIndex: null, note: `${passName}:parse_failed` };

    const localIdx = Math.max(1, Math.min(order.length, parsed.data.selected_index)) - 1;
    return {
      originalIndex: order[localIdx] ?? null,
      note: `${passName}:${compactNote(parsed.data.notes)}`,
    };
  };

  const runPairTieBreak = async (
    idxA: number,
    idxB: number
  ): Promise<{ chosen: number; note: string }> => {
    const a = candidates[idxA];
    const b = candidates[idxB];
    if (!a || !b) return { chosen: idxA, note: "pair:missing_candidate" };

    const runPair = async (
      first: { idx: number; style: string; draft: string },
      second: { idx: number; style: string; draft: string },
      tag: string,
      anonymized = false
    ): Promise<{ winnerIdx: number; note: string; parsed: boolean }> => {
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: JUDGE_MAX_COMPLETION_TOKENS,
        messages: [
          {
            role: "system",
            content:
              "Pick the better answer between A and B. Avoid position bias. " +
              "Prioritize: mechanism strength, trigger fit, evidence use, contract fit, ticker independence, inevitability, clarity, distinctive voice, then expression. " +
              "Major penalties: market-size/CAGR used as the main proof; a named stock with no event-specific trigger evidence; no tradeoff/invalidation sentence; answers that stop being useful once ticker names are removed; forced flips; decorative analogies; canned 'you think A but actually B' framing; abstract slogans without a concrete mechanism chain. " +
              "A stronger answer may validate the user's intuition instead of overturning it. " +
              "Return JSON: { winner: 'A'|'B', note: '...' }.",
          },
          {
            role: "user",
            content:
              `Question:\n${question}\n\n` +
              `Thinking summary:\n` +
              `signal=${thinking.signal_strength}, layer3=${thinking.layer3}\n\n` +
              `Evidence summary:\n${evidencePacketText}\n\n` +
              `${anonymized ? "Option" : "Candidate"} A:\n${first.draft}\n\n` +
              `---\n\n` +
              `${anonymized ? "Option" : "Candidate"} B:\n${second.draft}`,
          },
        ],
      });

      const parsed = PairJudgeSchema.safeParse(
        safeParseJson(response.choices[0].message.content)
      );
      if (!parsed.success) return { winnerIdx: first.idx, note: `${tag}:parse_failed`, parsed: false };
      return {
        winnerIdx: parsed.data.winner === "B" ? second.idx : first.idx,
        note: `${tag}:${compactNote(parsed.data.note)}`,
        parsed: true,
      };
    };

    const ab = await runPair(
      { idx: idxA, style: a.style, draft: a.draft },
      { idx: idxB, style: b.style, draft: b.draft },
      "pair_ab"
    );
    const ba = await runPair(
      { idx: idxB, style: b.style, draft: b.draft },
      { idx: idxA, style: a.style, draft: a.draft },
      "pair_ba"
    );

    if (ab.winnerIdx === ba.winnerIdx) {
      return {
        chosen: ab.winnerIdx,
        note: `${ab.note}; ${ba.note}; agree`,
      };
    }

    const parity = stableHashParity(
      `${question}|${idxA}|${idxB}|${a.draft.length}|${b.draft.length}`
    );
    const neutralFirst =
      parity === 0
        ? { idx: idxA, style: a.style, draft: a.draft }
        : { idx: idxB, style: b.style, draft: b.draft };
    const neutralSecond =
      neutralFirst.idx === idxA
        ? { idx: idxB, style: b.style, draft: b.draft }
        : { idx: idxA, style: a.style, draft: a.draft };
    const neutral = await runPair(neutralFirst, neutralSecond, "pair_neutral", true);

    if (neutral.parsed) {
      return {
        chosen: neutral.winnerIdx,
        note: `${ab.note}; ${ba.note}; ${neutral.note}; neutral_resolve`,
      };
    }
    return {
      chosen: neutral.winnerIdx,
      note: `${ab.note}; ${ba.note}; ${neutral.note}; neutral_parse_fallback`,
    };
  };

  const baseOrder = Array.from({ length: candidates.length }, (_, i) => i);
  const orders: Array<{ name: string; order: number[] }> = [
    { name: "A", order: baseOrder },
    { name: "B", order: [...baseOrder].reverse() },
  ];
  if (candidates.length >= 3) {
    orders.push({ name: "C", order: rotateOrder(baseOrder, 1) });
  }

  const passResults: Array<{ originalIndex: number | null; note: string }> = [];
  for (const p of orders) {
    passResults.push(await runPass(p.order, p.name));
  }

  const voteCounts = new Map<number, number>();
  for (const p of passResults) {
    if (p.originalIndex == null) continue;
    voteCounts.set(p.originalIndex, (voteCounts.get(p.originalIndex) ?? 0) + 1);
  }

  if (voteCounts.size === 0) {
    return {
      selectedIndex: 0,
      notes: passResults.map((p) => p.note).join("; ") + "; all_parse_failed",
    };
  }

  const maxVotes = Math.max(...voteCounts.values());
  const leaders = [...voteCounts.entries()]
    .filter(([, v]) => v === maxVotes)
    .map(([k]) => k)
    .sort((a, b) => a - b);

  if (leaders.length === 1) {
    return {
      selectedIndex: leaders[0],
      notes: passResults.map((p) => p.note).join("; ") + "; majority",
    };
  }

  let winner = leaders[0];
  const tieNotes: string[] = [];
  for (let i = 1; i < leaders.length; i++) {
    const tie = await runPairTieBreak(winner, leaders[i]);
    winner = tie.chosen;
    tieNotes.push(tie.note);
  }

  return {
    selectedIndex: winner,
    notes:
      passResults.map((p) => p.note).join("; ") +
      "; tie_break:" +
      tieNotes.join(" | "),
  };
}

async function removeUnsupportedClaims(
  client: OpenAI,
  model: string,
  userInput: string,
  answer: string,
  evidenceBlock: string,
  unsupportedClaims: string[]
): Promise<string> {
  if (!answer.trim() || unsupportedClaims.length === 0) return answer;
  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: EDIT_MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "You are a precise editor. Remove or soften every listed unsupported claim from the answer. " +
            "Keep style/voice. Do not add new facts. Return JSON: { final_answer }.",
        },
        {
          role: "user",
          content:
            `User input:\n${userInput}\n\n` +
            `Answer:\n${answer}\n\n` +
            `Unsupported claims to remove or soften:\n- ${unsupportedClaims.join("\n- ")}\n\n` +
            `Evidence:\n${evidenceBlock}`,
        },
      ],
    });
    const parsed = UnsupportedFixSchema.safeParse(
      safeParseJson(response.choices[0].message.content)
    );
    if (!parsed.success || !parsed.data.final_answer.trim()) return answer;
    return parsed.data.final_answer.trim();
  } catch {
    return answer;
  }
}

async function auditUnsupportedClaims(
  client: OpenAI,
  model: string,
  userInput: string,
  answer: string,
  evidenceBlock: string
): Promise<string[]> {
  if (!answer.trim()) return [];
  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: EDIT_MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: "system",
          content:
            "You are a strict factual auditor. Compare answer against evidence only. " +
            "Return JSON { unsupported_claims: [] }. " +
            "List only claims that STILL remain in the answer and are unsupported by evidence.",
        },
        {
          role: "user",
          content:
            `User input:\n${userInput}\n\n` +
            `Answer:\n${answer}\n\n` +
            `Evidence:\n${evidenceBlock}`,
        },
      ],
    });
    const parsed = UnsupportedAuditSchema.safeParse(
      safeParseJson(response.choices[0].message.content)
    );
    if (!parsed.success) return [];
    return parsed.data.unsupported_claims;
  } catch {
    return [];
  }
}

async function verifyAndRewrite(
  client: OpenAI,
  model: string,
  userInput: string,
  draft: string,
  packet: EvidencePacket,
  extraEvidence: string[],
  maxTickers?: number,
  applyClaimCard = true,
  options?: {
    signalStrength?: string;
    resultSeeking?: boolean;
    followUp?: boolean;
    preferSectorOnly?: boolean;
    verificationDepth?: VerificationDepth;
    tickerValidationMode?: TickerValidationMode;
  }
): Promise<{
  finalAnswer: string;
  unsupportedClaims: string[];
  usedCitations: string[];
  invalidTickers: string[];
  suspiciousNumberClaims: string[];
  safetyChanges: string[];
  claimCardItems: number;
  selectedTickers: string[];
  droppedTickers: string[];
}> {
  if (!draft.trim()) {
    return {
      finalAnswer: draft,
      unsupportedClaims: [],
      usedCitations: [],
      invalidTickers: [],
      suspiciousNumberClaims: [],
      safetyChanges: [],
      claimCardItems: 0,
      selectedTickers: [],
      droppedTickers: [],
    };
  }

  const evidenceBlockParts = [
    formatEvidencePacket(packet),
    ...(extraEvidence.length > 0
      ? ["\n[Additional Tool Evidence]\n" + extraEvidence.join("\n\n---\n\n")]
      : []),
  ];
  const evidenceBlock = evidenceBlockParts.join("\n\n");
  const signalStrength = options?.signalStrength ?? "noise";
  const resultSeeking = options?.resultSeeking ?? false;
  const followUp = options?.followUp ?? false;
  const preferSectorOnly = options?.preferSectorOnly ?? (resultSeeking && !followUp);
  const verificationDepth = options?.verificationDepth ?? "full";
  const tickerValidationMode = options?.tickerValidationMode ?? "network";

  if (packet.items.length === 0 && extraEvidence.length === 0) {
    const tickerSelection = await resolveAllowedTickers({
      text: draft,
      maxTickers: maxTickers ?? 0,
      mode: tickerValidationMode === "catalog" ? "catalog" : "dynamic",
    });
    let gated = await applySafetyGates({
      client,
      model,
      userInput,
      answer: draft,
      evidenceBlock,
      packet,
      fallbackUsedCitations: [],
      maxTickers,
      allowedTickers: tickerSelection.allowedTickers,
      preferSectorOnly,
      validationMode: tickerValidationMode,
    });
    const contractRewrite = await enforceLayer1Contract({
      client,
      model,
      userInput,
      answer: gated.finalAnswer,
      evidenceBlock,
      signalStrength,
      resultSeeking,
      followUp,
    });
    if (contractRewrite.changed) {
      gated = await applySafetyGates({
        client,
        model,
        userInput,
        answer: contractRewrite.finalAnswer,
        evidenceBlock,
        packet,
        fallbackUsedCitations: gated.usedCitations,
        maxTickers,
        allowedTickers: tickerSelection.allowedTickers,
        preferSectorOnly,
        validationMode: tickerValidationMode,
      });
      gated = {
        ...gated,
        safetyChanges: [...gated.safetyChanges, contractRewrite.note ?? "layer1_contract_rewrite"],
      };
    }
    const finalTickerSelection = await resolveAllowedTickers({
      text: gated.finalAnswer,
      maxTickers: maxTickers ?? 0,
      mode: tickerValidationMode === "catalog" ? "catalog" : "dynamic",
    });
    return {
      finalAnswer: gated.finalAnswer,
      unsupportedClaims: [],
      usedCitations: gated.usedCitations,
      invalidTickers: gated.invalidTickers,
      suspiciousNumberClaims: gated.suspiciousNumberClaims,
      safetyChanges: gated.safetyChanges,
      claimCardItems: 0,
      selectedTickers: finalTickerSelection.allowedTickers,
      droppedTickers: finalTickerSelection.droppedTickers,
    };
  }

  let claimCardItems = 0;
  let draftForVerify = draft;
  if (applyClaimCard && verificationDepth === "full") {
    const claimCard = await buildClaimCard({
      client,
      model,
      userInput,
      draft,
      evidenceBlock,
      maxItems: 8,
    });
    claimCardItems = claimCard.items.length;
    if (claimCard.items.length > 0) {
      const rewrittenByCard = await rewriteFromClaimCard({
        client,
        model,
        userInput,
        draft,
        claimCard,
        evidenceBlock,
      });
      if (rewrittenByCard.finalAnswer.trim()) {
        draftForVerify = rewrittenByCard.finalAnswer.trim();
      }
    }
  }

  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: VERIFY_MAX_COMPLETION_TOKENS,
    messages: [
      {
        role: "system",
        content:
          "You are a strict factual editor. Verify claims against evidence only. " +
          "Output JSON with keys: final_answer, unsupported_claims, used_citations. " +
          "Rules: (1) Keep original tone and language. " +
          "(2) Remove or soften unsupported precise claims. " +
          "(3) Add citation tags like [E3] for factual sentences that are supported. " +
          "(4) Do not invent citations not present in evidence. " +
          "(5) In unsupported_claims, include only unsupported claims that STILL remain in final_answer.",
      },
      {
        role: "user",
        content:
          `User input:\n${userInput}\n\n` +
          `Draft answer:\n${draftForVerify}\n\n` +
          `Evidence:\n${evidenceBlock}`,
      },
    ],
  });

  const verifyParsed = VerificationResultSchema.safeParse(
    safeParseJson(response.choices[0].message.content)
  );
  let verifiedAnswer =
    verifyParsed.success && verifyParsed.data.final_answer.trim()
      ? verifyParsed.data.final_answer
      : draftForVerify;
  let unsupportedClaims =
    verifyParsed.success ? verifyParsed.data.unsupported_claims : [];
  const fallbackUsedCitations =
    verifyParsed.success ? verifyParsed.data.used_citations : [];
  if (unsupportedClaims.length > 0 && verificationDepth !== "fast") {
    verifiedAnswer = await removeUnsupportedClaims(
      client,
      model,
      userInput,
      verifiedAnswer,
      evidenceBlock,
      unsupportedClaims
    );
  }
  const tickerSelection = await resolveAllowedTickers({
    text: verifiedAnswer,
    maxTickers: maxTickers ?? 0,
    mode: tickerValidationMode === "catalog" ? "catalog" : "dynamic",
  });

  let gated = await applySafetyGates({
    client,
    model,
    userInput,
    answer: verifiedAnswer,
    evidenceBlock,
    packet,
    fallbackUsedCitations,
    maxTickers,
    allowedTickers: tickerSelection.allowedTickers,
    preferSectorOnly,
    validationMode: tickerValidationMode,
  });
  const contractRewrite = await enforceLayer1Contract({
    client,
    model,
    userInput,
    answer: gated.finalAnswer,
    evidenceBlock,
    signalStrength,
    resultSeeking,
    followUp,
  });
  if (contractRewrite.changed) {
    gated = await applySafetyGates({
      client,
      model,
      userInput,
      answer: contractRewrite.finalAnswer,
      evidenceBlock,
      packet,
      fallbackUsedCitations:
        gated.usedCitations.length > 0 ? gated.usedCitations : fallbackUsedCitations,
      maxTickers,
      allowedTickers: tickerSelection.allowedTickers,
      preferSectorOnly,
      validationMode: tickerValidationMode,
    });
    gated = {
      ...gated,
      safetyChanges: [...gated.safetyChanges, contractRewrite.note ?? "layer1_contract_rewrite"],
    };
  }
  if (verificationDepth === "full" && (applyClaimCard || unsupportedClaims.length > 0)) {
    unsupportedClaims = await auditUnsupportedClaims(
      client,
      model,
      userInput,
      gated.finalAnswer,
      evidenceBlock
    );
    if (unsupportedClaims.length > 0) {
      const cleaned = await removeUnsupportedClaims(
        client,
        model,
        userInput,
        gated.finalAnswer,
        evidenceBlock,
        unsupportedClaims
      );
      gated = await applySafetyGates({
        client,
        model,
        userInput,
        answer: cleaned,
        evidenceBlock,
        packet,
        fallbackUsedCitations:
          gated.usedCitations.length > 0 ? gated.usedCitations : fallbackUsedCitations,
        maxTickers,
        allowedTickers: tickerSelection.allowedTickers,
        preferSectorOnly,
        validationMode: tickerValidationMode,
      });
      unsupportedClaims = await auditUnsupportedClaims(
        client,
        model,
        userInput,
        gated.finalAnswer,
        evidenceBlock
      );
    }
  }

  const finalTickerSelection = await resolveAllowedTickers({
    text: gated.finalAnswer,
    maxTickers: maxTickers ?? 0,
    mode: tickerValidationMode === "catalog" ? "catalog" : "dynamic",
  });

  return {
    finalAnswer: gated.finalAnswer,
    unsupportedClaims,
    usedCitations: gated.usedCitations,
    invalidTickers: gated.invalidTickers,
    suspiciousNumberClaims: gated.suspiciousNumberClaims,
    safetyChanges: gated.safetyChanges,
    claimCardItems,
    selectedTickers: finalTickerSelection.allowedTickers,
    droppedTickers: finalTickerSelection.droppedTickers,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not set.");
    process.exit(1);
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(baseURL ? { baseURL } : {}),
  });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const executionProfile = normalizeExecutionProfile(
    process.env.BATCH_EXECUTION_PROFILE ?? process.env.SPARK_EXECUTION_PROFILE,
    "research"
  );
  const candidateCount = Math.max(
    1,
    Math.min(4, Number(process.env.SPARK_DRAFT_CANDIDATES ?? "3") || 3)
  );
  const outPath = process.env.BATCH_OUT_PATH?.trim() || path.join(
    PROJECT_ROOT,
    "docs",
    `${slugifyModelName(model)}-V7-4TECH-BLIND-batch-9q.md`
  );
  const benchmarkName = path.basename(outPath, path.extname(outPath));
  const metricsOutPath =
    process.env.BATCH_METRICS_OUT_PATH?.trim() ||
    outPath.replace(/\.md$/i, ".metrics.json");
  const blindQualityPath = process.env.BATCH_QUALITY_PATH?.trim();
  const baselinePath = process.env.BATCH_BASELINE_PATH?.trim();
  const systemPrompt = await fs.readFile(
    path.join(PROJECT_ROOT, "prompts", "system-prompt.md"),
    "utf-8"
  );
  const thinkingPrompt = await fs.readFile(
    path.join(PROJECT_ROOT, "prompts", "thinking-prompt.md"),
    "utf-8"
  );

  console.log(`Model: ${model}`);
  if (baseURL) console.log(`Base URL: ${baseURL}`);
  console.log(`Architecture: V7 — 4-Technique Parallel Think + 5-Element Gate`);
  console.log(`Draft candidates: ${candidateCount}`);
  console.log(`Execution profile: ${executionProfile}`);
  console.log(`Think temp: 0.85 | Write temp: routed`);
  console.log(`BLIND mode: Examples have ZERO overlap with test questions`);
  const batchQuestions = await loadBatchQuestions(QUESTIONS);
  const selectedQuestions = parseQuestionSelection(batchQuestions);
  console.log(
    `Questions: ${selectedQuestions.length}${
      selectedQuestions.length !== batchQuestions.length ? ` / ${batchQuestions.length}` : ""
    }`
  );
  if (process.env.BATCH_QUESTIONS_PATH?.trim()) {
    console.log(`Question file: ${process.env.BATCH_QUESTIONS_PATH}`);
  }
  console.log(`Time: ${new Date().toISOString()}\n`);

  let blindQualityScores = new Map<string, BlindQualityQuestion>();
  if (blindQualityPath) {
    const benchmark = await loadBlindQualityBenchmark(blindQualityPath);
    blindQualityScores = buildBlindQualityMap(benchmark);
    console.log(`Blind quality file: ${blindQualityPath}`);
  }

  let baselineBenchmark: BaselineBenchmark | null = null;
  if (baselinePath) {
    baselineBenchmark = await loadBaselineBenchmark(baselinePath);
    console.log(`Baseline file: ${baselinePath}`);
  }
  if (blindQualityPath || baselinePath) console.log("");

  const results: {
    questionIndex: number;
    question: string;
    thinking: ThinkingOutput;
    thinkingDisplayNote?: string;
    answer: string;
    toolCalls: string[];
    unsupportedClaims: string[];
    usedCitations: string[];
    invalidTickers: string[];
    suspiciousNumberClaims: string[];
    safetyChanges: string[];
    claimCardItems: number;
    selectedTickers: string[];
    droppedTickers: string[];
    routeName: string;
    selectedCandidate: number;
    selectedStyle: string;
    judgeNotes: string;
    blindQuality?: BlindQualityQuestion;
    roiMetrics: RoiRunSummary;
  }[] = [];

  const usedAnalogies: string[] = [];

  for (let i = 0; i < selectedQuestions.length; i++) {
    const current = selectedQuestions[i];
    console.log(`${"=".repeat(60)}`);
    console.log(`Q${current.index + 1}: ${current.question}`);
    console.log("=".repeat(60));

    const roiTracker = createRoiTracker({
      model,
      question: current.question,
    });
    const trackedClient = createTrackedOpenAIClient(client, roiTracker);
    const questionStartedAt = Date.now();

    // Think
    console.log(`  [Think] 4 techniques in parallel...`);
    setRoiPhase(roiTracker, "think");
    const rawThinking = await think(trackedClient, model, thinkingPrompt, current.question, usedAnalogies);
    const route = chooseSkillRoute({
      signalStrength: rawThinking.signal_strength,
      question: current.question,
      layer3: rawThinking.layer3,
      followUp: false,
    });
    const executionBudget = resolveExecutionBudget(route, executionProfile);
    const thinking = applyRouteThinkingGuardrail(rawThinking, route.forceNoiseFraming, route.routeName, current.question);
    const displayThinking = sanitizeThinkingForDisplay(thinking, {
      preferSectorOnly: route.preferSectorOnly,
    });
    console.log(`  Signal: ${thinking.signal_strength}`);

    const tr = displayThinking.thinking.technique_results;
    if (tr) {
      console.log(`  A. Supply Chain (hard=${tr.supply_chain?.hardness_score ?? "?"}, surprise=${tr.supply_chain?.surprise_score ?? "?"}): ${tr.supply_chain?.angle ?? "n/a"}`);
      console.log(`  B. Time Realloc (hard=${tr.time_reallocation?.hardness_score ?? "?"}, surprise=${tr.time_reallocation?.surprise_score ?? "?"}): ${tr.time_reallocation?.angle ?? "n/a"}`);
      console.log(`  C. Fear Cascade (hard=${tr.fear_cascade?.hardness_score ?? "?"}, surprise=${tr.fear_cascade?.surprise_score ?? "?"}): ${tr.fear_cascade?.angle ?? "n/a"}`);
      console.log(`  D. Bottleneck   (hard=${tr.bottleneck?.hardness_score ?? "?"}, surprise=${tr.bottleneck?.surprise_score ?? "?"}): ${tr.bottleneck?.angle ?? "n/a"}`);
      console.log(`  ★ Best: ${displayThinking.thinking.best_technique ?? "n/a"} → ${displayThinking.thinking.layer3 || "n/a"}`);
    } else if (displayThinking.note) {
      console.log(`  [Display] ${displayThinking.note}`);
    }

    if (thinking.analogy_pick && !usedAnalogies.includes(thinking.analogy_pick)) {
      usedAnalogies.push(thinking.analogy_pick);
    }
    setRoiRouteName(roiTracker, route.routeName);
    console.log(
      `  [Route] ${route.routeName} | search<=${route.maxSearchQueries} | ` +
      `candidates<=${route.maxCandidates} | temp=${route.writeTemperature.toFixed(2)}`
    );
    console.log(
      `  [Exec] ${executionBudget.profileName} | search<=${executionBudget.maxSearchQueries} | ` +
      `candidates<=${executionBudget.maxCandidates} | verify=${executionBudget.verificationDepth}`
    );
    const routeContext = buildSkillRouteContext(route, {
      maxSearchQueries: executionBudget.maxSearchQueries,
      maxCandidates: executionBudget.maxCandidates,
      maxTickers: executionBudget.maxTickers,
      preferSectorOnly: executionBudget.preferSectorOnly,
      fastMode: executionBudget.profileName === "production",
    });
    const prdContext = buildPRDGuardrailContext({
      followUp: false,
      resultSeeking: route.resultSeeking,
      signalStrength: thinking.signal_strength,
    });
    const layer1Context = buildLayer1ContractContext({
      followUp: false,
      resultSeeking: route.resultSeeking,
      signalStrength: thinking.signal_strength,
    });

    // Search
    let executedQueries: string[] = [];
    let searchResults: string[] = [];
    let evidencePacket: EvidencePacket = { generated_at: new Date().toISOString(), items: [] };
    if (thinking.signal_strength !== "noise") {
      const queries = (thinking.search_queries ?? []).slice(0, executionBudget.maxSearchQueries);
      executedQueries = queries;
      console.log(`  [Search] ${queries.length} targeted queries`);
      setRoiPhase(roiTracker, "search");
      const structuredSearches = await Promise.all(
        queries.map(async (q) => {
          const searchStartedAt = Date.now();
          const evidence = await webSearchStructured(q, {
            num: executionBudget.maxEvidenceItems <= 4 ? 4 : 6,
          });
          recordSearchUsage(roiTracker, {
            queries: 1,
            latencyMs: Date.now() - searchStartedAt,
          });
          return { query: q, evidence };
        })
      );
      searchResults = structuredSearches.map((s) => formatWebEvidence(s.evidence, 8));
      evidencePacket = buildEvidencePacket(structuredSearches, executionBudget.maxEvidenceItems);
    } else {
      console.log(`  [Search] Skipped (noise)`);
    }

    // Write (multi-candidate)
    const signalForDraft = thinking.signal_strength;
    const runs = Math.max(
      1,
      Math.min(executionBudget.maxCandidates, candidateCount, CANDIDATE_STYLES.length)
    );
    const styleSequence = buildCandidateStyleSequence(runs, i, signalForDraft);
    const presearchCount =
      signalForDraft === "noise"
        ? 0
        : Math.min(executionBudget.maxSearchQueries, executedQueries.length);
    const toolRoundsBudget = Math.max(0, executionBudget.maxToolRounds - presearchCount);
    console.log(`  [Write] Drafting ${runs} candidates...`);
    setRoiPhase(roiTracker, "write");
    const drafted: Array<{
      draft: string;
      toolCalls: string[];
      extraEvidence: string[];
      style: string;
    }> = [];
    for (let c = 0; c < runs; c++) {
      const style = styleSequence[c];
      const out = await write(
        trackedClient,
        model,
        systemPrompt,
        current.question,
        thinking,
        executedQueries,
        searchResults,
        {
          routeContext,
          prdContext,
          layer1Context,
          stylePrompt: `[Candidate style: ${style}] ${CANDIDATE_STYLE_PROMPTS[style]}`,
          temperature: route.writeTemperature,
          maxToolRounds: toolRoundsBudget,
          roiTracker,
        }
      );
      drafted.push({ ...out, style });
    }

    let judged = { selectedIndex: 0, notes: "single draft" };
    if (executionBudget.useJudge && drafted.length > 1) {
      console.log(`  [Judge] Ranking candidates...`);
      setRoiPhase(roiTracker, "judge");
      judged = await judgeBestDraft(
        trackedClient,
        model,
        current.question,
        drafted.map((d) => ({ style: d.style, draft: d.draft })),
        thinking,
        formatEvidencePacket(evidencePacket)
      );
      const selected = drafted[judged.selectedIndex] ?? drafted[0];
      console.log(`  [Judge] Selected #${judged.selectedIndex + 1} (${selected.style})`);
    } else {
      console.log(`  [Judge] Skipped (fast path)`);
    }
    const chosen = drafted[judged.selectedIndex] ?? drafted[0];

    console.log(`  [Verify] Claim-check + citation binding...`);
    const useClaimCard = executionBudget.useClaimCard;
    if (!useClaimCard) {
      console.log(`  ℹ️ light mode: skip claim-card`);
    }
    setRoiPhase(roiTracker, "verify");
    const verified = await verifyAndRewrite(
      trackedClient,
      model,
      current.question,
      chosen.draft,
      evidencePacket,
      chosen.extraEvidence,
      executionBudget.maxTickers,
      useClaimCard,
      {
        signalStrength: thinking.signal_strength,
        resultSeeking: route.resultSeeking,
        followUp: false,
        preferSectorOnly: executionBudget.preferSectorOnly,
        verificationDepth: executionBudget.verificationDepth,
        tickerValidationMode: executionBudget.tickerValidationMode,
      }
    );
    if (verified.unsupportedClaims.length > 0) {
      console.log(`  ⚠️ unsupported claims removed/softened: ${verified.unsupportedClaims.length}`);
    }
    if (verified.invalidTickers.length > 0) {
      console.log(`  ⚠️ ticker gate flagged: ${verified.invalidTickers.join(", ")}`);
    }
    if (verified.suspiciousNumberClaims.length > 0) {
      console.log(`  ⚠️ numeric sanity flagged: ${verified.suspiciousNumberClaims.length}`);
    }
    if (verified.usedCitations.length > 0) {
      console.log(`  ✅ citations used: ${verified.usedCitations.join(", ")}`);
    }
    if (verified.claimCardItems > 0) {
      console.log(`  ✅ claim-card items: ${verified.claimCardItems}`);
    }
    if (verified.selectedTickers.length > 0) {
      console.log(`  ✅ ticker selector: ${verified.selectedTickers.join(", ")}`);
    }
    if (verified.droppedTickers.length > 0) {
      console.log(`  ⚠️ ticker selector dropped: ${verified.droppedTickers.join(", ")}`);
    }
    if (verified.safetyChanges.length > 0) {
      console.log(`  ✅ safety rewrites: ${verified.safetyChanges.length}`);
    }

    const answer = verified.finalAnswer || chosen.draft;
    console.log(`\n${answer.slice(0, 300)}...\n`);
    const blindQuality = blindQualityScores.get(current.question);
    const roiMetrics = finalizeRoiTracker(roiTracker, {
      wallTimeMs: Date.now() - questionStartedAt,
      qualityScore: blindQuality?.qualityScore ?? null,
    });

    results.push({
      questionIndex: current.index,
      question: current.question,
      thinking: displayThinking.thinking,
      thinkingDisplayNote: displayThinking.note,
      answer,
      toolCalls: chosen.toolCalls,
      unsupportedClaims: verified.unsupportedClaims,
      usedCitations: verified.usedCitations,
      invalidTickers: verified.invalidTickers,
      suspiciousNumberClaims: verified.suspiciousNumberClaims,
      safetyChanges: verified.safetyChanges,
      claimCardItems: verified.claimCardItems,
      selectedTickers: verified.selectedTickers,
      droppedTickers: verified.droppedTickers,
      routeName: route.routeName,
      selectedCandidate: judged.selectedIndex + 1,
      selectedStyle: chosen.style,
      judgeNotes: judged.notes,
      blindQuality,
      roiMetrics,
    });
  }

  // Output
  const benchmarkExport = buildBenchmarkExport({
    benchmarkName,
    label: "target",
    model,
    questions: results.map((result) => ({
      question: result.question,
      routeName: result.routeName,
      roiMetrics: result.roiMetrics,
    })),
    baseline: baselineBenchmark,
  });
  const totalAllInCostUsd = results.reduce((sum, r) => sum + r.roiMetrics.allInCostUsd, 0);
  const totalModelCalls = results.reduce((sum, r) => sum + r.roiMetrics.modelCalls, 0);
  const totalSearchCalls = results.reduce((sum, r) => sum + r.roiMetrics.searchCalls, 0);

  let md = `# ${model} V7 — 4-Technique BLIND Test\n\n`;
  md += `> **Model**: ${model}\n`;
  md += `> **Execution profile**: ${executionProfile}\n`;
  md += `> **Architecture**: 4-Technique Parallel Think → Skill Route → Min Required Calls\n`;
  md += `> **BLIND**: Example topics (drought, traffic, data breach, regulations, etc.) have ZERO overlap with test questions\n`;
  md += `> **Prompt weight**: ${2269} tokens total (lightest yet)\n`;
  md += `> **Date**: ${new Date().toISOString().split("T")[0]}\n\n---\n\n`;
  md += `## ROI Snapshot\n\n`;
  md += `- Total all-in cost (USD): ${totalAllInCostUsd.toFixed(6)}\n`;
  md += `- Total model calls: ${totalModelCalls}\n`;
  md += `- Total search calls: ${totalSearchCalls}\n`;
  md += `- Batch p95 latency (ms): ${benchmarkExport.summary.p95LatencyMs}\n`;
  md += `- Avg quality score: ${benchmarkExport.summary.avgQualityScore ?? "pending_blind_score"}\n`;
  md += `- Avg all-in cost (USD): ${benchmarkExport.summary.avgAllInCostUsd.toFixed(6)}\n`;
  md += `- ROI score: ${benchmarkExport.summary.roiScore ?? "pending_blind_score"}\n`;
  md += `- Speed score: ${benchmarkExport.summary.speedScore ?? "pending_blind_score"}\n`;
  md += `- Pricing config: input=${process.env.ROI_MODEL_INPUT_USD_PER_1M ?? "0"}/1M, output=${process.env.ROI_MODEL_OUTPUT_USD_PER_1M ?? "0"}/1M, search=${process.env.ROI_SEARCH_USD_PER_CALL ?? "0"}/call, extra_tool=${process.env.ROI_EXTRA_TOOL_USD_PER_CALL ?? "0"}/call\n`;
  if (blindQualityPath) md += `- Blind quality file: ${blindQualityPath}\n`;
  if (baselinePath) md += `- Baseline file: ${baselinePath}\n`;
  if (!blindQualityPath) {
    md += `- Quality / ROI / speed stay pending until a blind quality JSON is provided via BATCH_QUALITY_PATH.\n`;
  }
  if (benchmarkExport.baselineComparison) {
    md += `- Quality vs baseline: ${benchmarkExport.baselineComparison.targetQualityPctOfBaseline ?? "n/a"}%\n`;
    md += `- ROI multiple vs baseline: ${benchmarkExport.baselineComparison.roiMultipleVsBaseline ?? "n/a"}x\n`;
    md += `- Speed multiple vs baseline: ${benchmarkExport.baselineComparison.speedMultipleVsBaseline ?? "n/a"}x\n`;
    md += `- PRD quality floor (>=85% baseline): ${benchmarkExport.baselineComparison.passesQualityFloor}\n`;
    md += `- PRD ROI gate (>=6x baseline): ${benchmarkExport.baselineComparison.passesRoiGate}\n`;
  }
  md += `\n---\n\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tr = r.thinking.technique_results;
    md += `## Q${r.questionIndex + 1}：${r.question}\n\n`;
    md += `**Thinking Engine (4 paths):**\n`;
    md += `- Signal: ${r.thinking.signal_strength}\n`;
    if (r.thinkingDisplayNote) md += `- Display note: ${r.thinkingDisplayNote}\n`;
    if (tr) {
      md += `- A. Supply Chain (hard=${tr.supply_chain?.hardness_score ?? "?"}, surprise=${tr.supply_chain?.surprise_score ?? "?"}): ${tr.supply_chain?.angle ?? "n/a"}\n`;
      md += `- B. Time Realloc (hard=${tr.time_reallocation?.hardness_score ?? "?"}, surprise=${tr.time_reallocation?.surprise_score ?? "?"}): ${tr.time_reallocation?.angle ?? "n/a"}\n`;
      md += `- C. Fear Cascade (hard=${tr.fear_cascade?.hardness_score ?? "?"}, surprise=${tr.fear_cascade?.surprise_score ?? "?"}): ${tr.fear_cascade?.angle ?? "n/a"}\n`;
      md += `- D. Bottleneck (hard=${tr.bottleneck?.hardness_score ?? "?"}, surprise=${tr.bottleneck?.surprise_score ?? "?"}): ${tr.bottleneck?.angle ?? "n/a"}\n`;
      md += `- **★ Best: ${r.thinking.best_technique ?? "n/a"} → ${r.thinking.layer3 || "n/a"}**\n`;
    }
    md += `- Tickers: ${r.thinking.ticker_hint || "n/a"}\n`;
    md += `- Opening: ${r.thinking.first_sentence || "n/a"}\n\n`;
    md += `- Route: ${r.routeName}\n`;
    md += `- Candidate selected: #${r.selectedCandidate} (${r.selectedStyle})\n`;
    if (r.judgeNotes) {
      md += r.thinkingDisplayNote
        ? `- Judge notes: suppressed in sector-first display\n`
        : `- Judge notes: ${r.judgeNotes}\n`;
    }
    if (r.blindQuality) {
      md += `- Blind quality: overall=${r.blindQuality.qualityScore}, hardness=${r.blindQuality.reasoningHardness}, angle=${r.blindQuality.angleQuality}, expression=${r.blindQuality.expressionNaturalness}, honesty=${r.blindQuality.honestyBoundaries}, follow_up=${r.blindQuality.followUpValue}\n`;
    }
    if (r.unsupportedClaims.length > 0) {
      md += `- Unsupported claims removed/softened: ${r.unsupportedClaims.length}\n`;
    }
    if (r.invalidTickers.length > 0) {
      md += `- Ticker gate flagged: ${r.invalidTickers.join(", ")}\n`;
    }
    if (r.suspiciousNumberClaims.length > 0) {
      md += `- Numeric sanity flagged: ${r.suspiciousNumberClaims.length}\n`;
    }
    if (r.usedCitations.length > 0) {
      md += `- Citations used: ${r.usedCitations.join(", ")}\n`;
    }
    if (r.safetyChanges.length > 0) {
      md += `- Safety rewrites: ${r.safetyChanges.length}\n`;
    }
    if (r.claimCardItems > 0) {
      md += `- Claim-card items: ${r.claimCardItems}\n`;
    }
    if (r.selectedTickers.length > 0) {
      md += `- Ticker selector kept: ${r.selectedTickers.join(", ")}\n`;
    }
    if (r.droppedTickers.length > 0) {
      md += `- Ticker selector dropped: ${r.droppedTickers.join(", ")}\n`;
    }
    md += `- ROI metrics: cost=$${r.roiMetrics.allInCostUsd.toFixed(6)}, wall_time_ms=${r.roiMetrics.wallTimeMs}, model_calls=${r.roiMetrics.modelCalls}, search_calls=${r.roiMetrics.searchCalls}, prompt_tokens=${r.roiMetrics.promptTokens}, completion_tokens=${r.roiMetrics.completionTokens}\n`;
    if (
      r.unsupportedClaims.length > 0 ||
      r.invalidTickers.length > 0 ||
      r.suspiciousNumberClaims.length > 0 ||
      r.usedCitations.length > 0 ||
      r.safetyChanges.length > 0 ||
      r.claimCardItems > 0 ||
      r.selectedTickers.length > 0 ||
      r.droppedTickers.length > 0
    ) md += `\n`;
    if (r.toolCalls.length > 0) md += `**Extra tools**: ${r.toolCalls.join(", ")}\n\n`;
    md += `### Answer\n\n${r.answer}\n\n---\n\n`;
  }

  await fs.writeFile(outPath, md, "utf-8");
  await fs.writeFile(metricsOutPath, JSON.stringify(benchmarkExport, null, 2) + "\n", "utf-8");
  console.log(`\n✅ ${outPath}`);
  console.log(`📈 ${metricsOutPath}`);
  console.log(`📊 Analogies: ${usedAnalogies.length > 0 ? usedAnalogies.join(", ") : "none"}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
