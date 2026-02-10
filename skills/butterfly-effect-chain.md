---
name: butterfly-effect-chain
description: "Butterfly effect causal reasoning chain builder. Starting from daily events, constructs complete reasoning chains from phenomena to financial market impacts through multi-disciplinary causal reasoning. Core reasoning engine for Mr.IF Agent."
version: 1.0.0
---

# Butterfly Effect Chain — Butterfly Effect Causal Reasoning Chain

## Usage Scenarios

Use this Skill when you need to reason from a daily event/phenomenon to financial market impacts:
- User describes a daily observation (weather, physical sensations, social phenomena, etc.)
- Need to construct a causal reasoning chain from A to Z
- Need to analyze market impacts of the same event from multiple disciplinary dimensions

## Core Methodology

### Three Laws of Butterfly Effect Reasoning

**First Law: Everything is Connected**
No event is isolated. Behind a sneeze lies respiratory health, seasonal changes, air quality,
immune system... Each factor connects to a path leading to financial markets.

**Second Law: Shorter Chains, Higher Confidence**
3-step causal chain > 5-step causal chain > 7-step causal chain.
Each additional step exponentially amplifies uncertainty. Chains exceeding 7 steps should be marked as "pure association."

**Third Law: Cross-Validation Increases Confidence**
If the same financial conclusion can be reached through causal chains from two different disciplines,
then confidence = max(chain1, chain2) + 1 star.

---

## Causal Chain Construction Process

### Phase 1: Event Deconstruction

Break down user input into **reasonably inferable atomic events**:

```
Input: "Sneezed today"

Atomic Decomposition:
├── Direct fact: A sneeze reflex occurred
├── Possible causes:
│   ├── Respiratory irritation (virus/bacteria/allergen)
│   ├── Temperature change (cold air stimulation)
│   ├── Light change (photic sneeze reflex)
│   └── Dust/foreign particle irritation
├── Temporal context:
│   ├── Current month → Seasonal factors
│   ├── Recent weather → Climate factors
│   └── Recent pandemic/flu → Public health factors
└── Extended dimensions:
    ├── Individual behavior → Group behavior (are many people sneezing?)
    ├── Symptom → Disease → Public health
    └── Body signal → Environmental signal → Systemic impact
```

### Phase 2: Multi-Dimensional Chain Generation

Generate one causal chain for each reasoning dimension. **Internal data structure** for each chain (used in your thinking, never shown to user):

```
chain_id: N
chain_name: Name
disciplines: [Disciplinary paths]
confidence: 1-5 (initial)
time_horizon: immediate / 1-2 weeks / 1 month / 1 quarter
risk_level: low / medium / high

chain_steps:
  - step_number: 1
    content: [Event/reasoning content]
    discipline: [Discipline name]
    link_strength: strong / weak

  - step_number: N (final step)
    content: Financial conclusion

financial_conclusion:
  sector: [Industry]
  stocks: [Ticker list]
  summary: [One-sentence logic summary]
```

**Note: These are internal reasoning data structures. Never display them in this format to users. Users only see natural language insights and recommendations.**

### Phase 3: Chain Quality Checks

Each chain must pass the following checks:

**[CHECK-1] Logical Coherence**
- Can each step be logically derived from the previous step?
- Are there "quantum leaps" (unexplainable large-span reasoning)?

**[CHECK-2] Disciplinary Accuracy**
- Are the referenced disciplinary principles correct?
- Has any disciplinary concept been misinterpreted?

**[CHECK-3] Explicit Assumptions**
- What assumptions are implicit in the chain?
- Are these assumptions reasonable in the current environment?

**[CHECK-4] Counter-Argument**
- Under what circumstances would this chain completely fail?
- Do reverse causal chains exist (same event leading to opposite financial conclusions)?

**[CHECK-5] Temporal Consistency**
- Do the time scales of each step match?
- Do not allow mixing "immediate effects" and "ten-year trends" in one chain

---

## Reasoning Chain Pattern Library

### Pattern 1: Symptom→Disease→Pharmaceutical Industry Chain
```
Body symptom → Disease classification → Affected population scale → Drug/treatment demand → Pharmaceutical company performance
```
Typical inputs: Sneezing, coughing, insomnia, headache

### Pattern 2: Weather→Energy→Commodity Chain
```
Weather change → Energy demand change → Commodity supply/demand → Energy/chemical company profits
```
Typical inputs: Temperature drop, heat wave, heavy rain, drought

