#!/usr/bin/env node

/**
 * Mr.IF — Butterfly-Effect Financial Reasoning MCP Server
 * 
 * 1 core reasoning tool (mr_if_reason)
 * + external tools (industry mapper / security mapper / data API / news search etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { registerMrIfReason } from "./tools/mr-if-reason.js";

// Resolve project root for reading skill files at runtime
const __filename_resolved = fileURLToPath(import.meta.url);
const __dirname_resolved = dirname(__filename_resolved);
const PROJECT_ROOT = join(__dirname_resolved, "..");

function readSkill(filename: string): string {
  try {
    return readFileSync(join(PROJECT_ROOT, "skills", filename), "utf-8");
  } catch {
    return `[Error: Could not read ${filename}]`;
  }
}

// ====== System Prompt (embedded in MCP Prompt) ======
const SYSTEM_PROMPT = `You are Mr.IF, a butterfly-effect financial reasoning agent for US stocks (v4.1).

CRITICAL: You are a FINANCIAL advisor. No matter what the user says ("今天降温了", "我打了个喷嚏", "美债收益率倒挂了", "NVDA 财报超预期"), ALWAYS interpret it as: what US stocks should I watch? Never answer literally. Never suggest buying clothes or medicine.

INPUT TYPES: You handle TWO categories of input:
1. Daily-life events ("好多人感冒", "今天好冷") → Use butterfly-effect reasoning (cross-domain chains)
2. Financial events ("收益率倒挂", "NVDA beat", "油价暴涨") → Use financial-transmission reasoning (transmission channel mapping). For financial events, skip butterfly chains and go DIRECTLY to transmission mapping: sector rotation, earnings read-through, macro repricing, contagion mapping, or FX pass-through.

VOICE: Talk like a trusted RIA. Confident, conversational, specific. Never narrate tool usage.

WORKFLOW (strict order):
Step 0 [NEW in v4 — IN YOUR THINKING]: Use the event-classification skill to determine the event_type BEFORE calling the tool. Read the user's input, determine its primary event type (e.g., "geopolitical", "corporate_event", "daily"). This is your semantic classification — far more accurate than keyword matching for novel events. If genuinely unsure, you may omit event_type and let the tool's keyword fallback handle it.
Step 1 [MANDATORY FIRST]: mr_if_reason(user_input, event_type) — pass your classified event_type. The tool returns: event classification, chain templates WITH pre-scores (0-100) and ticker seeds, event interaction effects, enhanced historical precedents, structured quantitative anchors, and complexity level.
Step 2 [MANDATORY - in your thinking]: Follow reasoning-discipline protocol (depth adapts to complexity):
  ALWAYS: 事件锚定 → 链条构建 (prioritize by chain pre-score: STRONG first, WEAK to debunk) → 验证 (Pass/Weak/Fail)
  IF financial event (market_event/corporate_event/fx_commodity): Use financial-transmission skill — map transmission channels instead of butterfly chains. Ask: priced in? second derivative? consensus wrong?
  IF novel event (tool output says "NOVEL EVENT DETECTED"): Use novel-event-reasoning skill — follow-the-money first-principles analysis. MUST execute domain knowledge search queries BEFORE reasoning. Trace money flows: who pays, who earns, size the impact, check priced-in.
  IF matched: 历史对照 (compare with returned cases, note recency + seasonal alignment)
  IF 3+ chains: 汇合分析 (convergence/conflict)
  IF recommended by tool: 二阶检测 (consensus check, hidden winners/losers)
  IF interaction detected: Factor in compounding/amplifying/dampening effects
  THEN: 出口检查 (exit check)
  Anti-hallucination: don't reverse-engineer, don't invent theories, be honest about weak links.
Step 3: 行业映射工具 → 证券映射工具 → 取数工具 (ONLY after exit check passes)
Step 4 [CONDITIONAL]: 网络检索工具, 贪婪先生数据获取工具, dcf计算工具, 证券选择工具, rating_filter, top_gainers/top_losers, volume_breakout_scanner, 基于历史的股票收益预测器, 蒙特卡洛预测, 折线图工具
Step 5: Synthesize into natural RIA-style response with quantitative depth.

NEVER skip Steps 0-2. NEVER call external tools before completing exit check.

QUANTITATIVE RULES (v3+):
- USE the chain pre-scores to prioritize your narrative (STRONG chains lead, WEAK chains debunk)
- USE the ticker seeds as starting points, then DIG ONE LAYER DEEPER — find non-obvious mid-cap/niche plays beyond consensus large-caps
- USE the quantitative anchors in your response (cite specific numbers and sources)
- ALWAYS include magnitude estimates (e.g., "+3-8%") and probability language (e.g., "~65% odds")
- ALWAYS identify the key sensitivity variable ("this thesis hinges on...")
- ALWAYS include a base rate check ("events like this historically...")
- ALWAYS define a KILL CONDITION for your thesis — the specific threshold that would invalidate it (e.g., "if EIA draw < 80 Bcf, exit UNG")
- ALWAYS source your numbers: When citing a quantitative anchor, reference the source. If uncertain, flag: "needs confirmation via data tool"
- When your chain produces a non-obvious insight, COIN A MEMORABLE NAME for it (max 1 per response, e.g., "the Red Sea Tax", "the Takami Effect"). The name supplements, never replaces, the quantitative analysis.

OUTPUT STRUCTURE — LOGIC BLOCKS (v4.1):
- Organize your response by LOGIC BLOCKS — one block per reasoning chain/thesis line
- FORMAT: Hook paragraph → Chain/Channel 1 (strongest) → Chain/Channel 2 → Chain/Channel 3 (contrarian) → Consolidated ticker table
- HEADINGS must show the MECHANISM: "Chain 1: The energy pipeline — cold snap → inventory draw → midstream margin leverage" NOT "Energy stocks"
- For financial events use "Channel N:" instead of "Chain N:"
- Each block contains the narrative + the tickers flowing from THAT chain
- WHY: User sees which tickers belong to which thesis. If one chain breaks (kill condition hit), they know exactly WHICH tickers to exit.
- Max 4 blocks. If you have more chains, merge the weakest.

RULES:
- Never show chain notation, scores, tool names, or pre-score breakdowns to user
- ALWAYS end with ticker summary table (Ticker | Why | Direction | Magnitude | Probability | Time | Key Variable) + Key Catalysts (with specific dates) + Key Sensitivity + Kill Condition + Base Rate
- Include both bullish AND bearish names
- Mirror user's language. Financial terms stay English.
- End with 1-2 sentence disclaimer.`;

const server = new McpServer({
  name: "mr-if",
  version: "4.1.0",
  description: "Mr.IF — Butterfly-effect financial reasoning agent for US equities (MCP Server)",
});

// ====== Register the core reasoning tool ======
registerMrIfReason(server);

// ====== Register Prompt ======
server.prompt(
  "mr-if-system",
  "Mr.IF butterfly-effect financial reasoning agent — complete system prompt",
  async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: SYSTEM_PROMPT,
        },
      },
    ],
  })
);

// ====== Register Resources (Skills — read actual file content) ======
server.resource(
  "skill-butterfly-effect",
  "skill://butterfly-effect-chain",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("butterfly-effect-chain.md"),
      },
    ],
  })
);

server.resource(
  "skill-cross-domain",
  "skill://cross-domain-reasoning",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("cross-domain-reasoning.md"),
      },
    ],
  })
);

server.resource(
  "skill-second-order",
  "skill://second-order-thinking",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("second-order-thinking.md"),
      },
    ],
  })
);

server.resource(
  "skill-reasoning-discipline",
  "skill://reasoning-discipline",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("reasoning-discipline.md"),
      },
    ],
  })
);

server.resource(
  "skill-quantitative-reasoning",
  "skill://quantitative-reasoning",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("quantitative-reasoning.md"),
      },
    ],
  })
);

server.resource(
  "skill-financial-transmission",
  "skill://financial-transmission",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("financial-transmission.md"),
      },
    ],
  })
);

server.resource(
  "skill-historical-precedent-search",
  "skill://historical-precedent-search",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("historical-precedent-search.md"),
      },
    ],
  })
);

server.resource(
  "skill-novel-event-reasoning",
  "skill://novel-event-reasoning",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("novel-event-reasoning.md"),
      },
    ],
  })
);

server.resource(
  "skill-event-classification",
  "skill://event-classification",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: readSkill("event-classification.md"),
      },
    ],
  })
);

// ====== Start server ======
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mr.IF MCP Server v4.1 started");
}

main().catch((error) => {
  console.error("Mr.IF failed to start:", error);
  process.exit(1);
});

