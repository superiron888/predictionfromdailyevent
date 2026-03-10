import OpenAI from "openai";
import { z } from "zod";

const Layer1ContractRewriteSchema = z.object({
  final_answer: z.coerce.string().default(""),
});

export interface Layer1ContractInput {
  signalStrength: string;
  resultSeeking: boolean;
  followUp?: boolean;
}

export interface Layer1ContractRewriteInput extends Layer1ContractInput {
  client: OpenAI;
  model: string;
  userInput: string;
  answer: string;
  evidenceBlock: string;
}

function splitSentences(text: string): string[] {
  const matches = text.replace(/\s+/g, " ").trim().match(/[^。！？!?\.]+[。！？!?\.]?/gu);
  return matches?.map((x) => x.trim()).filter(Boolean) ?? [];
}

function hasMechanismSignal(text: string): boolean {
  return /(因为|所以|导致|因此|意味着|从而|使得|会让|于是|推高|压缩|拖累|because|therefore|which means|leads to|drives|hits|helps|raises|lowers)/i.test(
    text
  );
}

function hasTradeoffSignal(text: string): boolean {
  return /(如果|除非|前提是|否则|反过来|风险是|代价是|问题是|不过|但这只在|unless|but if|however|the risk|the catch|only if|fails if)/i.test(
    text
  );
}

function hasDirectionCue(text: string): boolean {
  return /(先看|优先看|更值得先看|先盯|先观察|先去看|可以先看|方向上|更像是|watch|start with|look at|focus on|lean toward)/i.test(
    text
  );
}

function hasAbstractOpening(text: string): boolean {
  const first = splitSentences(text)[0] ?? "";
  return /^(在.+背景下|这可能意味着|值得注意的是|从某种意义上|this means|worth noting|in the context of)/i.test(
    first
  );
}

export function buildLayer1ContractContext(input: Layer1ContractInput): string {
  if (input.followUp) return "";

  const lines = [
    "[Layer 1 Contract]",
    "- Write in natural paragraphs, not headings or bullets.",
    "- Keep the answer useful even if all ticker names are removed.",
    "- Structure: Spark -> Proof -> Tradeoff.",
    "- Spark: first sentence should open with a scene, behavior, or sharp concrete observation.",
    "- Proof: 1-2 sentences, including at least one explicit event -> behavior/constraint -> business impact chain.",
    "- Tradeoff: add one sentence naming when this breaks, reverses, or fails.",
    "- TAM/CAGR/market-size can support context, but cannot be the main proof.",
    input.resultSeeking
      ? "- Because the user is asking for direction, close with one concise Direction sentence. Default to sector/company-type wording; only name a specific listed company if evidence supports it."
      : "- Do not append a separate Direction sentence unless the user explicitly asked for one.",
  ];

  if (input.signalStrength === "weak" || input.signalStrength === "noise") {
    lines.push(
      "- Weak/noise signal: prefer candid or modest sector-level wording over a polished but fragile thesis."
    );
  }

  return lines.join("\n");
}

export function needsLayer1ContractRewrite(input: Layer1ContractInput & { answer: string }): boolean {
  if (input.followUp) return false;

  const answer = input.answer.trim();
  if (!answer) return false;

  const sentences = splitSentences(answer);
  const minSentences = input.signalStrength === "noise" ? 2 : 3;
  if (sentences.length < minSentences) return true;
  if (!hasMechanismSignal(answer)) return true;
  if (!hasTradeoffSignal(answer)) return true;
  if (hasAbstractOpening(answer)) return true;

  if (input.resultSeeking) {
    const tail = sentences[sentences.length - 1] ?? "";
    if (!hasDirectionCue(tail)) return true;
  }

  return false;
}

export async function enforceLayer1Contract(
  input: Layer1ContractRewriteInput
): Promise<{ finalAnswer: string; changed: boolean; note?: string }> {
  if (!needsLayer1ContractRewrite(input)) {
    return { finalAnswer: input.answer, changed: false };
  }

  try {
    const response = await input.client.chat.completions.create({
      model: input.model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a structural editor for a financial insight assistant. Rewrite the answer to satisfy the Layer 1 contract while preserving facts, language, tone, and existing citations. " +
            "Rules: (1) do not add new facts, numbers, companies, or citations; (2) no headings or bullets; (3) keep the answer naturally flowing; " +
            "(4) structure it as Spark -> Proof -> Tradeoff, and add one Direction sentence only if result-seeking is true; " +
            "(5) if the current answer depends on a ticker to feel useful, generalize toward sector/company-type wording; " +
            "(6) TAM/CAGR/market-size may stay as backdrop, but cannot be the main proof; " +
            "(7) weak or noise signals should sound candid and modest, not theatrical. Return JSON: { final_answer }.",
        },
        {
          role: "user",
          content:
            `User input:\n${input.userInput}\n\n` +
            `signal_strength=${input.signalStrength}\n` +
            `result_seeking=${input.resultSeeking ? "true" : "false"}\n\n` +
            `Answer to rewrite:\n${input.answer}\n\n` +
            `Evidence:\n${input.evidenceBlock || "(no evidence provided)"}`,
        },
      ],
    });

    const parsed = Layer1ContractRewriteSchema.safeParse(
      JSON.parse(response.choices[0].message.content ?? "{}")
    );
    const finalAnswer = parsed.success ? parsed.data.final_answer.trim() : "";
    if (!finalAnswer || finalAnswer === input.answer.trim()) {
      return { finalAnswer: input.answer, changed: false };
    }
    return { finalAnswer, changed: true, note: "layer1_contract_rewrite" };
  } catch {
    return { finalAnswer: input.answer, changed: false };
  }
}
