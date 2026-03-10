export interface PRDGuardrailInput {
  followUp?: boolean;
  resultSeeking?: boolean;
  signalStrength?: string;
}

function normalizeSignal(
  raw?: string
): "noise" | "weak" | "medium" | "strong" | "unknown" {
  const s = raw?.trim().toLowerCase();
  if (s === "noise" || s === "weak" || s === "medium" || s === "strong") return s;
  return "unknown";
}

export function buildPRDGuardrailContext(input: PRDGuardrailInput): string {
  const signal = normalizeSignal(input.signalStrength);
  const lines: string[] = [
    "[PRD Guardrail]",
    "- V1 product mode: conversation agent, not content feed.",
    "- V1 main battlefield is Layer 1; the answer must still be valuable even if all tickers/company names are removed.",
    "- First priority: trigger evidence over backdrop evidence. TAM/CAGR/market-size can support context, but can never be the main proof that this event matters now.",
    "- Always answer: what behavior or constraint changed now, and how does that reach revenue / cost / margin / pricing power?",
    "- Do not optimize for surprise at the expense of inevitability.",
    "- If the mechanism is weak, downgrade to sector-level wording or candid mode instead of inventing precision.",
  ];

  if (input.followUp) {
    lines.push(
      "- This turn is Layer 2: deepen the existing path, add specificity and invalidation, but do not switch into analyst-report mode."
    );
    lines.push(
      "- Layer 2 should stay on the prior mechanism chain, expand into at most 1-3 directions, and give one watchpoint or failure mode for each."
    );
  } else {
    lines.push(
      "- This turn is Layer 1: lead with angle and mechanism, not a list of tickers."
    );
  }

  if (input.resultSeeking) {
    if (input.followUp) {
      lines.push(
        "- User is explicitly asking 'what to buy': stay mechanism-first, and only name a specific listed company if the evidence ties that company directly to this event or behavior change."
      );
    } else {
      lines.push(
        "- User is explicitly asking 'what to buy': the first answer may include one concise direction, but only after the mechanism is established."
      );
      lines.push(
        "- Layer 1 default is sector/company-type wording. One representative listed company is allowed only when the evidence ties it directly to this event or behavior change."
      );
    }
  }

  if (signal === "weak" || signal === "noise") {
    lines.push(
      "- Weak/noise signal: candid or modest sector wording is preferable to decorative theses or overconfident company picks."
    );
  }

  return lines.join("\n");
}
