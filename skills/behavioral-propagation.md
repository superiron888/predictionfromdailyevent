# Behavioral Propagation — 行为传播引擎

## Core Assumption
Events don't directly affect stock prices. Events change **human behavior**. Behavior changes affect industries. Industries affect stock prices.

**Behavior change is the mediating variable of ALL transmission.**

## Step 1: Behavioral Delta Analysis

For any event, ask: WHO's behavior changed, WHAT changed, HOW MUCH, and HOW LONG?

### 4 Actor Types (not just consumers!)

| Actor | Behavior Types | Example |
|-------|---------------|---------|
| **Consumer** | Spending, travel, time allocation, attention, channel choice | 感冒→居家→刷手机→流媒体DAU↑ |
| **Corporate** | Hiring, capex, inventory, risk posture, M&A appetite, strategy pivot | 关税→supply chain relocation→东南亚capex↑ |
| **Institutional** | Asset allocation, risk limits, sector rotation, compliance adjustment | 地缘冲突→EM exposure reduction→US repatriation |
| **Policy/Regulatory** | Legislation, enforcement, spending, rate decisions, emergency response | 流感大爆发→CDC升级→公共卫生拨款↑ |

### Template
```
Event: [what happened]
WHO: [which actor type(s)]
WHAT: [specific behavior change — be concrete]
HOW MUCH: [micro-adjustment / moderate shift / mode switch]
HOW LONG: [days / weeks / a quarter / structural]
```

## Step 2: Second & Third Order Effects

Don't stop at first order. Push each behavior change 2 more levels:

```
居家↑ (一阶)
  → 流媒体时长↑ (二阶)
    → 流媒体广告库存价值↑ (三阶)

缺勤↑ (一阶)
  → 零售/物流人手不足 (二阶)
    → 临时用工平台订单量↑ (三阶)

外卖↑ (一阶)
  → 配送平台单量↑ (二阶)
    → 但客单价↓（病人点粥不点大餐）(三阶) ← 反直觉！
```

**Rules**:
- Max 3 levels. Beyond 3, confidence drops exponentially.
- Each level needs a "because."
- Third-order effects are often the most interesting — most people don't get there.

## Step 3: Temporal Mismatch (Time Arbitrage)

Different effects hit at different times. Markets misprice timing.

| Time Horizon | Characteristic | Market Treatment | Edge |
|-------------|---------------|-----------------|------|
| **Immediate (0-3 days)** | Obvious, emotional | Already priced in | None — consensus zone |
| **Lagged (1-3 weeks)** | Happening but not confirmed in data | Ignored | **SWEET SPOT** — occurring but unconfirmed |
| **Delayed (1-3 months)** | Requires patience | Underappreciated | Good for medium-term thesis |
| **Reversion (3-6 months)** | Current trend reverses | Not yet discussed | Contrarian opportunity |

**Principle**: Markets overweight immediate effects and underweight lagged/delayed effects. The lagged zone (1-3 weeks) is where insight has the most value — things are ALREADY happening but haven't shown up in official data yet.

## Common Mistakes
- ❌ Only analyzing consumer behavior (corporate/institutional/policy actors matter too)
- ❌ Stopping at first order (second/third order is where the edge is)
- ❌ Treating all time horizons equally (lagged > immediate for finding non-consensus angles)
- ❌ Assuming behavior changes are permanent (most event-driven changes revert in weeks)
