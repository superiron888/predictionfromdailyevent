#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSignalDecode } from "./tools/signal-decode.js";
import { registerInsightEngine } from "./tools/insight-engine.js";
import { registerRealityCheck } from "./tools/reality-check.js";

// ────────────────────────────────────────────────────────────────
// Mr.IF Spark — 思维起跑器
// "不是你的分析师，是帮你想到你没想到的"
// ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are Mr.IF Spark — a thinking companion who helps people see unexpected connections between everyday events and financial markets.

You are NOT a financial analyst. You are NOT giving investment advice.
You are a well-read, curious friend who sees the world through a financial lens.
Your job is to spark ideas that make people say "Huh, I never thought about it that way."

## WORKFLOW (follow this order):
1. Call signal_decode → get event type, magnitude, verification needs
2. If verification needed → use 网络检索工具 to fact-check → report result to user
3. Call insight_engine → get chain templates, consensus traps, inversion prompts, historical cases
4. Generate 5-6 candidate connections using the engine output + your creative reasoning
5. Call reality_check → validate candidates through 4 gates
6. Keep 2-3 surviving connections, frame with Setup→Flip→Land, output to user

## CORE RULES:
- ALWAYS interpret input as a prompt to find unexpected financial connections
- Output to THEME/SECTOR level. Tickers only as examples, NEVER as recommendations
- NO probability numbers. Use qualitative confidence language
- CAN and SHOULD say "nothing interesting here" when signal is weak
- Show weaknesses honestly (⚠️) — this builds trust
- End with invitation to pushback
- Mirror user's language. Financial terms in English.
- Total output ≤ 400 words. Brevity is respect.

## OUTPUT FORMAT (per connection):
🔗 [Provocative title]
[Setup → Flip → Land, 3-5 sentences with historical case woven in]
📚 历史印证: [year, event, what moved, by how much]
👀 验证信号: [1-2 observable signals]
⚠️ 最脆弱环节: [honest weakness]
[🟢/🟡/🔴 consensus tag]

## IDENTITY REMINDERS:
- You are a SPARK, not an oracle. Open doors, don't push through them.
- The courage to say "没什么特别值得想的" is your greatest differentiator.
- Every connection you make could be wrong. Say so.
- Your value is not accuracy — it's the breadth of angles you open up.
`.trim();

// ── Skill file listing for resource registration ──
const SKILLS = [
  // Financial backbone (adapted from Mr.IF)
  {
    name: "butterfly-effect-chain",
    description: "Causal reasoning chain builder: daily events → financial connections via 12 patterns with quality checks",
    path: "skills/butterfly-effect-chain.md"
  },
  {
    name: "financial-transmission",
    description: "5 transmission channels for financial events: sector rotation, earnings read-through, macro repricing, contagion, FX pass-through",
    path: "skills/financial-transmission.md"
  },
  {
    name: "cross-domain-reasoning",
    description: "10-discipline financial mapping with bridging rules and quantitative anchors: psychology, physiology, physics, economics, meteorology, sociology, geopolitics, supply chain, chemistry, market transmission",
    path: "skills/cross-domain-reasoning.md"
  },
  {
    name: "second-order-thinking",
    description: "Expectation gap detection: 5 tools for finding what the market hasn't priced in (So What test, Priced In check, Hidden Winner search, Time Mismatch, Expectation Direction)",
    path: "skills/second-order-thinking.md"
  },
  {
    name: "historical-precedent",
    description: "Finding and evaluating historical analogies with structural mapping, scoring rubric, and mandatory counter-example search",
    path: "skills/historical-precedent.md"
  },
  {
    name: "event-classification",
    description: "12 event types with classification decision logic, verification rules, and novel event handling",
    path: "skills/event-classification.md"
  },
  {
    name: "novel-event-reasoning",
    description: "First-principles financial analysis for events with no template: follow the money, size revenue impact, check priced-in, find non-obvious angle",
    path: "skills/novel-event-reasoning.md"
  },
  // Creative layer (new for Spark)
  {
    name: "consensus-decode",
    description: "Maps first-order reactions, tags cognitive biases (availability, anchoring, narrative fallacy, survivorship, temporal compression), checks known academic patterns (Monday Effect, January Effect, etc.)",
    path: "skills/consensus-decode.md"
  },
  {
    name: "behavioral-propagation",
    description: "Behavioral delta analysis across 4 actor types (consumer, corporate, institutional, policy), second/third order effects, temporal mismatch (time arbitrage) with sweet-spot identification",
    path: "skills/behavioral-propagation.md"
  },
  {
    name: "inversion-engine",
    description: "3 inversion methods (subject, chain, time) + substitution chain analysis + scale shift. Mandatory rule: at least 1 of every 2-3 connections MUST come from inversion.",
    path: "skills/inversion-engine.md"
  },
  {
    name: "anti-confirmation",
    description: "Adversarial self-check (attacker role, not polite pre-mortem), consensus filter (🟢🟡🔴), pattern monotony check. The 'mirror' that prevents Beardstown Ladies syndrome.",
    path: "skills/anti-confirmation.md"
  },
  {
    name: "insight-framing",
    description: "Setup→Flip→Land narrative structure, concretization rules (images > concepts), confidence-adapted language, rotating closing patterns. Turns validated connections into 'aha moments'.",
    path: "skills/insight-framing.md"
  },
];

// ── Main ──
async function main() {
  const server = new McpServer({
    name: "mr-if-spark",
    version: "1.0.0",
  });

  // Register tools
  registerSignalDecode(server);
  registerInsightEngine(server);
  registerRealityCheck(server);

  // Register skills as resources
  for (const skill of SKILLS) {
    server.resource(
      skill.name,
      `skill://${skill.name}`,
      { description: skill.description, mimeType: "text/markdown" },
      async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const skillPath = path.join(process.cwd(), skill.path);
        const content = await fs.readFile(skillPath, "utf-8");
        return {
          contents: [{
            uri: `skill://${skill.name}`,
            text: content,
            mimeType: "text/markdown",
          }],
        };
      }
    );
  }

  // Register system prompt as resource
  server.resource(
    "system-prompt",
    "prompt://system",
    { description: "Mr.IF Spark system prompt — 思维起跑器 identity and output format", mimeType: "text/markdown" },
    async () => {
      return {
        contents: [{
          uri: "prompt://system",
          text: SYSTEM_PROMPT,
          mimeType: "text/markdown",
        }],
      };
    }
  );

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
