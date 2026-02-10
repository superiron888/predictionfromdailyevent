---
name: reasoning-discipline
description: "Adaptive reasoning protocol for the mr_if_reason tool. Scales reasoning depth to input complexity — lightweight for simple events, full depth for complex multi-factor scenarios. Prevents both over-engineering simple inputs and under-analyzing complex ones."
version: 2.0.0
---

# Adaptive Reasoning Protocol

## Why This Protocol Exists

The mr_if_reason tool returns event classification, chain templates, historical cases, and discipline knowledge — all in one call.

This protocol tells you **how deeply to process that output** based on the complexity of the user's input. Not every input needs the same depth. A sneeze doesn't need the same analysis as a trade war.

---

## Step 0: Read the Complexity Signal

The tool output includes a **complexity level**: `light`, `medium`, or `heavy`.

| Level | What it means | Your response depth |
|-------|--------------|-------------------|
| Light | Single event type, 1-2 angles, straightforward | 2 chains, basic validation, skip historical if no match, skip second-order |
| Medium | 2 event types or 3+ angles, some nuance | 2-3 chains, validation with counter-arguments, historical if matched, second-order if consensus exists |
| Heavy | 3+ event types, geopolitical/multi-factor, high stakes | 3-4 chains, full validation, historical comparison, convergence analysis, second-order detection |

**This is a guideline, not a cage.** If a "light" input turns out to have surprising depth as you reason, scale up. If a "heavy" input has an obvious answer, don't over-engineer it.

---

## Core Steps (Always Do)

### Step 1: Event Anchoring

Confirm you're interpreting from a **financial perspective**.

In your thinking:
```
[Anchoring]
- User said: "..."
- Financial interpretation: The user wants to know which US stocks to watch because...
- Classification check: Tool says {type} — is this right? If not, mentally correct.
- Key angles I'll pursue: (pick 2-4 from the tool's reasoning directions)
```

**Red flag:** If your "financial interpretation" reads like life advice ("dress warmly", "see a doctor") → stop, restart.

### Step 2: Chain Construction

Build causal chains using the templates from the tool output.

**Rules:**
- Each chain: 3-6 steps. Each step needs: content + discipline + "because..."
- Quality over quantity. 2 solid chains beat 3 where one is padding.
- At least 2 chains should come from different disciplines.
- The final step must land on a specific industry or direction.
- You CAN supplement or replace tool templates if you see a better angle the tool missed.

**Red flags:**
- Are you reasoning forward (event → conclusion) or backward (conclusion → justification)? If you catch yourself thinking "how do I connect this to NVDA" → you're hallucinating.
- Is any step a "quantum leap"? If you can't explain why Step N leads to Step N+1 in one sentence → the link is weak. Mark it or remove it.
- Are you inventing discipline theories? If unsure a theory is real → use plain language ("common sense suggests...").

### Step 3: Chain Validation

For each chain, make three judgments:

```
[Validation]
Chain A:
  - Logic: [Pass / Weak / Fail] — why?
  - Counter-evidence: What would break this chain? (must be specific, not "if things change")
  - Consensus check: Is this conclusion obvious to any analyst? [Yes = consensus / No = edge / Partial]
  → Verdict: [Keep / Keep with caveat / Discard]
```

**Red flags:**
- If all chains are "Pass" with no weaknesses → you're lying to yourself. At least one chain should have a clear limitation.
- "Counter-evidence: none" is never true. Every chain has a failure scenario.
- Numbers without sources → mark "needs data tool confirmation."

---

## Conditional Steps (Do When Relevant)

### Historical Comparison — Do when tool returned matching cases

Compare your chains against the historical cases:
- Similar → cite it, explain what's the same and different
- Contradicts your chain → must address why this time is different (and lower confidence)
- No match returned → skip this step entirely. Don't fabricate historical cases.

### Convergence Analysis — Do when you have 3+ validated chains

