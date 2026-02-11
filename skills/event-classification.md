# Event Classification — Semantic Event Typing

## 12 Event Types
| Type | When to Use | Examples |
|------|------------|---------|
| `physiological` | Body symptoms, health | Sneeze, flu, allergy |
| `weather` | Weather, temperature, climate | Cold, storm, drought |
| `economic` | Economic indicators | CPI, GDP, layoffs, rent |
| `social` | Social behavior, cultural trends | Remote work, aging, TikTok |
| `technology` | Tech breakthroughs, launches | AI, chips, EV, SpaceX |
| `policy` | Government actions, regulations | Tariff, FDA, executive order |
| `nature` | Natural disasters, pandemics | Earthquake, wildfire, epidemic |
| `daily` | Consumer behavior, lifestyle | Traffic, coffee, delivery |
| `geopolitical` | Conflicts, diplomacy | War, sanctions, NATO |
| `market_event` | Market mechanics, volatility | VIX, yield curve, liquidity |
| `corporate_event` | Earnings, M&A, management | Beat, miss, merger, CEO |
| `fx_commodity` | Currency, commodity prices | Dollar, gold, oil, OPEC |

## Decision Logic
1. **Financial vs Daily-life?** Financial events have direct market channels → use financial types. Daily-life needs cross-domain reasoning.
2. **Ambiguous?** Financial gravity wins. Specificity wins. Trace to causal root.
3. **Novel?** Olympics → `daily`. Foreign election → `geopolitical`. Celebrity scandal → `social`. Mass layoffs → `corporate_event`.

## Verification Decision
**Verify = TRUE** when: Specific dates, numbers, named entity + action, rumor markers, breaking news framing.
**Verify = FALSE** when: General observation, hypothetical, established fact, personal experience.
When in doubt → TRUE (better to verify unnecessarily).
