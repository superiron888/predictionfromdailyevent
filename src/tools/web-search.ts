/**
 * Web Search Tool — Serper API (Google Search)
 *
 * Dual usage:
 * 1. System-level pre-search: injected before every question for real-data grounding
 * 2. LLM-level tool call: GPT-4o can do additional searches during reasoning
 *
 * API docs: https://serper.dev
 */

export type SourceQuality = "high" | "medium" | "low";

export interface WebSearchHit {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  date?: string;
  source_quality: SourceQuality;
}

export interface WebSearchEvidence {
  query: string;
  generated_at: string;
  answer_box?: string;
  knowledge_graph?: string;
  hits: WebSearchHit[];
  error?: string;
}

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperKnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
}

interface SerperAnswerBox {
  snippet?: string;
  title?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  answerBox?: SerperAnswerBox;
}

const HIGH_TRUST_DOMAINS = [
  ".gov",
  ".edu",
  "sec.gov",
  "fred.stlouisfed.org",
  "bls.gov",
  "bea.gov",
  "cdc.gov",
  "who.int",
  "imf.org",
  "worldbank.org",
  "oecd.org",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "cnbc.com",
  "finance.yahoo.com",
  "investor.",
];

const LOW_TRUST_DOMAINS = [
  "reddit.com",
  "quora.com",
  "medium.com",
  "substack.com",
  "wikipedia.org",
];
const SERPER_TIMEOUT_MS = Number(process.env.SERPER_TIMEOUT_MS ?? "5000");

function normalizeDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

function scoreSourceQuality(domain: string): SourceQuality {
  if (HIGH_TRUST_DOMAINS.some((d) => domain.includes(d))) return "high";
  if (LOW_TRUST_DOMAINS.some((d) => domain.includes(d))) return "low";
  return "medium";
}

function toSearchHit(result: SerperOrganicResult, idx: number): WebSearchHit {
  const domain = normalizeDomain(result.link);
  return {
    id: `S${idx + 1}`,
    title: result.title,
    url: result.link,
    domain,
    snippet: result.snippet,
    date: result.date,
    source_quality: scoreSourceQuality(domain),
  };
}

export function formatWebEvidence(
  evidence: WebSearchEvidence,
  maxHits = 8
): string {
  if (evidence.error) return `[web_search error] ${evidence.error}`;

  let output = "";
  if (evidence.answer_box) output += `Answer: ${evidence.answer_box}\n\n`;
  if (evidence.knowledge_graph) output += `Knowledge: ${evidence.knowledge_graph}\n\n`;

  const hits = evidence.hits.slice(0, maxHits);
  if (hits.length === 0) return output.trim() || "[web_search] No results found.";

  output += `Results for "${evidence.query}":\n`;
  for (const h of hits) {
    output += `- [${h.id}] ${h.title}${h.date ? ` (${h.date})` : ""}\n`;
    output += `  ${h.url}\n`;
    output += `  quality=${h.source_quality}, domain=${h.domain}\n`;
    output += `  ${h.snippet}\n\n`;
  }
  return output.trim();
}

export async function webSearchStructured(
  query: string,
  options: { num?: number; gl?: string; hl?: string } = {}
): Promise<WebSearchEvidence> {
  const base: WebSearchEvidence = {
    query,
    generated_at: new Date().toISOString(),
    hits: [],
  };

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { ...base, error: "SERPER_API_KEY not set." };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          q: query,
          num: options.num ?? 8,
          gl: options.gl ?? "us",
          hl: options.hl ?? "en",
        }),
      });

      if (!response.ok) {
        return {
          ...base,
          error: `HTTP ${response.status}: ${await response.text()}`,
        };
      }

      const data = (await response.json()) as SerperResponse;
      return {
        ...base,
        answer_box: data.answerBox?.snippet,
        knowledge_graph: data.knowledgeGraph?.description
          ? `${data.knowledgeGraph.title ?? ""}: ${data.knowledgeGraph.description}`.trim()
          : undefined,
        hits: (data.organic ?? []).slice(0, options.num ?? 8).map(toSearchHit),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function webSearch(
  query: string,
  options: { num?: number; gl?: string; hl?: string } = {}
): Promise<string> {
  const evidence = await webSearchStructured(query, options);
  return formatWebEvidence(evidence, options.num ?? 8);
}

export const WEB_SEARCH_TOOL_DEF = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Search the web (via Google) for current information. Use proactively — you already have pre-search context, but if you need more specific data (exact stock performance, recent earnings, counter-examples), search again. Include company names, ticker symbols, dates, or metrics in your query for best results.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description:
            "Search query — be specific. Include company names, dates, or metrics when relevant.",
        },
      },
      required: ["query"],
    },
  },
};