### Pattern 3: Consumption Observation→Industry Trend→Market Leader Chain
```
Consumption phenomenon → Underlying drivers → Industry growth/decline → Industry leader stocks
```
Typical inputs: Coffee price increase, more takeout orders, empty malls

### Pattern 4: Social Sentiment→Behavioral Change→Capital Flow Chain
```
Social sentiment → Group behavior change → Consumption/investment preferences → Capital flows
```
Typical inputs: Everyone anxious, young people "lying flat", civil service exam fever

### Pattern 5: Policy Signal→Industry Adjustment→Beneficiary Chain
```
Policy direction → Industry entry/exit changes → Industrial structure adjustment → Benefiting/harmed companies
```
Typical inputs: Power restrictions, carbon neutrality, data security

### Pattern 6: Technology Breakthrough→Industrial Revolution→Value Revaluation Chain
```
Technology progress → Cost/efficiency changes → Industry landscape restructuring → Value revaluation
```
Typical inputs: AI advancement, battery breakthrough, quantum computing

### Pattern 7: Geopolitical Conflict→Supply Chain Disruption→Alternative Supplier Chain
```
Geopolitical event → Sanctions/conflict → Supply disruption from a country → Alternative suppliers benefit
```
Typical inputs: Trade war, sanctions, Taiwan Strait, Middle East

### Pattern 8: Geopolitical Conflict→Panic→Safe Haven Asset Chain
```
Conflict/crisis → Market panic (VIX↑) → Capital flight to safety → Gold/government bonds/USD
```
Typical inputs: War, nuclear threat, coup, terrorist attack

### Pattern 9: Supply Chain Bottleneck→Pricing Power→Profit Surge Chain
```
Capacity tightness in a certain link → Irreplaceable → Supplier gains extreme pricing power → Gross margin surge
```
Typical inputs: Chip shortage, lithography machine monopoly, rare earth control

### Pattern 10: Event→Fed Policy Expectation→Sector Rotation Chain
```
Economic data/event → Changes Fed rate hike/cut expectations → Interest rate-sensitive sector rotation
```
Typical inputs: CPI data, employment data, banking crisis, inflation expectations

### Pattern 11: First-Order Reasoning→Second-Order Expectation Gap→Hidden Winner Chain [Core]
```
Obvious event → Everyone focuses on intuitive winners (already priced in) → Find hidden winners/losers
```
Typical inputs: "Second-level thinking" for any event—not who benefits, but who is overlooked

### Pattern 12: Technology Paradigm→Industry Chain Restructuring→Shovel Seller Chain
```
Technology breakthrough → Application explosion → Infrastructure demand surge → "Shovel sellers" (infra providers) benefit most
```
Typical inputs: AI explosion, EV penetration inflection point, cloud computing

---

## Confidence Scoring Rules

### Bonus Points
| Condition | Bonus |
|----------|-------|
| Chain fewer than 4 steps (short chain = high certainty) | +1 |
| Historical precedent validation (historical_echo match) | +1 |
| Multiple chains converge to same conclusion (chain_confluence detection) | +0.5~1.0 |
| Real-time data support (data retrieval tool validation) | +1 |
| Based on recognized disciplinary principles (textbook-level theory) | +1 |

### Deductions
| Condition | Deduction |
|----------|-----------|
| Chain exceeds 5 steps | -1.0 |
| Contains 1 weak link jump (one reasonable speculation allowed) | -0.5 |
| Contains 2+ weak link jumps (chain unreliable) | -0.5 + each subsequent -1.0 |
| Depends on unverified assumptions | -1.0 |
| Only single discipline support | -0.5 |
| Time window uncertain | -0.5 |
| Reasoning conclusion = market consensus (no alpha) | -1.0 (second-order thinking detection) |

---

## Anti-Patterns (Prohibited Reasoning Methods)

1. **Mystical Reasoning**: Not allowed to use astrology, feng shui, metaphysics as reasoning basis
2. **Numerical Coincidence**: Not allowed "because today is the Xth, so focus on Xth stock"
3. **Hindsight Bias**: Not allowed "last time it was like this and then it rose" as sole basis
4. **Emotional Contagion**: Not allowed "I feel it will rise" as a reasoning step
5. **Infinite Extrapolation**: Not allowed to infinitely extrapolate short-term phenomena to long-term trends

## Keyword Triggers

Butterfly effect, causal reasoning, reasoning chain, if...then, correlation analysis, chain reaction, butterfly effect
