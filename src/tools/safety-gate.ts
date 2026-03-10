import OpenAI from "openai";
import { z } from "zod";
import type { TickerValidationMode } from "./execution-profile.js";
import { webSearchStructured } from "./web-search.js";
import {
  TICKER_ALIAS_MAP,
  findUnsafeCompanyEntities,
  normalizeTickerSymbol,
} from "./ticker-selector.js";

export interface SafetyEvidenceItem {
  id: string;
  title: string;
  url: string;
  date?: string;
  source_quality: "high" | "medium" | "low";
}

export interface SafetyEvidencePacket {
  items: SafetyEvidenceItem[];
}

interface ApplySafetyGatesParams {
  client: OpenAI;
  model: string;
  userInput: string;
  answer: string;
  evidenceBlock: string;
  packet: SafetyEvidencePacket;
  fallbackUsedCitations?: string[];
  maxTickers?: number;
  allowedTickers?: string[];
  preferSectorOnly?: boolean;
  validationMode?: TickerValidationMode;
}

export interface SafetyGateResult {
  finalAnswer: string;
  usedCitations: string[];
  invalidTickers: string[];
  suspiciousNumberClaims: string[];
  safetyChanges: string[];
}

const SafetyRewriteSchema = z.object({
  final_answer: z.string().default(""),
  changes: z.array(z.string()).default([]),
});

const HARD_BLOCKED_TICKERS = new Set(["LVGO", "CERN", "LYRA"]);
const TICKER_VALIDATE_MAX = 6;
const tickerValidationCache = new Map<string, { valid: boolean; reason: string }>();

const NUMERIC_SUSPICIOUS_RULES: RegExp[] = [
  /\b\d{5,}\s*亿\b/,
  /\b\d{4,}\s*billion\b/i,
  /\b\d{3,}\s*trillion\b/i,
  /\b\d{4,}\s*%\b/,
];

