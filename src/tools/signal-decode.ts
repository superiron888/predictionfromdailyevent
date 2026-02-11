import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────
// Signal Decode Tool — 信号解码器
// Extracts, classifies, and assesses user input before reasoning.
// ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  "physiological", "weather", "economic", "social", "technology",
  "policy", "nature", "daily", "geopolitical", "market_event",
  "corporate_event", "fx_commodity"
] as const;

type EventType = typeof EVENT_TYPES[number];

// ── keyword-based pre-classification (LLM overrides via event_type param) ──
const KEYWORD_MAP: Record<string, EventType> = {
  // Physiological
  "感冒": "physiological", "flu": "physiological", "生病": "physiological",
  "咳嗽": "physiological", "发烧": "physiological", "喷嚏": "physiological",
  "过敏": "physiological", "失眠": "physiological", "头疼": "physiological",
  // Weather
  "冷": "weather", "热": "weather", "暴风": "weather", "台风": "weather",
  "干旱": "weather", "洪水": "weather", "暴雪": "weather", "飓风": "weather",
  // Economic
  "cpi": "economic", "gdp": "economic", "失业": "economic", "通胀": "economic",
  "裁员": "economic", "加息": "economic", "降息": "economic",
  // Social
  "结婚": "social", "生育": "social", "老龄": "social", "远程办公": "social",
  "躺平": "social", "内卷": "social",
  // Technology
  "ai": "technology", "芯片": "technology", "电动车": "technology",
  // Policy
  "关税": "policy", "制裁": "policy", "监管": "policy", "法规": "policy",
  // Nature
  "地震": "nature", "海啸": "nature", "山火": "nature", "疫情": "nature",
  // Daily
  "堵车": "daily", "外卖": "daily", "咖啡": "daily", "逛街": "daily",
  "放假": "daily", "旅游": "daily", "出门": "daily",
  // Geopolitical
  "战争": "geopolitical", "冲突": "geopolitical", "选举": "geopolitical",
  "导弹": "geopolitical", "nato": "geopolitical",
  // Market
  "vix": "market_event", "收益率": "market_event", "利差": "market_event",
  "倒挂": "market_event",
  // Corporate
  "财报": "corporate_event", "并购": "corporate_event", "ipo": "corporate_event",
  "回购": "corporate_event",
  // FX/Commodity
  "美元": "fx_commodity", "黄金": "fx_commodity", "油价": "fx_commodity",
  "原油": "fx_commodity", "opec": "fx_commodity",
};

function classifyEvent(input: string): EventType {
  const lower = input.toLowerCase();
  for (const [keyword, type] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) return type;
  }
  return "daily"; // default fallback
}

function assessMagnitude(input: string): "micro" | "medium" | "macro" {
  const microSignals = ["我", "今天", "打了个", "有点", "感觉", "好像"];
  const macroSignals = ["全球", "战争", "冲突", "危机", "崩", "暴跌", "暴涨", "制裁", "疫情"];

  const lower = input.toLowerCase();
  const hasMacro = macroSignals.some(s => lower.includes(s));
  const hasMicro = microSignals.some(s => lower.includes(s));

  if (hasMacro) return "macro";
  if (hasMicro) return "micro";
  return "medium";
}

function needsVerification(input: string): boolean {
  // Date patterns
  const datePatterns = /\d{1,2}月\d{1,2}日|本周|昨天|今天|上周|today|yesterday|this week/i;
  // Specific numbers
  const numberPatterns = /\d+[人万亿%个名位]+/;
  // Named entity + action patterns
  const entityActionPatterns = /[A-Z]{2,}|马斯克|特朗普|拜登|华盛顿|苹果|谷歌|微软/;
  // Rumor markers
  const rumorPatterns = /听说|据报道|传闻|allegedly|rumor|breaking|突发|刚刚/i;

  return datePatterns.test(input) ||
    numberPatterns.test(input) ||
    (entityActionPatterns.test(input) && input.length > 10) ||
    rumorPatterns.test(input);
}

function extractSignals(input: string): string[] {
  // Split on common separators
  const parts = input.split(/[，,。.；;！!？?]+/).filter(s => s.trim().length > 2);
  if (parts.length <= 1) return [input.trim()];

  // Check if parts contain different topics
  const signals: string[] = [];
  let currentSignal = parts[0].trim();

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Simple heuristic: if the next part starts a new topic, it's a new signal
    const isNewTopic = !part.startsWith("但") && !part.startsWith("而且") &&
      !part.startsWith("所以") && !part.startsWith("因为") &&
      !part.startsWith("and") && !part.startsWith("but");

    if (isNewTopic && classifyEvent(part) !== classifyEvent(currentSignal)) {
      signals.push(currentSignal);
      currentSignal = part;
    } else {
      currentSignal += "，" + part;
    }
  }
  signals.push(currentSignal);

  return signals.length > 0 ? signals : [input.trim()];
}

