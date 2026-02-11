import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────
// Insight Engine — 核心推理工具
// Generates candidate connections using financial + creative logic.
// Combines chain templates, behavioral propagation, and cross-domain bridging.
// ────────────────────────────────────────────────────────────────

// ── Event type templates ──
interface ChainTemplate {
  name: string;
  chain: string;
  theme_sectors: string[];
  example_tickers: string[];
  time_horizon: string;
  typical_magnitude: string;
}

interface EventConfig {
  description: string;
  chains: ChainTemplate[];
  consensus_traps: string[];
  inversion_prompts: string[];
  behavioral_deltas: string[];
  historical_cases: string[];
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  physiological: {
    description: "Health/body signals → healthcare, consumer behavior, labor market",
    chains: [
      {
        name: "Symptom → Behavioral Shift → Non-Pharma Winners",
        chain: "Health issue → behavior change (居家/缺勤/消费模式) → unexpected beneficiaries",
        theme_sectors: ["Streaming/Digital Media", "Food Delivery", "Temp Staffing", "Home Entertainment"],
        example_tickers: ["NFLX", "DIS", "DASH", "UBER", "RHI", "EA", "TTWO"],
        time_horizon: "1-4 weeks (lagged behind CDC data)",
        typical_magnitude: "Sector-level DAU/order volume shifts, not stock-moving unless severe season"
      },
      {
        name: "Pharma Consensus Trap → Where Edge Actually Is",
        chain: "Health event → consensus buys pharma → pharma barely moves → real impact elsewhere",
        theme_sectors: ["Pharma (consensus, low alpha)", "Diagnostics", "Telehealth"],
        example_tickers: ["PFE", "JNJ", "ABT", "TDOC", "HIMS"],
        time_horizon: "Immediate (already priced in for pharma)",
        typical_magnitude: "Pharma: flu revenue <5% of total → negligible stock impact"
      },
      {
        name: "Labor Market Disruption → Temp Economy",
        chain: "Mass illness → absenteeism spike → staffing pressure → temp worker demand",
        theme_sectors: ["Temp Staffing", "Workforce Management", "Automation"],
        example_tickers: ["RHI", "HAYS", "MAN", "PAYC"],
        time_horizon: "2-3 weeks lag behind illness onset",
        typical_magnitude: "BLS absenteeism rate >3% = meaningful temp demand signal"
      }
    ],
    consensus_traps: [
      "Pharma stocks rarely outperform during flu season — flu is too regular, already in models",
      "Mask/PPE stocks are COVID-era reflexes, not applicable to normal flu",
      "Telehealth sounds logical but usage spikes are short-lived and small revenue impact"
    ],
    inversion_prompts: [
      "Who is HURT by mass illness? (restaurants, airlines, gyms, experiential spending)",
      "What happens AFTER the flu passes? (pent-up demand rebound for offline activities)",
      "If pharma is off the table, what IS actually affected by millions of behavior changes?"
    ],
    behavioral_deltas: [
      "Consumer: 居家时间↑, 外出↓, 外卖↑, 线上娱乐↑, 社交↓",
      "Corporate: 缺勤率↑ → 排班压力 → 临时用工需求",
      "Policy: CDC升级 → 公共卫生支出↑ (if severe)",
      "Institutional: 通常不受影响 (流感不改变宏观)"
    ],
    historical_cases: [
      "2017-18 severe flu season: CDC 19 consecutive weeks above baseline. Netflix Q1 subscriber beat +17%. RHI Q1 temp revenue +7%.",
      "2022-23 early/severe flu: Netflix LOST subscribers (competition from Disney+/short video). Shows the chain isn't automatic.",
      "2009 H1N1: Genuine pandemic scare. TDOC-type names surged short-term but reverted within weeks."
    ]
  },

