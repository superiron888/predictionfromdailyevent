import OpenAI from "openai";
import { z } from "zod";

export type ClaimConfidence = "high" | "medium" | "low";
export type ClaimAction = "keep" | "soften" | "drop";

export interface ClaimCardItem {
  claim: string;
  evidenceIds: string[];
  confidence: ClaimConfidence;
  action: ClaimAction;
  ticker?: string;
}

export interface ClaimCard {
  items: ClaimCardItem[];
  notes: string;
}

interface BuildClaimCardParams {
  client: OpenAI;
  model: string;
  userInput: string;
  draft: string;
  evidenceBlock: string;
  maxItems?: number;
}

interface RewriteFromClaimCardParams {
  client: OpenAI;
  model: string;
  userInput: string;
  draft: string;
  claimCard: ClaimCard;
  evidenceBlock: string;
}

const ClaimItemSchema = z.object({
  claim: z.coerce.string().default(""),
  evidence_ids: z.array(z.string()).default([]),
  confidence: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
      z.enum(["high", "medium", "low"]).catch("low")
    ),
  action: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
      z.enum(["keep", "soften", "drop"]).catch("soften")
    ),
  ticker: z.coerce.string().optional(),
});

const ClaimCardSchema = z.object({
  items: z.array(ClaimItemSchema).default([]),
  notes: z.coerce.string().default(""),
});

const RewriteSchema = z.object({
  final_answer: z.coerce.string().default(""),
  notes: z.coerce.string().default(""),
});

function normalizeEvidenceIds(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const m = raw.toUpperCase().match(/E\d+/);
    if (m) out.add(m[0]);
  }
  return [...out];
}

function normalizeClaimItem(raw: z.infer<typeof ClaimItemSchema>): ClaimCardItem | null {
  const claim = raw.claim.trim();
  if (!claim) return null;
  const evidenceIds = normalizeEvidenceIds(raw.evidence_ids);
  const ticker = raw.ticker?.trim() || undefined;
  return {
    claim,
    evidenceIds,
    confidence: raw.confidence,
    action: raw.action,
    ...(ticker ? { ticker } : {}),
  };
}

export async function buildClaimCard(params: BuildClaimCardParams): Promise<ClaimCard> {
  const { client, model, userInput, draft, evidenceBlock, maxItems = 8 } = params;
  if (!draft.trim()) return { items: [], notes: "empty_draft" };

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a strict claim auditor for financial writing. " +
            "Extract atomic factual/inferential claims from the draft and map each claim to evidence ids like E1/E2 only if directly supported. " +
            "Ignore purely rhetorical lines, hooks, metaphors, and stylistic sentences that carry no factual assertion. " +
            "For unsupported factual claims use action='drop'. For partially supported or inferential claims use action='soften'. " +
            "Output JSON keys: items, notes.",
        },
        {
          role: "user",
          content:
            `User input:\n${userInput}\n\n` +
            `Draft answer:\n${draft}\n\n` +
            `Evidence:\n${evidenceBlock}\n\n` +
            `Constraints:\n` +
            `- max_items=${maxItems}\n` +
            `- confidence in {high, medium, low}\n` +
            `- action in {keep, soften, drop}`,
        },
      ],
    });

    const parsed = ClaimCardSchema.safeParse(
      JSON.parse(response.choices[0].message.content ?? "{}")
    );
    if (!parsed.success) return { items: [], notes: "parse_failed" };

    const normalized = parsed.data.items
      .map(normalizeClaimItem)
      .filter((x): x is ClaimCardItem => x !== null)
      .slice(0, Math.max(1, maxItems));
    return {
      items: normalized,
      notes: parsed.data.notes || "",
    };
  } catch {
    return { items: [], notes: "build_failed" };
  }
}

export async function rewriteFromClaimCard(
  params: RewriteFromClaimCardParams
): Promise<{ finalAnswer: string; notes: string }> {
  const { client, model, userInput, draft, claimCard, evidenceBlock } = params;
  if (!draft.trim()) return { finalAnswer: draft, notes: "empty_draft" };
  if (claimCard.items.length === 0) return { finalAnswer: draft, notes: "no_claims" };

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a rewrite editor for financial text. " +
            "Rewrite the draft strictly following claim-card actions. " +
            "Rules: keep claims marked keep; hedge claims marked soften; remove claims marked drop. " +
            "Do not add new factual claims beyond evidence. " +
            "Preserve the original voice, hooks, and quirky storytelling; only patch claim-carrying sentences. " +
            "Do not flatten the text into an academic or report-like tone. " +
            "Return JSON keys: final_answer, notes.",
        },
        {
          role: "user",
          content:
            `User input:\n${userInput}\n\n` +
            `Draft answer:\n${draft}\n\n` +
            `Claim card:\n${JSON.stringify(claimCard, null, 2)}\n\n` +
            `Evidence:\n${evidenceBlock}`,
        },
      ],
    });

    const parsed = RewriteSchema.safeParse(
      JSON.parse(response.choices[0].message.content ?? "{}")
    );
    if (!parsed.success || !parsed.data.final_answer.trim()) {
      return { finalAnswer: draft, notes: "rewrite_parse_failed" };
    }
    return {
      finalAnswer: parsed.data.final_answer.trim(),
      notes: parsed.data.notes || "",
    };
  } catch {
    return { finalAnswer: draft, notes: "rewrite_failed" };
  }
}