// ── Bridge Types for Connection Generation ──
const BRIDGE_TYPES = `
## 6 Bridge Types for Connection Generation

### 1. Behavioral Bridge (4 actor types)
- **Consumer**: spending, travel, time allocation, attention, channel
- **Corporate**: hiring, capex, inventory, risk posture, strategy
- **Institutional**: allocation, risk limits, rotation, compliance
- **Policy**: legislation, enforcement, spending, emergency response

### 2. Resource Bridge
Event shifts supply/demand of a resource → who depends on it?

### 3. Narrative/Sentiment Bridge
Event changes public/market mood → mood drives what behavior?

### 4. Substitution Bridge
A weakened → who provides A's FUNCTION (not just form)?

### 5. Scale Shift Bridge
Micro observation → macro trend → market implication (or reverse)

### 6. Temporal Bridge
Immediate (priced in) → Lagged (1-3wk sweet spot) → Delayed (1-3mo) → Reversion (3-6mo)
`;

export function registerSignalDecode(server: McpServer): void {
  server.tool(
    "signal_decode",
    `Signal decoder for Mr.IF Spark. Extracts signals from user input, classifies event type, assesses magnitude, and determines if fact-checking is needed. Call this FIRST before insight_engine.
Returns: extracted signals, event classification, magnitude assessment, verification need, and bridge type suggestions for the creative engine.`,
    {
      user_input: z.string().describe("User's raw input text"),
      event_type: z.string().optional().describe(
        "LLM-classified event type (overrides keyword matching). " +
        "Values: physiological, weather, economic, social, technology, policy, nature, daily, " +
        "geopolitical, market_event, corporate_event, fx_commodity"
      ),
    },
    async ({ user_input, event_type }) => {
      const signals = extractSignals(user_input);
      const classified = (event_type as EventType) || classifyEvent(user_input);
      const magnitude = assessMagnitude(user_input);
      const verification = needsVerification(user_input);

      const isFinancialEvent = ["market_event", "corporate_event", "fx_commodity", "economic"].includes(classified);

      let output = `# Signal Decode Output\n\n`;
      output += `## Extracted Signals\n`;
      signals.forEach((s, i) => {
        output += `- Signal ${i + 1}: "${s.trim()}"\n`;
      });

      output += `\n## Classification\n`;
      output += `- **Event Type**: ${classified}${event_type ? " (LLM override)" : " (keyword match)"}\n`;
      output += `- **Category**: ${isFinancialEvent ? "FINANCIAL EVENT → use financial-transmission channels" : "DAILY-LIFE EVENT → use butterfly-effect + behavioral-propagation"}\n`;
      output += `- **Magnitude**: ${magnitude}\n`;
      output += `  - ${magnitude === "micro" ? "Light touch: 1-2 connections, keep brief and fun" : magnitude === "macro" ? "Full depth: 2-3 connections with rich historical context" : "Standard: 2-3 connections"}\n`;

      output += `\n## Verification\n`;
      output += `- **Needs Verification**: ${verification ? "YES — contains specific claims that should be fact-checked via 网络检索工具" : "NO — general observation/personal experience, proceed directly"}\n`;

      output += `\n## Reasoning Guidance\n`;
      if (isFinancialEvent) {
        output += `This is a financial event. Use financial-transmission skill:\n`;
        output += `1. Map transmission channels (sector rotation, earnings read-through, macro repricing, contagion, FX pass-through)\n`;
        output += `2. Apply 3-Question Test: Already priced in? Second derivative? Consensus wrong?\n`;
        output += `3. Find the NON-OBVIOUS angle — the obvious one is already in the price\n`;
      } else {
        output += `This is a daily-life event. Use creative reasoning pipeline:\n`;
        output += `1. **Consensus Decode**: What would most people think? Tag the biases.\n`;
        output += `2. **Behavioral Propagation**: WHO's behavior changes? Push to 2nd/3rd order.\n`;
        output += `3. **Inversion**: At least 1 connection must come from the opposite direction.\n`;
        output += `4. **Time Arbitrage**: Focus on lagged effects (1-3 weeks) — the sweet spot.\n`;
      }

      output += `\n${BRIDGE_TYPES}`;

      output += `\n## Output Reminder\n`;
      output += `- Use Setup → Flip → Land structure for each connection\n`;
      output += `- Mark consensus level: 🟢 low / 🟡 medium / 🔴 high\n`;
      output += `- Show weakest link honestly (⚠️)\n`;
      output += `- Include historical precedent with dates and numbers\n`;
      output += `- Stay under ~400 words total\n`;
      output += `- You CAN say "nothing interesting here" if signal is weak\n`;
      output += `- End with invitation to pushback or verification suggestion\n`;

      return { content: [{ type: "text" as const, text: output }] };
    }
  );
}