  weather: {
    description: "Weather/climate → energy, agriculture, consumer behavior, insurance",
    chains: [
      {
        name: "Temperature Deviation → Energy Chain",
        chain: "Cold/heat anomaly → HDD/CDD deviation → natural gas/electricity demand → energy sector",
        theme_sectors: ["Natural Gas", "Utilities", "Energy Midstream"],
        example_tickers: ["UNG", "XLE", "ET", "WMB", "VST", "CEG"],
        time_horizon: "Immediate to 2 weeks",
        typical_magnitude: "HDD +10% deviation → nat gas ±5-8%"
      },
      {
        name: "Extreme Weather → Insurance + Rebuild",
        chain: "Hurricane/wildfire/flood → insured losses → insurance claims → building materials demand",
        theme_sectors: ["Insurance", "Home Improvement", "Building Materials"],
        example_tickers: ["ALL", "TRV", "HD", "LOW", "BLDR"],
        time_horizon: "Immediate (insurance) to months (rebuild)",
        typical_magnitude: "Cat 3+ hurricane: oil +5-15%, insurance -5-15%, HD/LOW +3-5%"
      },
      {
        name: "Weather → Consumer Behavior Shift",
        chain: "Weather extreme → changes how people spend time/money → sector rotation",
        theme_sectors: ["Outdoor Retail", "Indoor Entertainment", "E-commerce", "Food Delivery"],
        example_tickers: ["NKE", "LULU", "NFLX", "AMZN", "DASH"],
        time_horizon: "1-3 weeks",
        typical_magnitude: "Behavioral shift typically small unless multi-week extreme"
      }
    ],
    consensus_traps: [
      "Weather forecasts are already priced in — the trade is in deviation from forecast",
      "Energy companies hedge 60-80% of production — spot price spikes have limited EPS impact",
      "Don't confuse spot and futures — nat gas spot surge ≠ far-month futures moving"
    ],
    inversion_prompts: [
      "If everyone buys energy on cold snap, what happens when weather normalizes? (reversion trade)",
      "Warm winter: energy loses, but who wins? (outdoor retail, travel, restaurants)",
      "Who is hurt by the weather consensus trade being crowded?"
    ],
    behavioral_deltas: [
      "Consumer: cold → indoor activities, hot → cooling/beverage/indoor, storm → prep shopping",
      "Corporate: energy companies adjust production, agriculture replans",
      "Policy: extreme weather → emergency spending, climate regulation debate"
    ],
    historical_cases: [
      "2021 Texas freeze: natural gas spot +500%, but futures barely moved. Energy stocks +15-20% short-term, reverted in 3 weeks.",
      "2012 US drought: corn +50%, soybean +30%. MOS and ADM outperformed for 2 months.",
      "Warm winter 2023-24: UNG -30% over season. But outdoor consumer stocks (NKE) didn't meaningfully outperform."
    ]
  },

  daily: {
    description: "Everyday observations → consumption patterns, behavioral trends, emerging signals",
    chains: [
      {
        name: "Consumption Observation → Industry Trend",
        chain: "Consumer behavior change → underlying driver → industry growth/decline → sector leaders",
        theme_sectors: ["Consumer Discretionary", "Consumer Staples", "E-commerce", "Services"],
        example_tickers: ["AMZN", "SBUX", "MCD", "COST", "LULU", "ABNB"],
        time_horizon: "Variable — need to distinguish trend vs fad",
        typical_magnitude: "Depends on whether observation reflects micro or macro trend"
      },
      {
        name: "Behavioral Pattern → Hidden Demand Signal",
        chain: "Observable behavior → demand signal not yet in official data → leading indicator",
        theme_sectors: ["Varies by observation"],
        example_tickers: ["Varies"],
        time_horizon: "2-4 weeks ahead of official data",
        typical_magnitude: "Small unless observation reflects broad trend"
      }
    ],
    consensus_traps: [
      "Personal anecdotes ≠ trends — 'my friend does X' needs macro data confirmation",
      "Seasonal patterns are already modeled — 'more people traveling for holidays' is noise",
      "Don't over-interpret mundane observations — sometimes coffee is just coffee"
    ],
    inversion_prompts: [
      "If everyone is doing X, who serves the people NOT doing X?",
      "What happens when this trend reverses? Who benefits from the snap-back?",
      "Is this observation macro-meaningful, or should I honestly say 'not much signal here'?"
    ],
    behavioral_deltas: [
      "Focus on: What CHANGED vs. what's normal/seasonal?",
      "Ask: Is this anecdote or data? Does CDC/BLS/Census confirm?",
      "Key: The observation matters less than WHY the behavior changed"
    ],
    historical_cases: [
      "Holiday travel surge: predictable, priced in. Only deviations matter (e.g., TSA throughput +15% vs forecast).",
      "Starbucks new product launch: historically minimal stock impact unless it's a category-defining shift (like Pumpkin Spice creating seasonal demand).",
      "Traffic observations: correlated with economic activity but too noisy for individual stock calls."
    ]
  },