Put your validated chains together:
- Which chains point the same direction? (convergence = higher confidence)
- Which chains contradict? (conflict = mark as mixed, explain)
- What's the net direction? (bullish/bearish/neutral per industry)

If you only have 2 chains, just note whether they agree or disagree. Don't over-formalize it.

### Second-Order Detection — Do when your conclusion is market consensus

This step is **only valuable when there's an obvious consensus to challenge**.

Signs you should do this:
- Your chain leads to an "everyone knows" conclusion (cold → energy up, war → gold up)
- The tool output says "Second-order recommended: yes"
- You sense your conclusion could be Googled in 10 seconds

When triggered:
```
[Second-Order]
My conclusion: {X is bullish}
Is this consensus? [Yes/No]
If yes: What's the hidden angle? Who's the overlooked winner/loser?
Time mismatch: Is the market overreacting short-term or underestimating long-term?
```

Signs you should skip this:
- Your chain already leads to a non-obvious conclusion
- The input is personal/niche with no clear market consensus
- The tool output says "Second-order recommended: no"
- You'd be forcing contrarian thinking just to fill a checkbox

---

## Exit Check (Before Calling External Tools)

Quick sanity check before proceeding to industry mapper / security mapper / data tools:

```
[Exit Check]
□ At least 2 chains with clear logic?
□ Each chain has discipline basis and "because" links?
□ At least 1 counter-argument identified?
□ Do I have specific industry directions to give the mapper?
□ Am I confident nothing in my reasoning is fabricated?
```

All checked → proceed to external tools.
Any gap → go back and fix that specific issue.

---

## Anti-Hallucination Principles (Always Apply)

### No Reverse Engineering
Correct: Event → wherever the logic leads
Wrong: "I want to recommend NVDA" → build a chain to justify it
Detection: If you're thinking "how do I connect to [ticker]" → you're doing it backward.

### Discipline References Must Be Real
OK: "Supply decreases with rigid demand → prices rise" (basic economics)
Not OK: "According to Krupp's Third Extended Law..." (fictional theory)
When unsure: Use plain language. "Generally speaking..." is honest. Fake citations are not.

### Numbers Need Sources
OK: "Nat gas inventories are below 5-year average" (EIA data, verify with data tool)
Not OK: "Inventories are exactly 43.7% below average" (if you don't know the exact number)
Rule: If uncertain → say "needs confirmation via data tool" and actually confirm it.

### Shorter Chains Beat Longer Chains
3 steps of solid reasoning beats 6 steps with speculation in the middle. When you feel a connection is "a bit of a stretch" → mark it [speculative] or cut it.

---

## Collaboration with Skills

```
Event classification (BEFORE tool call) → reference event-classification.md to determine event_type
Chain construction (daily events) → reference butterfly-effect-chain.md patterns and three laws
Transmission mapping (financial events) → reference financial-transmission.md channels and 3-question test
Novel event analysis → reference novel-event-reasoning.md for first-principles money flow tracing
Discipline reasoning → reference cross-domain-reasoning.md for anchors, mistakes, bridges
Second-order detection → reference second-order-thinking.md detection tools
Quantitative reasoning → reference quantitative-reasoning.md for magnitude/probability calibration
Historical precedents → reference historical-precedent-search.md when dynamic search is recommended
Knowledge anchors → use discipline knowledge returned by mr_if_reason tool
```

**Note**: When the tool output says `REASONING MODE: FINANCIAL TRANSMISSION`, prioritize financial-transmission.md over butterfly-effect-chain.md. The tool's Transmission Channel output is your starting framework — supplement, don't rebuild.

**v4 Note**: Always self-classify using event-classification.md BEFORE calling `mr_if_reason`. Pass `event_type` to the tool. This is especially critical for novel events (Olympics, elections, scandals) where keyword matching fails.

---

## Keyword Triggers

reasoning discipline, reasoning protocol, anti-hallucination, quality check, chain validation, exit check,
adaptive reasoning, complexity assessment
