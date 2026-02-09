# Financial Transmission Reasoning

## Purpose

This skill guides analysis when the INPUT is a **financial event itself** (e.g., "yield curve inverted," "NVDA earnings beat," "oil price spiked") rather than a daily-life observation. Financial-to-financial reasoning requires different mental models than daily-event-to-financial reasoning.

## When to Apply

Apply this skill when `mr_if_reason` classifies the primary event type as:
- `market_event` (yield curve, VIX, credit spreads, liquidity events)
- `corporate_event` (earnings, M&A, buybacks, analyst revisions)
- `fx_commodity` (dollar moves, gold/oil/copper price shifts, OPEC decisions)

## Core Principle: Transmission Channels

Financial events propagate through specific, well-studied channels. Your job is to **map the transmission**, not just describe the event.

### Channel 1: Sector Rotation (fastest, 0-5 days)
- **Pattern**: Signal → Institutional rebalancing → Sector winners/losers
- **Key question**: "Which sectors are mechanically affected by this signal?"
- **Example**: Yield curve inverts → Financials sell (NIM compression) → Utilities/Staples buy (defensive rotation)
- **Quantify**: Use historical rotation data. E.g., "Post-inversion 12mo: financials -15%, utilities +10%"

### Channel 2: Earnings Transmission (medium, 1-4 weeks)
- **Pattern**: Bellwether result → Read-through to peers → Analyst revisions → Sympathy moves
- **Key question**: "What does this bellwether's result tell us about the SECTOR, not just the company?"
- **Example**: NVDA beats on data center → AMD/AVGO sympathy → VST/VRT (power/cooling) re-rated
- **Quantify**: "Bellwether beat → peers +1.5-3%. Supply chain adjacents +2-5%. Effect strongest in first 2 trading days."

### Channel 3: Macro Repricing (medium-slow, weeks to months)
- **Pattern**: Data point → Fed expectation shift → Discount rate change → Valuation re-rating
- **Key question**: "Does this change the Fed's reaction function?"
- **Example**: CPI surprises high → rate cut odds fall → QQQ drops (duration compression) → XLE gains (inflation hedge)
- **Quantify**: "10Y yield +100bp → QQQ historically -8 to -12%"

### Channel 4: Contagion Mapping (variable, crisis-dependent)
- **Pattern**: Credit event → Counterparty exposure mapping → Contagion spread → Flight to safety
- **Key question**: "Who has exposure to this entity/sector?"
- **Example**: SVB collapses → regional banks panic → JPM gains (flight to quality) → GLD/TLT rally
- **Quantify**: "Distressed entity -30-80%. Sector contagion -10-25%. Safe havens +5-15%."

### Channel 5: FX/Commodity Pass-through (slow, 1-2 quarters)
- **Pattern**: Currency/commodity shift → Export/import margin impact → Earnings revision → Stock repricing
- **Key question**: "Who benefits and who suffers from this price move?"
- **Example**: DXY +10% → US multinationals cite -5% revenue headwind → Domestic small-caps relatively benefit
- **Quantify**: "DXY +10% → S&P EPS drag ~4-5%. EM currencies -8-15%. Gold miners 2-3x gold % move."

## Analytical Framework: The 3-Question Test

For every financial event input, answer these three questions before making recommendations:

1. **Already priced in?**
   - Check: Was this event widely expected? (e.g., a widely anticipated earnings beat)
   - If yes: The stock/sector may NOT move on the event itself. Look for second-order effects.
   - Signal: "Everyone knew this" → contrarian positioning may be the play.

2. **What's the second derivative?**
   - Don't just ask "what happens?" Ask "what does this CHANGE about expectations?"
   - Example: Oil spikes → first order: energy stocks up. Second derivative: Does this spike change Fed rate path? Does it hurt consumer spending enough to trigger recession fears?

3. **Where is consensus wrong?**
   - Identify the consensus trade. Then stress-test it.
   - Example: Consensus after NVDA beat = "buy more NVDA." Contrarian: NVDA barely moves (priced in), but VST/VRT (power infra) have more upside.

## Signal Strength Assessment

| Signal Type | Reliability | Typical Lead Time | Historical False Positive Rate |
|------------|-------------|-------------------|-------------------------------|
| Yield curve inversion | High | 6-24 months to recession | ~11% (1 in 9) |
| VIX >35 + put/call >1.2 | High | Contrarian buy within 6-12mo | ~15% |
| Bellwether earnings beat | Medium | 0-5 days for sympathy | ~30% (beat can be priced in) |
| IG spread >200bp | High | Weeks to months | ~10% |
| DXY extreme (>110) | Medium | 1-2 quarters for EPS impact | ~25% |
| OPEC cut announcement | Medium | Immediate to 3 months | ~20% (compliance varies) |

## Anti-Patterns (Do NOT Do This)

- [WRONG] Treat financial events like daily events — don't build 5-step butterfly chains for "yield curve inverted." It IS the financial event. Go directly to transmission mapping.
- [WRONG] Ignore the "priced in" question — financial markets process financial information much faster than they process daily-life observations.
- [WRONG] Single-channel thinking — a financial event always propagates through multiple channels. Map at least 2-3.
- [WRONG] Confuse signal with noise — a single day's VIX spike is noise; sustained VIX >25 for 2+ weeks is signal.
- [WRONG] Treat all earnings beats equally — a 1% beat on lowered expectations is completely different from a 10% beat on raised expectations.

## Integration with Other Skills

- Use **quantitative-reasoning** to assign magnitudes and probabilities to each transmission channel
- Use **second-order-thinking** to find the contrarian/hidden-winner angle
- Use **reasoning-discipline** to determine whether this event warrants light/medium/heavy analysis
- The butterfly-effect chain skill is LESS relevant for direct financial events — transmission mapping replaces it