  geopolitical: {
    description: "Conflicts, diplomacy, sanctions → safe haven, commodities, supply chains, defense",
    chains: [
      {
        name: "Conflict → Panic → Safe Haven",
        chain: "Geopolitical event → VIX spike → flight to safety → gold/treasuries/USD",
        theme_sectors: ["Safe Haven Assets", "Defense", "Energy (if supply affected)"],
        example_tickers: ["GLD", "TLT", "LMT", "RTX", "XLE", "USO"],
        time_horizon: "Immediate (0-48h panic) → 80% revert in 1-4 weeks",
        typical_magnitude: "VIX +5-15 points, GLD +2-5%, equities -2-5% (typically)"
      },
      {
        name: "Sanctions/Conflict → Supply Disruption → Alternative Suppliers",
        chain: "Geopolitical action → supply from country X cut → alternative suppliers benefit",
        theme_sectors: ["Energy", "Agriculture", "Semiconductors", "Critical Minerals"],
        example_tickers: ["XOM", "COP", "ADM", "INTC", "MP"],
        time_horizon: "Weeks to months",
        typical_magnitude: "Commodity +10-30% if major supplier affected"
      },
      {
        name: "Long-term Supply Chain Restructuring",
        chain: "Sustained geopolitical tension → reshoring/friend-shoring → capex in new locations",
        theme_sectors: ["Industrial Automation", "US Manufacturing", "Logistics"],
        example_tickers: ["ROK", "EMR", "CAT", "GE", "FDX"],
        time_horizon: "6+ months (structural, usually underestimated)",
        typical_magnitude: "Slow-burn, not suitable for short-term thinking"
      }
    ],
    consensus_traps: [
      "80% of geopolitical shocks are over-estimated short-term and revert in 1-4 weeks",
      "Supply chain restructuring is under-estimated long-term",
      "Defense stocks often price in conflict before retail investors notice"
    ],
    inversion_prompts: [
      "If the conflict resolves faster than expected, who benefits from the peace dividend?",
      "What if the market is OVERREACTING? (Most geopolitical events → reversion in 2-4 weeks)",
      "Who is hurt by the safe-haven CROWDING? (Expensive gold/treasuries when risk returns)"
    ],
    behavioral_deltas: [
      "Institutional: risk-off → EM reduction → DM repatriation",
      "Consumer: travel patterns shift, sentiment dampened",
      "Policy: defense spending, emergency measures, sanctions",
      "Corporate: supply chain review, risk management tightening"
    ],
    historical_cases: [
      "Russia-Ukraine 2022: Energy +40% (sustained — real supply disruption). Defense +25%. But European stocks reverted most losses by 6 months.",
      "US-Iran tensions Jan 2020: Oil +5%, GLD +3%, both reverted in 2 weeks (no actual supply disruption).",
      "Crimea 2014: VIX spiked, markets -3%, full recovery in 3 weeks."
    ]
  },

  social: {
    description: "Social trends, cultural shifts, demographic changes → consumption, industry restructuring",
    chains: [
      {
        name: "Social Trend → Consumption Shift",
        chain: "Behavioral/cultural change → spending pattern shift → industry winners/losers",
        theme_sectors: ["Consumer", "Technology", "Healthcare", "Real Estate"],
        example_tickers: ["Varies by trend"],
        time_horizon: "Months to years (structural trends)",
        typical_magnitude: "Large if structural, negligible if fad"
      }
    ],
    consensus_traps: [
      "Distinguish trend from fad — needs penetration rate and adoption curve analysis",
      "Social media buzz ≠ economic impact",
      "Generational stereotypes oversimplify actual spending data"
    ],
    inversion_prompts: [
      "If this social trend reverses, who benefits?",
      "Who profits from the BACKLASH against this trend?",
      "Is the market pricing this as a permanent shift when it might be temporary?"
    ],
    behavioral_deltas: [
      "Consumer: fundamental preference shifts in spending, living, working",
      "Corporate: talent strategy, workplace design, product development",
      "Policy: regulation response to social changes"
    ],
    historical_cases: [
      "Remote work (2020-present): ZM 5x then -90%. EQIX steadily +40%. The 'obvious' play (ZM) was wrong; the infrastructure play was right.",
      "GLP-1/Ozempic culture (2023-): LLY +100%, but MDLZ and snack stocks only -5-10% (overhyped fear).",
      "Meme stock phenomenon (2021): GME/AMC spectacular but temporary. Structural winner was options market infrastructure."
    ]
  },

