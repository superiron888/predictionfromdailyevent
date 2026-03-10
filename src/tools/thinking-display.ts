interface TechniqueResultLike {
  chain: string[];
  angle: string;
  hardness_score?: number;
  surprise_score: number;
}

interface ThinkingLike {
  signal_strength: string;
  technique_results?: {
    supply_chain?: TechniqueResultLike;
    time_reallocation?: TechniqueResultLike;
    fear_cascade?: TechniqueResultLike;
    bottleneck?: TechniqueResultLike;
  };
  best_technique?: string;
  layer3: string;
  ticker_hint: string;
  first_sentence: string;
  analogy_pick: string;
  search_queries: string[];
}

export function sanitizeThinkingForDisplay<T extends ThinkingLike>(
  thinking: T,
  options: { preferSectorOnly?: boolean } = {}
): { thinking: T; note?: string } {
  if (!options.preferSectorOnly || thinking.signal_strength === "noise") {
    return { thinking };
  }

  return {
    thinking: {
      ...thinking,
      technique_results: undefined,
      best_technique: undefined,
      layer3: "sector-first mode: company/ticker raw paths suppressed in Layer 1 display",
      ticker_hint: "",
      first_sentence: "",
      analogy_pick: "",
    },
    note: "Layer 1 sector-first mode: company/ticker raw paths suppressed in internal display.",
  };
}
