#!/usr/bin/env node

/**
 * Mr.IF Spark / 翻山经济 — GPT-4o Agent (V7+)
 *
 * Think-Search-Write Architecture:
 * 1. User sends message
 * 2. Think: strict JSON schema validation + graceful fallback
 * 3. Search: structured evidence packet from Serper
 * 4. Write: draft answer (tool-augmented if needed)
 * 5. Verify: claim-level rewrite with citation binding ([E#])
 */

import "dotenv/config";
import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { z } from "zod";
import {
  buildLayer1ContractContext,
  enforceLayer1Contract,
} from "./tools/layer1-contract.js";
import { buildLayer2ContractContext } from "./tools/layer2-contract.js";
import { buildFollowUpSeedContext } from "./tools/follow-up-context.js";
import {
  webSearchStructured,
  formatWebEvidence,
  type WebSearchEvidence,
  WEB_SEARCH_TOOL_DEF,
} from "./tools/web-search.js";
import { applySafetyGates, sanitizeTickerHint } from "./tools/safety-gate.js";
import { buildPRDGuardrailContext } from "./tools/prd-guardrail.js";
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

const FOLLOW_UP_KEYWORDS = [
  "深入", "具体", "继续", "展开", "more", "deep dive", "go on", "details",
];

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

type ThinkingOutput = z.infer<typeof ThinkingOutputSchema>;

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

async function loadPrompt(name: string): Promise<string> {
  return fs.readFile(path.join(PROJECT_ROOT, "prompts", `${name}.md`), "utf-8");
}

function isFollowUp(input: string): boolean {
  return FOLLOW_UP_KEYWORDS.some((k) => input.toLowerCase().includes(k));
}

function normalizeThinking(raw: unknown): ThinkingOutput {
  const parsed = ThinkingOutputSchema.safeParse(raw);
  if (!parsed.success) return FALLBACK_THINKING;
  const result = {
    ...parsed.data,
    ticker_hint: sanitizeTickerHint(parsed.data.ticker_hint),
  };
  if (result.signal_strength !== "noise" && !result.layer3) {
    return { ...result, signal_strength: "noise" };
  }
  return result;
}

function buildAngleContext(thinking: ThinkingOutput): string {
  if (thinking.signal_strength === "noise") {
    return "[Thinking Engine]\nsignal_strength: noise\n没有可靠的金融信号。优先用坦诚型回答。";
  }

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

  return (
    `[Thinking Engine — Structured]\n` +
    `${techSummary}` +
    `Layer 3 (YOUR answer): ${thinking.layer3 || "n/a"}\n` +
    `Analogy: ${thinking.analogy_pick || "n/a"}\n` +
    `Tickers: ${thinking.ticker_hint || "n/a"}\n` +
    `Opening: ${thinking.first_sentence || "n/a"}`
  );
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
  question: string
): Promise<ThinkingOutput> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: thinkingPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.95,
      max_completion_tokens: THINK_MAX_COMPLETION_TOKENS,
      response_format: { type: "json_object" },
    });
    return normalizeThinking(JSON.parse(response.choices[0].message.content ?? "{}"));
  } catch {
    return FALLBACK_THINKING;
  }
}

async function handleToolCall(
  name: string,
  args: Record<string, string>
): Promise<{ content: string; evidenceNote?: string }> {
  if (name === "web_search") {
    const query = args.query;
    console.log(`  🔍 Extra search: "${query}"`);
    const structured = await webSearchStructured(query);
    return {
      content: formatWebEvidence(structured, 8),
      evidenceNote: `Query: ${query}\n${formatWebEvidence(structured, 5)}`,
    };
  }
  return { content: `[error] Unknown tool: ${name}` };
}