  market_event: {
    description: "Market structure events → use financial transmission channels directly",
    chains: [
      {
        name: "Yield/Credit/Vol Signal → Transmission Mapping",
        chain: "Market signal → transmission channel → sector rotation",
        theme_sectors: ["Rate-sensitive sectors", "Safe havens", "Cyclicals"],
        example_tickers: ["TLT", "QQQ", "XLF", "GLD", "KRE"],
        time_horizon: "Varies by signal strength",
        typical_magnitude: "See financial-transmission skill for specific quantification"
      }
    ],
    consensus_traps: [
      "Financial events are processed fastest by markets — very little edge for retail",
      "The edge is in second-derivative thinking, not first-order reaction"
    ],
    inversion_prompts: [
      "What if this signal is a false positive? (Historical false positive rates matter)",
      "If everyone is positioned for this, what's the crowded trade risk?"
    ],
    behavioral_deltas: [
      "Institutional: immediate rebalancing",
      "Retail: typically 1-2 days behind institutions",
      "Policy: Fed response if systemic"
    ],
    historical_cases: [
      "See financial-transmission skill for detailed historical data by signal type."
    ]
  },

  corporate_event: {
    description: "Earnings, M&A, management changes → sector read-through, sympathy plays",
    chains: [
      {
        name: "Bellwether → Sector Read-Through",
        chain: "Company result → peer implication → supply chain implication → sector re-rating",
        theme_sectors: ["Same sector peers", "Supply chain adjacents"],
        example_tickers: ["Depends on specific company"],
        time_horizon: "0-5 days for sympathy, 1-4 weeks for re-rating",
        typical_magnitude: "Peers +1.5-3%, supply chain +2-5%"
      }
    ],
    consensus_traps: [
      "Earnings beats on lowered expectations ≠ genuine strength",
      "Beat + guide down → usually falls. Miss + guide up → usually rises.",
      "The specific company is consensus; the supply chain read-through is where edge is"
    ],
    inversion_prompts: [
      "If this company succeeded, does that mean its competitor is failing? Or growing market lifts all boats?",
      "What's the second-order effect on the company's SUPPLIERS or CUSTOMERS?"
    ],
    behavioral_deltas: [
      "Institutional: analyst revision cascade, fund rebalancing",
      "Corporate: competitive response, pricing strategy adjustment"
    ],
    historical_cases: [
      "NVDA Q3 2023 beat: NVDA +7%, but VST/VRT (power/cooling) +15-20% in following weeks (supply chain read-through)."
    ]
  },

  // Simplified configs for remaining types (technology, policy, nature, fx_commodity, economic)
  technology: {
    description: "Tech breakthroughs → industry disruption, infrastructure demand, winner/loser revaluation",
    chains: [{
      name: "Tech Paradigm → Shovel Seller → Infrastructure",
      chain: "Tech breakthrough → application explosion → infrastructure demand → 'shovel sellers' benefit",
      theme_sectors: ["Semiconductor", "Cloud", "Data Center", "Power/Cooling"],
      example_tickers: ["NVDA", "AVGO", "MSFT", "AMZN", "VST", "VRT"],
      time_horizon: "Quarters to years",
      typical_magnitude: "Paradigm shifts are the largest magnitude events"
    }],
    consensus_traps: ["The application layer is consensus; the infrastructure layer is where edge is"],
    inversion_prompts: ["What if this tech is overhyped? Who benefits from the correction?"],
    behavioral_deltas: ["Corporate: capex surge → infrastructure providers benefit"],
    historical_cases: ["AI 2023-24: NVDA was consensus. Real surprise winners: VST (nuclear power), VRT (cooling). Infra > application."]
  },

