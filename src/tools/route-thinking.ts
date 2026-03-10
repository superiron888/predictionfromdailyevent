export interface RouteAdjustedThinking {
  signal_strength: string;
  technique_results?: unknown;
  best_technique?: string;
  layer3: string;
  ticker_hint: string;
  first_sentence: string;
  analogy_pick: string;
  search_queries: string[];
}

/**
 * Derive 1-2 targeted search queries from a daily-observation question.
 * Used when the code-level upgrade fires (LLM said noise, router upgraded to medium/weak),
 * so we have no LLM-generated queries to fall back on.
 */
function deriveDefaultSearchQueries(question: string): string[] {
  // Strip framing and return the core observation as the primary query
  const core = question
    .replace(/，这说明了什么[？?]?/, "")
    .replace(/^(最近|我发现|身边越来越多|我注意到|我发现身边)[，,\s]?/, "")
    .trim();
  return core ? [core] : [];
}

/**
 * Map route name to a canonical signal level for execution purposes.
 */
function routeNameToSignal(routeName: string): "noise" | "weak" | "medium" | "strong" {
  if (routeName === "weak_minimal") return "weak";
  if (routeName === "medium_standard") return "medium";
  if (routeName === "strong_full") return "strong";
  return "noise";
}

export function applyRouteThinkingGuardrail<T extends RouteAdjustedThinking>(
  thinking: T,
  forceNoiseFraming: boolean,
  routeName?: string,
  question?: string,
): T {
  if (forceNoiseFraming) {
    return {
      ...thinking,
      signal_strength: "noise",
      technique_results: undefined,
      best_technique: undefined,
      layer3: "",
      ticker_hint: "",
      first_sentence: "",
      analogy_pick: "",
      search_queries: [],
    };
  }

  // Code-level upgrade sync: route was promoted by upgradeSignalIfGroupBehavior but
  // the LLM's thinking still says "noise". Sync the signal and inject default queries
  // so that search and draft style match the route intent.
  if (
    routeName &&
    routeName !== "noise_minimal" &&
    thinking.signal_strength === "noise"
  ) {
    const upgradedSignal = routeNameToSignal(routeName);
    const defaultQueries =
      thinking.search_queries.length === 0 && question
        ? deriveDefaultSearchQueries(question)
        : thinking.search_queries;
    return {
      ...thinking,
      signal_strength: upgradedSignal,
      search_queries: defaultQueries,
    };
  }

  return thinking;
}
