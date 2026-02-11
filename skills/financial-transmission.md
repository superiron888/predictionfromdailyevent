# Financial Transmission — Channel Mapping for Financial Events

## When to Use
When input is a financial event itself (yield curve, earnings, oil price) rather than daily-life observation.

## 5 Transmission Channels

### Channel 1: Sector Rotation (0-5 days)
Signal → Institutional rebalancing → Sector winners/losers
- Example: Yield curve inverts → Financials sell → Utilities/Staples buy
- Quantify: "Post-inversion 12mo: financials -15%, utilities +10%"

### Channel 2: Earnings Transmission (1-4 weeks)
Bellwether result → Peer read-through → Analyst revisions → Sympathy moves
- Example: NVDA beats on data center → AMD/AVGO sympathy → VST/VRT re-rated
- Quantify: "Bellwether beat → peers +1.5-3%, supply chain +2-5%"

### Channel 3: Macro Repricing (weeks-months)
Data point → Fed expectation shift → Discount rate change → Valuation re-rating
- Example: CPI surprises high → rate cut odds fall → QQQ drops → XLE gains
- Quantify: "10Y yield +100bp → QQQ historically -8 to -12%"

### Channel 4: Contagion Mapping (crisis-dependent)
Credit event → Counterparty exposure → Contagion spread → Flight to safety
- Example: SVB → regional banks panic → JPM gains → GLD/TLT rally

### Channel 5: FX/Commodity Pass-through (1-2 quarters)
Currency/commodity shift → Export/import margins → Earnings revision → Repricing
- Example: DXY +10% → US multinationals -5% revenue headwind → Domestic small-caps benefit

## 3-Question Test (apply to every financial event)
1. **Already priced in?** Was this widely expected?
2. **What's the second derivative?** What does this CHANGE about expectations?
3. **Where is consensus wrong?** Stress-test the consensus trade.

## Signal Strength Reference
| Signal | Reliability | Lead Time | False Positive Rate |
|--------|------------|-----------|-------------------|
| Yield curve inversion | High | 6-24mo to recession | ~11% |
| VIX >35 + put/call >1.2 | High | Contrarian buy 6-12mo | ~15% |
| Bellwether earnings beat | Medium | 0-5 days sympathy | ~30% |
| IG spread >200bp | High | Weeks-months | ~10% |
| DXY extreme >110 | Medium | 1-2 quarters EPS | ~25% |