  policy: {
    description: "Government actions → regulatory impact, sector rotation, compliance costs",
    chains: [{
      name: "Policy → Industry Impact → Adjustment",
      chain: "Regulation/tariff/subsidy → affected industry cost/revenue change → repricing",
      theme_sectors: ["Depends on specific policy"],
      example_tickers: ["Depends on policy"],
      time_horizon: "Weeks to years depending on implementation",
      typical_magnitude: "Policy certainty matters more than policy direction"
    }],
    consensus_traps: ["Policy announcements are priced in; implementation surprises are not"],
    inversion_prompts: ["What if this policy is watered down or reversed?"],
    behavioral_deltas: ["Corporate: compliance cost, strategic pivot. Consumer: behavioral response to incentives"],
    historical_cases: ["Tariffs 2018-19: First round → market -10%. Second round → market -3%. Adaptation reduces impact."]
  },

  nature: {
    description: "Natural disasters → insurance, supply chain, infrastructure, safety regulation",
    chains: [{
      name: "Disaster → Insurance + Rebuild",
      chain: "Natural event → damage assessment → insurance claims → rebuilding demand",
      theme_sectors: ["Insurance", "Construction", "Building Materials"],
      example_tickers: ["ALL", "TRV", "HD", "LOW", "CAT"],
      time_horizon: "Immediate (insurance) → months (rebuild)",
      typical_magnitude: "Depends on insured losses. >$10B = material."
    }],
    consensus_traps: ["Insurance stocks often recover because they can raise premiums after disasters"],
    inversion_prompts: ["If disasters increase insurance premiums, that's actually GOOD for insurers long-term"],
    behavioral_deltas: ["Consumer: prep buying, relocation. Policy: emergency spending, regulation review"],
    historical_cases: ["Hurricane Katrina 2005: Insurance -15% initially, then +20% over 12 months (premium hikes). HD/LOW +10%."]
  },

  fx_commodity: {
    description: "Currency/commodity moves → earnings impact, trade flows, inflation transmission",
    chains: [{
      name: "FX/Commodity Shift → Earnings Impact",
      chain: "Price move → export/import margin change → earnings revision → stock repricing",
      theme_sectors: ["Multinationals", "Commodity producers", "Import-dependent sectors"],
      example_tickers: ["XOM", "GOLD", "NEM", "DXY-sensitive stocks"],
      time_horizon: "1-2 quarters for earnings impact",
      typical_magnitude: "DXY +10% → S&P EPS drag ~4-5%"
    }],
    consensus_traps: ["Commodity price moves are often mean-reverting; don't extrapolate"],
    inversion_prompts: ["If oil spikes, obvious = energy stocks up. But what about consumer spending drag?"],
    behavioral_deltas: ["Institutional: currency hedging adjustments. Corporate: pricing strategy, sourcing changes"],
    historical_cases: ["Oil spike 2022: Energy +40% (sustained). But consumer discretionary -15% (spending drag). Both sides mattered."]
  },

  economic: {
    description: "Economic indicators → Fed expectations, sector rotation, risk appetite",
    chains: [{
      name: "Macro Data → Fed → Sector Rotation",
      chain: "Economic data → changes Fed expectations → discount rate shift → sector repricing",
      theme_sectors: ["Rate-sensitive", "Growth vs Value", "Cyclicals vs Defensives"],
      example_tickers: ["QQQ", "TLT", "XLF", "XLU", "XLE"],
      time_horizon: "Immediate to quarters",
      typical_magnitude: "10Y +100bp → QQQ ~-8 to -12%"
    }],
    consensus_traps: ["Single data point ≠ trend. 3-month annualized is more meaningful than single month"],
    inversion_prompts: ["What if this data is revised? What if the market is overreacting to one number?"],
    behavioral_deltas: ["Institutional: rapid rebalancing. Fed: potential policy shift. Consumer: confidence impact"],
    historical_cases: ["CPI surprise Aug 2022: Market -4% in one day. But 3 months later, S&P was +10% as inflation peaked."]
  },
};

