export interface Layer2ContractInput {
  followUp?: boolean;
  resultSeeking?: boolean;
}

export function buildLayer2ContractContext(input: Layer2ContractInput): string {
  if (!input.followUp) return "";

  const lines = [
    "[Layer 2 Contract]",
    "- This is a follow-up turn. Deepen the mechanism from the previous assistant answer instead of inventing a brand-new thesis.",
    "- Give 1-3 directions at most. A direction can be an industry lane, company type, or representative listed company when evidence supports it.",
    "- For each direction, explain why it follows from the existing chain, what to watch next, and what would break it.",
    "- Do not turn Layer 2 into a stock list or a full analyst report.",
    "- If the prior chain is weak or uncertain, say that plainly before adding specificity.",
  ];

  if (input.resultSeeking) {
    lines.push(
      "- The user is still result-seeking, so you may be more concrete than Layer 1, but mechanism and invalidation still come before names."
    );
  }

  return lines.join("\n");
}
