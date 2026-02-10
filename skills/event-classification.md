# Event Classification Skill

> Used BEFORE calling `mr_if_reason`. You (the LLM) determine the event type semantically,
> then pass it as the `event_type` parameter. This replaces reliance on keyword matching.

---

## Why This Matters

The `mr_if_reason` tool has an internal keyword-based classifier. It works well for common
inputs but fails on:
- Novel events (Olympics, elections, scandals, disasters with no pre-coded keywords)
- Ambiguous events that span multiple categories
- Non-English/non-Chinese inputs
- Implicit financial signals buried in daily observations

**Your semantic understanding is far superior to keyword regex.** Use it.

---

## Available Event Types

| Type Key | Name | When to Use |
|----------|------|-------------|
| `physiological` | Physiological / 生理现象 | User describes body symptoms, illness, health signals (sneeze, sick, flu, headache, allergy) |
| `weather` | Weather & Climate / 天气气候 | Weather events, temperature, natural weather phenomena (cold, hot, storm, drought, heatwave) |
| `economic` | Economic Signal / 经济信号 | Economic indicators, employment, inflation, housing, interest rates (CPI, GDP, layoffs, rent) |
| `social` | Social Trend / 社会现象 | Social behavior shifts, demographic trends, cultural movements (remote work, aging, mental health, TikTok) |
| `technology` | Technology / 科技 | Tech breakthroughs, product launches, paradigm shifts (AI, chips, EV, quantum, SpaceX) |
| `policy` | Policy & Regulation / 政策法规 | Government actions, regulations, sanctions, subsidies (ban, tariff, FDA, executive order) |
| `nature` | Natural Event / 自然事件 | Natural disasters, pandemics, geological events (earthquake, tsunami, wildfire, epidemic) |
| `daily` | Daily Observation / 日常观察 | Consumer behavior, lifestyle observations, mundane signals (traffic, coffee, delivery, gym) |
| `geopolitical` | Geopolitical / 地缘政治 | International conflicts, wars, sanctions, diplomatic events (war, NATO, trade war, Middle East) |
| `market_event` | Market Structure Event / 市场结构事件 | Market mechanics, volatility, yield curves, credit events (VIX, inversion, liquidity, sell-off) |
| `corporate_event` | Corporate Event / 企业事件 | Earnings, M&A, management changes, analyst actions (beat, miss, merger, buyback, CEO) |
| `fx_commodity` | FX & Commodity Cycle / 汇率与商品周期 | Currency moves, commodity prices, resource cycles (dollar, gold, oil, copper, OPEC) |

---

## Classification Decision Logic

### Step 1: Is this a FINANCIAL event or a DAILY-LIFE event?

**Financial events** have direct market implications without needing cross-domain reasoning:
- Market structure signals → `market_event`
- Company-specific news → `corporate_event`
- Currency/commodity moves → `fx_commodity`
- Macro data releases (CPI, jobs, GDP) → `economic`

**Daily-life events** need butterfly-effect cross-domain reasoning:
- Body/health signals → `physiological`
- Weather → `weather`
- Consumer observations → `daily`
- Social trends → `social`
- Everything else that's NOT directly about markets

### Step 2: Handle AMBIGUOUS inputs

Some inputs span multiple categories. Choose the PRIMARY type based on:

1. **Financial gravity**: If the input has a direct financial transmission channel, classify
   as the financial type. E.g., "Fed可能降息" → `market_event` (not `economic`), because
   the transmission is via rate expectations, not economic fundamentals.

2. **Specificity wins**: "NVDA earnings beat" → `corporate_event` (specific), not `technology`
   (general). "Oil prices spiking" → `fx_commodity` (specific), not `geopolitical` (general).

3. **Causal root**: Trace to the root cause. "Trade war → supply chain disruption" → `geopolitical`
   (the cause), not `economic` (the effect). But "tariff on Chinese goods announced" → `policy`
   (specific policy action).

### Step 3: Handle NOVEL events (no obvious category)

For events that don't fit neatly:

| Event Type | Classify As | Rationale |
|-----------|-------------|-----------|
| Olympics / World Cup / major sports | `daily` | Consumer behavior + tourism + advertising spend |
| Elections (non-US) | `geopolitical` | Policy uncertainty + FX impact + trade relations |
| Celebrity scandals / social movements | `social` | Sentiment shift + brand impact + consumer behavior |
| Mass layoffs at specific company | `corporate_event` | Direct earnings/sentiment impact on company + sector |
| Transportation disasters | `nature` | Supply chain disruption + insurance + safety regulations |
| Epidemics / health crises | `physiological` if health-focused, `nature` if systemic | Depends on scale and framing |
| Nuclear/arms control treaties | `geopolitical` | Defense spending + safe haven flows |
| Media industry disruption | `social` if trend, `corporate_event` if specific company | Depends on framing |

### Step 4: Extract entities (in your thinking, not passed to tool)

While classifying, identify:
- **Sectors**: Which industries are directly impacted?
- **Geographies**: Which regions/countries are involved?
- **Tickers**: Any specific companies mentioned or obviously relevant?
- **Time horizon**: Is this an immediate event or structural trend?

These inform your reasoning AFTER getting the tool output.

---

## Examples

| Input | event_type | Reasoning |
|-------|-----------|-----------|
| "好多人感冒了" | `physiological` | Body symptom → pharma chain |
| "美债收益率倒挂了" | `market_event` | Direct market structure signal |
| "NVDA 财报超预期" | `corporate_event` | Specific company earnings |
| "油价暴涨" | `fx_commodity` | Commodity price move |
| "特朗普又发关税威胁" | `policy` | Specific policy action (tariff) |
| "冬奥会开幕了" | `daily` | Consumer/tourism/advertising (novel, no keyword) |
| "日本大选结果出炉" | `geopolitical` | Foreign election → policy + FX impact |
| "华盛顿邮报大裁员" | `corporate_event` | Specific company action |
| "巴基斯坦清真寺爆炸" | `geopolitical` | Regional instability → safe haven |
| "俄乌冲突升级" | `geopolitical` | International conflict |
| "Epstein丑闻文件曝光" | `social` | Social/political scandal → sentiment |
| "巴西公交车祸16人死亡" | `nature` | Disaster → infrastructure/insurance |
| "Fed可能降息" | `market_event` | Rate expectations = market structure |
| "Gen Z不买房了" | `social` | Demographic/social trend |
| "AI芯片出口限制" | `policy` | Specific policy regulation |

---

## How to Use

**Before calling `mr_if_reason`:**

```
1. Read the user's input
2. Determine event_type using the logic above
3. Call mr_if_reason with:
   - user_input: the raw input
   - event_type: your classified type (e.g., "geopolitical")
   - current_date: today's date (optional)
```

**When UNSURE:** If you genuinely can't determine the type (extremely vague input), omit
`event_type` and let the tool's internal keyword classifier handle it.

**Rule of thumb:** If you can explain in one sentence WHY the input maps to a type, provide it.
If you're guessing, don't.