export function registerInsightEngine(server: McpServer): void {
  server.tool(
    "insight_engine",
    `Mr.IF Spark's core reasoning engine. Takes user input + event classification and returns:
- Chain templates with sector/theme mappings (not specific buy/sell)
- Consensus traps to avoid
- Inversion prompts for contrarian thinking
- Behavioral delta analysis framework
- Historical cases (with counter-examples)
- Bridge type suggestions for connection generation

Call this AFTER signal_decode. The output guides your creative reasoning — generate 5-6 candidate connections, then pass to reality_check for validation.`,
    {
      user_input: z.string().describe("User's raw input"),
      event_type: z.string().describe(
        "Classified event type from signal_decode or LLM classification"
      ),
      magnitude: z.enum(["micro", "medium", "macro"]).optional().describe(
        "Event magnitude from signal_decode"
      ),
    },
    async ({ user_input, event_type, magnitude }) => {
      const config = EVENT_CONFIGS[event_type] || EVENT_CONFIGS["daily"];
      const mag = magnitude || "medium";

      let output = `# Mr.IF Spark — Insight Engine Output v1.0\n\n`;
      output += `**Input**: "${user_input}"\n`;
      output += `**Event Type**: ${event_type} — ${config.description}\n`;
      output += `**Magnitude**: ${mag}\n\n`;

      // ── Chain Templates ──
      output += `## Chain Templates\n\n`;
      config.chains.forEach((chain, i) => {
        output += `### Template ${i + 1}: ${chain.name}\n`;
        output += `- **Logic**: ${chain.chain}\n`;
        output += `- **Theme/Sectors**: ${chain.theme_sectors.join(", ")}\n`;
        output += `- **Representative names**: ${chain.example_tickers.join(", ")}\n`;
        output += `- **Time horizon**: ${chain.time_horizon}\n`;
        output += `- **Typical magnitude**: ${chain.typical_magnitude}\n\n`;
      });

      // ── Consensus Traps ──
      output += `## ⚠️ Consensus Traps (DO NOT fall into these)\n\n`;
      config.consensus_traps.forEach(trap => {
        output += `- 🔴 ${trap}\n`;
      });

      // ── Inversion Prompts ──
      output += `\n## 🔄 Inversion Prompts (at least 1 connection MUST use one of these)\n\n`;
      config.inversion_prompts.forEach(prompt => {
        output += `- ↩️ ${prompt}\n`;
      });

      // ── Behavioral Deltas ──
      output += `\n## 🧠 Behavioral Delta Analysis\n\n`;
      config.behavioral_deltas.forEach(delta => {
        output += `- ${delta}\n`;
      });

      // ── Historical Cases ──
      output += `\n## 📚 Historical Cases (include BOTH supporting and counter-examples)\n\n`;
      config.historical_cases.forEach(c => {
        output += `- ${c}\n`;
      });

      // ── Depth Guidance ──
      output += `\n## 📏 Depth Guidance (based on magnitude: ${mag})\n\n`;
      if (mag === "micro") {
        output += `- 1-2 light connections. Keep brief and fun. OK to be playful.\n`;
        output += `- If signal is genuinely trivial, say so: "这更多是思维练习"\n`;
      } else if (mag === "macro") {
        output += `- 2-3 connections with full depth. Rich historical context.\n`;
        output += `- Cover multiple transmission channels.\n`;
        output += `- Take geopolitical/macro implications seriously.\n`;
      } else {
        output += `- 2-3 connections with standard depth.\n`;
        output += `- At least 1 historical case per connection.\n`;
        output += `- At least 1 connection from inversion.\n`;
      }

      // ── Reminder ──
      output += `\n## ⚡ Core Reminders\n\n`;
      output += `1. You are a THINKING SPARK, not an analyst. Open doors, don't push through them.\n`;
      output += `2. Output to THEME/SECTOR level. Mention tickers only as examples, never as recommendations.\n`;
      output += `3. Each connection: Setup → Flip → Land. Max ~100-150 words.\n`;
      output += `4. Mark consensus level (🟢/🟡/🔴) and show weakest link (⚠️).\n`;
      output += `5. You CAN and SHOULD say "nothing interesting here" when that's true.\n`;
      output += `6. End with invitation to pushback: "你觉得哪条逻辑有问题？"\n`;

      return { content: [{ type: "text" as const, text: output }] };
    }
  );
}