function looksResultSeeking(text: string): boolean {
  return /(买什么|什么标的|推荐.*标的|推荐买|买哪个|what to buy|which stock|which stocks|recommend.*stock|ticker|tickers)/i.test(
    text
  );
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeTickerHint(raw: string): string {
  let out = raw;
  for (const t of HARD_BLOCKED_TICKERS) {
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`, "gi");
    out = out.replace(re, "");
  }
  return out
    .replace(/,\s*,/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^,\s*|\s*,$/g, "")
    .trim();
}

export function extractCitationIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\[(E\d+)\]/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

export function buildCitationAppendix(
  answer: string,
  packet: SafetyEvidencePacket
): string {
  const cited = extractCitationIds(answer);
  if (cited.length === 0) return "";

  const lines: string[] = [];
  for (const id of cited) {
    const item = packet.items.find((x) => x.id === id);
    if (!item) continue;
    lines.push(
      `- ${id} -> ${item.title}${item.date ? ` (${item.date})` : ""} | quality=${item.source_quality}\n  ${item.url}`
    );
  }
  if (lines.length === 0) return "";
  return `[Source Map]\n${lines.join("\n")}`;
}

function extractTickersFromAnswer(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/[\(（]([A-Z]{1,5}(?:-[A-Z])?)[\)）]/g)) {
    ids.add(normalizeTickerSymbol(m[1]));
  }
  return [...ids].slice(0, TICKER_VALIDATE_MAX);
}

function replaceTickerAliasesInText(text: string): { text: string; replacements: string[] } {
  let out = text;
  const replacements: string[] = [];
  for (const [from, to] of Object.entries(TICKER_ALIAS_MAP)) {
    if (!from || !to || from === to) continue;
    const re = new RegExp(`[\\(（]\\s*${escapeRegex(from)}\\s*[\\)）]`, "g");
    if (!re.test(out)) continue;
    out = out.replace(re, (m) => {
      if (m.startsWith("（")) return `（${to}）`;
      return `(${to})`;
    });
    replacements.push(`${from}->${to}`);
  }
  return { text: out, replacements: [...new Set(replacements)] };
}

function stripTickerSymbols(
  text: string,
  tickers: string[]
): { text: string; stripped: string[] } {
  let out = text;
  const stripped: string[] = [];
  for (const raw of tickers) {
    const t = normalizeTickerSymbol(raw);
    if (!t) continue;
    const re = new RegExp(`[\\(（]\\s*${escapeRegex(t)}\\s*[\\)）]`, "g");
    if (!re.test(out)) continue;
    out = out.replace(re, "");
    stripped.push(t);
  }
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,，。.!?])/g, "$1")
    .replace(/^\s+|\s+$/g, "");
  return { text: out, stripped: [...new Set(stripped)] };
}

function stripUnsafeCompanyNames(
  text: string,
  names: string[]
): { text: string; stripped: string[] } {
  let out = text;
  const stripped: string[] = [];

  for (const name of names) {
    if (!name.trim()) continue;
    const escaped = escapeRegex(name.trim());
    const contextual = [
      new RegExp(`(比如|例如|像|如)\\s*${escaped}`, "g"),
      new RegExp(`(providers? like)\\s+${escaped}`, "gi"),
      new RegExp(`(companies? like)\\s+${escaped}`, "gi"),
    ];
    const plain = new RegExp(`\\b${escaped}\\b`, "g");

    let changed = false;
    for (const re of contextual) {
      if (!re.test(out)) continue;
      out = out.replace(re, (_, lead: string) => {
        changed = true;
        if (/providers?/i.test(lead) || /companies?/i.test(lead)) return `${lead} related companies`;
        return `${lead}相关公司`;
      });
    }
    if (plain.test(out)) {
      out = out.replace(plain, "相关公司");
      changed = true;
    }
    if (changed) stripped.push(name);
  }

  out = out
    .replace(/相关公司\s+related companies/gi, "related companies")
    .replace(/相关公司相关公司/g, "相关公司")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,，。.!?])/g, "$1")
    .replace(/^\s+|\s+$/g, "");
  return { text: out, stripped: [...new Set(stripped)] };
}

function countKeywordHits(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) count++;
  }
  return count;
}

async function validateTicker(
  ticker: string
): Promise<{ valid: boolean; reason: string }> {
  const key = ticker.toUpperCase().trim();
  if (!key) return { valid: true, reason: "empty" };
  const cached = tickerValidationCache.get(key);
  if (cached) return cached;

  if (HARD_BLOCKED_TICKERS.has(key)) {
    const out = { valid: false, reason: "hard_blocked" };
    tickerValidationCache.set(key, out);
    return out;
  }

  const search = await webSearchStructured(
    `${key} stock ticker listed NYSE NASDAQ delisted acquired`
  );
  const blob = [
    search.answer_box ?? "",
    search.knowledge_graph ?? "",
    ...search.hits.slice(0, 6).flatMap((h) => [h.title, h.snippet]),
  ]
    .join(" ")
    .toLowerCase();

  const invalidHints = [
    "delisted",
    "no longer listed",
    "went private",
    "private company",
    "acquired by",
    "merged into",
    "bankrupt",
    "chapter 11",
    "otc",
    "pink sheets",
  ];
  const validHints = [
    "nasdaq",
    "nyse",
    "listed on",
    "stock price",
    "market cap",
    "shares",
    "quote",
  ];

  const invalidScore = countKeywordHits(blob, invalidHints);
  const validScore = countKeywordHits(blob, validHints);
  const valid = !(invalidScore >= 2 && invalidScore > validScore);
  const reason = valid
    ? `ok(v=${validScore},bad=${invalidScore})`
    : `likely_not_listed(v=${validScore},bad=${invalidScore})`;
  const out = { valid, reason };
  tickerValidationCache.set(key, out);
  return out;
}

export async function detectInvalidTickers(answer: string): Promise<string[]> {
  const tickers = extractTickersFromAnswer(answer);
  if (tickers.length === 0) return [];
  const checks = await Promise.all(tickers.map(validateTicker));
  return tickers.filter((_, i) => !checks[i].valid);
}

export function findSuspiciousNumericClaims(answer: string): string[] {
  const sentences = answer
    .split(/(?<=[。！？.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (NUMERIC_SUSPICIOUS_RULES.some((re) => re.test(s))) {
      out.push(s.slice(0, 180));
    }
  }
  return [...new Set(out)].slice(0, 5);
}

async function enforceSafetyRewrite(
  client: OpenAI,
  model: string,
  userInput: string,
  answer: string,
  evidenceBlock: string,
  invalidTickers: string[],
  disallowedTickers: string[],
  allowedTickers: string[],
  unsafeCompanyEntities: Array<{ name: string; reason: string; resolvedTicker?: string }>,
  suspiciousNumberClaims: string[],
  tickerOverflow: string[],
  maxTickers?: number
): Promise<{ finalAnswer: string; changes: string[] }> {
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are a strict post-editor for financial text. Return JSON with keys final_answer and changes. " +
          "Tasks: (1) Remove or replace invalid/non-listed tickers. " +
          "(2) Remove tickers not in allowed whitelist. " +
          "(3) Remove or generalize company names that cannot be safely mapped to an allowed listed ticker. " +
          "(4) Enforce max ticker count if exceeded. " +
          "(5) Soften/remove suspicious numeric claims. " +
          "(6) Keep tone/language and supported [E#] citations. " +
          "(7) If a specific company is unsafe or replacement ticker is uncertain, keep sector-level wording instead of naming the company.",
      },
      {
        role: "user",
        content:
          `User input:\n${userInput}\n\n` +
          `Current answer:\n${answer}\n\n` +
          `Invalid tickers:\n${invalidTickers.join(", ") || "(none)"}\n\n` +
          `Disallowed tickers:\n${disallowedTickers.join(", ") || "(none)"}\n\n` +
          `Allowed tickers:\n${allowedTickers.join(", ") || "(none)"}\n\n` +
          `Unsafe company entities:\n${
            unsafeCompanyEntities.length > 0
              ? unsafeCompanyEntities
                  .map((x) =>
                    `${x.name} | reason=${x.reason}${x.resolvedTicker ? ` | resolved=${x.resolvedTicker}` : ""}`
                  )
                  .join("\n")
              : "(none)"
          }\n\n` +
          `Ticker overflow (drop first):\n${tickerOverflow.join(", ") || "(none)"}\n` +
          `Max tickers allowed:\n${maxTickers ?? "(not set)"}\n\n` +
          `Suspicious number claims:\n${suspiciousNumberClaims.join("\n- ") || "(none)"}\n\n` +
          `Evidence:\n${evidenceBlock}`,
      },
    ],
  });

  const parsed = SafetyRewriteSchema.safeParse(
    JSON.parse(response.choices[0].message.content ?? "{}")
  );
  if (!parsed.success || !parsed.data.final_answer.trim()) {
    return { finalAnswer: answer, changes: [] };
  }
  return {
    finalAnswer: parsed.data.final_answer.trim(),
    changes: parsed.data.changes,
  };
}

async function enforceDirectionEvidenceRewrite(
  client: OpenAI,
  model: string,
  userInput: string,
  answer: string,
  evidenceBlock: string,
  allowedTickers: string[]
): Promise<{ finalAnswer: string; changes: string[] }> {
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are a strict PRD compliance editor for a financial insight assistant. Return JSON with keys final_answer and changes. " +
          "Goal: enforce that any specific listed company named in the answer must have direct event-specific evidence in the evidence block. " +
          "Rules: (1) sector fit, company familiarity, market-size data, or TAM/CAGR are NOT direct evidence. " +
          "(2) Keep a company/ticker only if the evidence ties that company to the actual event, behavior change, demand shift, capacity bottleneck, management action, or financial impact in this question. " +
          "(3) If that direct tie is missing, rewrite the sentence to sector/company-type wording and remove the specific company/ticker. " +
          "(4) Do not add new companies or new facts. " +
          "(5) Keep the original language, tone, mechanism, and supported citations where possible.",
      },
      {
        role: "user",
        content:
          `User input:\n${userInput}\n\n` +
          `Current answer:\n${answer}\n\n` +
          `Allowed tickers (whitelist only, not proof):\n${allowedTickers.join(", ") || "(none)"}\n\n` +
          `Evidence:\n${evidenceBlock}`,
      },
    ],
  });

  const parsed = SafetyRewriteSchema.safeParse(
    JSON.parse(response.choices[0].message.content ?? "{}")
  );
  if (!parsed.success || !parsed.data.final_answer.trim()) {
    return { finalAnswer: answer, changes: [] };
  }
  return {
    finalAnswer: parsed.data.final_answer.trim(),
    changes: parsed.data.changes,
  };
}

async function enforceSectorOnlyDirectionRewrite(
  client: OpenAI,
  model: string,
  userInput: string,
  answer: string,
  evidenceBlock: string
): Promise<{ finalAnswer: string; changes: string[] }> {
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are a strict PRD compliance editor for a financial insight assistant. Return JSON with keys final_answer and changes. " +
          "Goal: keep Layer 1 result-seeking answers at sector/company-type level instead of naming a specific investment target. " +
          "Rules: (1) Remove specific recommended company names and tickers from the direction; rewrite them into sector/company-type wording. " +
          "(2) Do not keep specific peer examples such as Netflix, Disney+, or similar named companies as illustrations; replace them with generic wording like 'large streaming platforms'. " +
          "(3) The final answer must not contain any company or brand name unless that company was explicitly mentioned in the user input as the observed trigger context. " +
          "(4) If the user mentioned a company as the observed trigger, that company may stay only as background context, not as the buy recommendation. " +
          "(5) Keep the original mechanism, caveats, tone, and supported [E#] citations where possible. " +
          "(6) Do not add new facts, companies, or tickers. " +
          "(7) Keep one concise direction, but sector/company-type only.",
      },
      {
        role: "user",
        content:
          `User input:\n${userInput}\n\n` +
          `Current answer:\n${answer}\n\n` +
          `Evidence:\n${evidenceBlock}`,
      },
    ],
  });

  const parsed = SafetyRewriteSchema.safeParse(
    JSON.parse(response.choices[0].message.content ?? "{}")
  );
  if (!parsed.success || !parsed.data.final_answer.trim()) {
    return { finalAnswer: answer, changes: [] };
  }
  return {
    finalAnswer: parsed.data.final_answer.trim(),
    changes: parsed.data.changes,
  };
}

export async function applySafetyGates(
  params: ApplySafetyGatesParams
): Promise<SafetyGateResult> {
  const {
    client,
    model,
    userInput,
    answer,
    evidenceBlock,
    packet,
    fallbackUsedCitations = [],
    maxTickers,
    allowedTickers,
    preferSectorOnly = false,
    validationMode = "network",
  } = params;
  const shouldUseNetworkValidation = validationMode === "network";
  const allowModelRewrites = shouldUseNetworkValidation;

  let finalAnswer = answer;
  let safetyChanges: string[] = [];
  const aliasNormalizedFirst = replaceTickerAliasesInText(finalAnswer);
  if (aliasNormalizedFirst.replacements.length > 0) {
    finalAnswer = aliasNormalizedFirst.text;
    safetyChanges.push(`ticker_alias:${aliasNormalizedFirst.replacements.join(",")}`);
  }
  let invalidTickers = shouldUseNetworkValidation
    ? await detectInvalidTickers(finalAnswer)
    : [];
  let allTickers = extractTickersFromAnswer(finalAnswer);
  const enforceWhitelist = allowedTickers !== undefined;
  const normalizedAllowed = (allowedTickers ?? [])
    .map((x) => normalizeTickerSymbol(x))
    .filter(Boolean);
  const allowedSet = new Set(
    normalizedAllowed
  );
  if (enforceWhitelist && allowedSet.size > 0) {
    invalidTickers = invalidTickers.filter((t) => !allowedSet.has(t));
  }
  let disallowedTickers =
    enforceWhitelist
      ? allTickers.filter((t) => !allowedSet.has(t))
      : [];
  let tickerOverflow =
    typeof maxTickers === "number" && maxTickers >= 0
        ? allTickers.slice(Math.max(0, maxTickers))
        : [];
  let suspiciousNumberClaims = findSuspiciousNumericClaims(finalAnswer);
  let unsafeCompanyEntities = shouldUseNetworkValidation
    ? await findUnsafeCompanyEntities({
        text: finalAnswer,
        allowedTickers: normalizedAllowed,
      })
    : [];

  if (
    invalidTickers.length > 0 ||
    disallowedTickers.length > 0 ||
    suspiciousNumberClaims.length > 0 ||
    tickerOverflow.length > 0 ||
    unsafeCompanyEntities.length > 0
  ) {
    if (allowModelRewrites) {
      const rewritten = await enforceSafetyRewrite(
        client,
        model,
        userInput,
        finalAnswer,
        evidenceBlock,
        invalidTickers,
        disallowedTickers,
        normalizedAllowed,
        unsafeCompanyEntities,
        suspiciousNumberClaims,
        tickerOverflow,
        maxTickers
      );
      finalAnswer = rewritten.finalAnswer;
      safetyChanges = [...safetyChanges, ...rewritten.changes];
      const aliasNormalized = replaceTickerAliasesInText(finalAnswer);
      if (aliasNormalized.replacements.length > 0) {
        finalAnswer = aliasNormalized.text;
        safetyChanges.push(`ticker_alias:${aliasNormalized.replacements.join(",")}`);
      }
    }
    invalidTickers = shouldUseNetworkValidation
      ? await detectInvalidTickers(finalAnswer)
      : [];
    allTickers = extractTickersFromAnswer(finalAnswer);
    if (enforceWhitelist && allowedSet.size > 0) {
      invalidTickers = invalidTickers.filter((t) => !allowedSet.has(t));
    }
    disallowedTickers =
      enforceWhitelist
        ? allTickers.filter((t) => !allowedSet.has(t))
        : [];
    tickerOverflow =
      typeof maxTickers === "number" && maxTickers >= 0
          ? allTickers.slice(Math.max(0, maxTickers))
          : [];
    suspiciousNumberClaims = findSuspiciousNumericClaims(finalAnswer);
    unsafeCompanyEntities = shouldUseNetworkValidation
      ? await findUnsafeCompanyEntities({
          text: finalAnswer,
          allowedTickers: normalizedAllowed,
        })
      : [];
  }

  const hardDropTickers = [...new Set([...invalidTickers, ...disallowedTickers, ...tickerOverflow])];
  if (hardDropTickers.length > 0) {
    const stripped = stripTickerSymbols(finalAnswer, hardDropTickers);
    if (stripped.stripped.length > 0) {
      finalAnswer = stripped.text;
      safetyChanges.push(`hard_strip_ticker:${stripped.stripped.join(",")}`);
      invalidTickers = shouldUseNetworkValidation
        ? await detectInvalidTickers(finalAnswer)
        : [];
      allTickers = extractTickersFromAnswer(finalAnswer);
      if (enforceWhitelist && allowedSet.size > 0) {
        invalidTickers = invalidTickers.filter((t) => !allowedSet.has(t));
      }
      disallowedTickers =
        enforceWhitelist
          ? allTickers.filter((t) => !allowedSet.has(t))
          : [];
      tickerOverflow =
        typeof maxTickers === "number" && maxTickers >= 0
          ? allTickers.slice(Math.max(0, maxTickers))
          : [];
      unsafeCompanyEntities = shouldUseNetworkValidation
        ? await findUnsafeCompanyEntities({
            text: finalAnswer,
            allowedTickers: normalizedAllowed,
          })
        : [];
    }
  }

  if (unsafeCompanyEntities.length > 0) {
    const stripped = stripUnsafeCompanyNames(
      finalAnswer,
      unsafeCompanyEntities.map((x) => x.name)
    );
    if (stripped.stripped.length > 0) {
      finalAnswer = stripped.text;
      safetyChanges.push(`hard_strip_entity:${stripped.stripped.join(",")}`);
    }
  }

  if (allowModelRewrites && looksResultSeeking(userInput)) {
    const directionRewritten = await enforceDirectionEvidenceRewrite(
      client,
      model,
      userInput,
      finalAnswer,
      evidenceBlock,
      normalizedAllowed
    );
    if (directionRewritten.finalAnswer.trim() && directionRewritten.finalAnswer !== finalAnswer) {
      finalAnswer = directionRewritten.finalAnswer;
      safetyChanges = [...safetyChanges, ...directionRewritten.changes];
      const aliasNormalized = replaceTickerAliasesInText(finalAnswer);
      if (aliasNormalized.replacements.length > 0) {
        finalAnswer = aliasNormalized.text;
        safetyChanges.push(`ticker_alias:${aliasNormalized.replacements.join(",")}`);
      }
      invalidTickers = shouldUseNetworkValidation
        ? await detectInvalidTickers(finalAnswer)
        : [];
      allTickers = extractTickersFromAnswer(finalAnswer);
      disallowedTickers =
        enforceWhitelist
          ? allTickers.filter((t) => !allowedSet.has(t))
          : [];
      suspiciousNumberClaims = findSuspiciousNumericClaims(finalAnswer);
    }
  }

  if (
    allowModelRewrites &&
    preferSectorOnly &&
    (maxTickers ?? 0) <= 0 &&
    looksResultSeeking(userInput)
  ) {
    const sectorOnlyRewritten = await enforceSectorOnlyDirectionRewrite(
      client,
      model,
      userInput,
      finalAnswer,
      evidenceBlock
    );
    if (sectorOnlyRewritten.finalAnswer.trim() && sectorOnlyRewritten.finalAnswer !== finalAnswer) {
      finalAnswer = sectorOnlyRewritten.finalAnswer;
      safetyChanges = [...safetyChanges, ...sectorOnlyRewritten.changes];
      const aliasNormalized = replaceTickerAliasesInText(finalAnswer);
      if (aliasNormalized.replacements.length > 0) {
        finalAnswer = aliasNormalized.text;
        safetyChanges.push(`ticker_alias:${aliasNormalized.replacements.join(",")}`);
      }
      invalidTickers = shouldUseNetworkValidation
        ? await detectInvalidTickers(finalAnswer)
        : [];
      allTickers = extractTickersFromAnswer(finalAnswer);
      disallowedTickers =
        enforceWhitelist
          ? allTickers.filter((t) => !allowedSet.has(t))
          : [];
      suspiciousNumberClaims = findSuspiciousNumericClaims(finalAnswer);
    }
  }

  const citedFromAnswer = extractCitationIds(finalAnswer);
  const usedCitations =
    citedFromAnswer.length > 0 ? citedFromAnswer : fallbackUsedCitations;
  const appendix = buildCitationAppendix(finalAnswer, packet);
  if (appendix && !finalAnswer.includes("[Source Map]")) {
    finalAnswer = `${finalAnswer}\n\n${appendix}`;
  }

  return {
    finalAnswer,
    usedCitations,
    invalidTickers,
    suspiciousNumberClaims,
    safetyChanges,
  };
}