async function composeDraft(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: { temperature?: number; maxToolRounds?: number }
): Promise<{ draft: string; extraEvidence: string[] }> {
  const localMessages = [...messages];
  const extraEvidence: string[] = [];
  const temperature = options?.temperature ?? 0.8;
  const maxToolRounds = Math.max(0, options?.maxToolRounds ?? 3);

  let response = await client.chat.completions.create({
    model,
    messages: localMessages,
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
    localMessages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type !== "function") continue;
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      const result = await handleToolCall(toolCall.function.name, args);
      if (result.evidenceNote) extraEvidence.push(result.evidenceNote);
      localMessages.push({ role: "tool", tool_call_id: toolCall.id, content: result.content });
    }

    response = await client.chat.completions.create({
      model,
      messages: localMessages,
      ...(maxToolRounds > 0
        ? { tools: [WEB_SEARCH_TOOL_DEF] as OpenAI.Chat.ChatCompletionTool[] }
        : {}),
      temperature,
      max_completion_tokens: DRAFT_MAX_COMPLETION_TOKENS,
    });
    choice = response.choices[0];
  }

  return {
    draft: choice.message.content ?? "",
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
      JSON.parse(response.choices[0].message.content ?? "{}")
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
        JSON.parse(response.choices[0].message.content ?? "{}")
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
      JSON.parse(response.choices[0].message.content ?? "{}")
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
      JSON.parse(response.choices[0].message.content ?? "{}")
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
    JSON.parse(response.choices[0].message.content ?? "{}")
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
    process.env.SPARK_EXECUTION_PROFILE,
    "production"
  );
  const candidateCount = Math.max(
    1,
    Math.min(4, Number(process.env.SPARK_DRAFT_CANDIDATES ?? "2") || 2)
  );
  const systemPrompt = await loadPrompt("system-prompt");
  const thinkingPrompt = await loadPrompt("thinking-prompt");

  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  翻山经济 / Mr.IF Spark  (V7+ Verified)      ║");
  console.log("║  Model: " + model.padEnd(37) + "║");
  if (baseURL) console.log("║  Base URL: " + baseURL.slice(0, 34).padEnd(34) + "║");
  console.log("║  Architecture: Think → Search → Verify → Write║");
  console.log("║  Draft candidates: " + String(candidateCount).padEnd(27) + "║");
  console.log("║  Exec profile: " + executionProfile.padEnd(30) + "║");
  console.log("║  Type 'quit' to exit, 'reset' to clear       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let isClosing = false;
  rl.on("close", () => {
    isClosing = true;
  });

  const prompt = () => {
    if (isClosing) return;

    try {
      rl.question("You > ", async (input) => {
      const trimmed = input.trim();
      const followUp = isFollowUp(trimmed);
      if (!trimmed) return prompt();
      if (trimmed === "quit" || trimmed === "exit") {
        isClosing = true;
        rl.close();
        return;
      }
      if (trimmed === "reset") { history.length = 0; console.log("🔄 Reset.\n"); return prompt(); }

      try {
        console.log("");
        const turnContext: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        let thinkingForJudge: ThinkingOutput = FALLBACK_THINKING;
        let evidencePacket: EvidencePacket = { generated_at: new Date().toISOString(), items: [] };
        let route = chooseSkillRoute({
          signalStrength: thinkingForJudge.signal_strength,
          question: trimmed,
          followUp,
        });
        let executionBudget = resolveExecutionBudget(route, executionProfile);

        if (!followUp) {
          console.log("  [Think] Finding angle...");
          const rawThinking = await think(client, model, thinkingPrompt, trimmed);
          route = chooseSkillRoute({
            signalStrength: rawThinking.signal_strength,
            question: trimmed,
            layer3: rawThinking.layer3,
            followUp: false,
          });
          executionBudget = resolveExecutionBudget(route, executionProfile);
          const thinking = applyRouteThinkingGuardrail(rawThinking, route.forceNoiseFraming, route.routeName, trimmed);
          thinkingForJudge = thinking;
          const displayThinking = sanitizeThinkingForDisplay(thinking, {
            preferSectorOnly: route.preferSectorOnly,
          });
          console.log(`  Signal: ${thinking.signal_strength}`);
          if (displayThinking.note) {
            console.log(`  [Display] ${displayThinking.note}`);
          } else if (displayThinking.thinking.layer3) {
            console.log(`  L3: ${displayThinking.thinking.layer3}`);
          }

          turnContext.push({ role: "system", content: buildAngleContext(thinking) });

          const queries = thinking.signal_strength === "noise"
            ? []
            : thinking.search_queries.slice(0, executionBudget.maxSearchQueries);

          if (queries.length > 0) {
            console.log(`  [Search] ${queries.length} targeted queries...`);
            const structured = await Promise.all(
              queries.map(async (q) => ({
                query: q,
                evidence: await webSearchStructured(q, {
                  num: executionBudget.maxEvidenceItems <= 4 ? 4 : 6,
                }),
              }))
            );
            evidencePacket = buildEvidencePacket(structured, executionBudget.maxEvidenceItems);
            turnContext.push({
              role: "system",
              content: formatEvidencePacket(evidencePacket),
            });
          }
        }
        console.log(
          `  [Route] ${route.routeName} | search<=${route.maxSearchQueries} | ` +
          `candidates<=${route.maxCandidates} | temp=${route.writeTemperature.toFixed(2)}`
        );
        console.log(
          `  [Exec] ${executionBudget.profileName} | search<=${executionBudget.maxSearchQueries} | ` +
          `candidates<=${executionBudget.maxCandidates} | verify=${executionBudget.verificationDepth}`
        );
        const prdContext = buildPRDGuardrailContext({
          followUp,
          resultSeeking: route.resultSeeking,
          signalStrength: thinkingForJudge.signal_strength,
        });
        const layer1Context = buildLayer1ContractContext({
          followUp,
          resultSeeking: route.resultSeeking,
          signalStrength: thinkingForJudge.signal_strength,
        });
        const layer2Context = buildLayer2ContractContext({
          followUp,
          resultSeeking: route.resultSeeking,
        });
        const followUpSeedContext = followUp ? buildFollowUpSeedContext(history) : "";

        const draftMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "system", content: prdContext },
          {
            role: "system",
            content: buildSkillRouteContext(route, {
              maxSearchQueries: executionBudget.maxSearchQueries,
              maxCandidates: executionBudget.maxCandidates,
              maxTickers: executionBudget.maxTickers,
              preferSectorOnly: executionBudget.preferSectorOnly,
              fastMode: executionBudget.profileName === "production",
            }),
          },
          ...(layer1Context ? [{ role: "system" as const, content: layer1Context }] : []),
          ...(layer2Context ? [{ role: "system" as const, content: layer2Context }] : []),
          ...(followUpSeedContext
            ? [{ role: "system" as const, content: followUpSeedContext }]
            : []),
          ...history,
          ...turnContext,
          { role: "user", content: trimmed },
        ];

        const signalForDraft = thinkingForJudge.signal_strength;
        const runs = Math.max(
          1,
          Math.min(executionBudget.maxCandidates, candidateCount, CANDIDATE_STYLES.length)
        );
        const styleSequence = buildCandidateStyleSequence(
          runs,
          Math.floor(history.length / 2),
          signalForDraft
        );
        const presearchCount =
          signalForDraft === "noise"
            ? 0
            : Math.min(executionBudget.maxSearchQueries, thinkingForJudge.search_queries.length);
        const toolRoundsBudget = Math.max(0, executionBudget.maxToolRounds - presearchCount);
        console.log(`  [Write] Drafting ${runs} candidates...`);
        const drafted: Array<{ draft: string; extraEvidence: string[]; style: string }> = [];
        for (let i = 0; i < runs; i++) {
          const style = styleSequence[i];
          const styleMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: "system",
            content: `[Candidate style: ${style}] ${CANDIDATE_STYLE_PROMPTS[style]}`,
          };
          const out = await composeDraft(
            client,
            model,
            [...draftMessages, styleMessage],
            {
              temperature: route.writeTemperature,
              maxToolRounds: toolRoundsBudget,
            }
          );
          drafted.push({ ...out, style });
        }

        const evidencePacketText = formatEvidencePacket(evidencePacket);
        let judged = { selectedIndex: 0, notes: "single draft" };
        if (executionBudget.useJudge && drafted.length > 1) {
          console.log("  [Judge] Ranking candidates...");
          judged = await judgeBestDraft(
            client,
            model,
            trimmed,
            drafted.map((d) => ({ style: d.style, draft: d.draft })),
            thinkingForJudge,
            evidencePacketText
          );
          const selected = drafted[judged.selectedIndex] ?? drafted[0];
          console.log(`  [Judge] Selected #${judged.selectedIndex + 1} (${selected.style})`);
        } else {
          console.log("  [Judge] Skipped (fast path)");
        }

        const chosen = drafted[judged.selectedIndex] ?? drafted[0];

        console.log("  [Verify] Checking claims and binding citations...");
        const useClaimCard = executionBudget.useClaimCard;
        if (!useClaimCard) {
          console.log("  ℹ️ light mode: skip claim-card");
        }
        const verified = await verifyAndRewrite(
          client,
          model,
          trimmed,
          chosen.draft,
          evidencePacket,
          chosen.extraEvidence,
          executionBudget.maxTickers,
          useClaimCard,
          {
            signalStrength: thinkingForJudge.signal_strength,
            resultSeeking: route.resultSeeking,
            followUp,
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

        const finalReply = verified.finalAnswer || chosen.draft;
        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: finalReply });

        console.log(`\nSpark > ${finalReply}\n`);
      } catch (err) {
        console.error(`\n❌ ${err instanceof Error ? err.message : err}\n`);
      }

        if (!isClosing) prompt();
      });
    } catch (err) {
      if (!isClosing) {
        console.error(`\n❌ prompt error: ${err instanceof Error ? err.message : err}\n`);
      }
    }
  };

  prompt();
}

main();
