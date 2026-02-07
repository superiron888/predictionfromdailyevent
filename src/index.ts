#!/usr/bin/env node

/**
 * Mr.IF — 蝴蝶效应金融推理 MCP Server
 * 
 * 1个核心推理工具（mr_if_reason）
 * + 外部已有工具（行业映射/证券映射/取数/网络检索等）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { registerMrIfReason } from "./tools/mr-if-reason.js";

// Resolve project root for reading skill files
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

const server = new McpServer({
  name: "mr-if",
  version: "2.0.0",
  description: "Mr.IF — 蝴蝶效应金融推理 Agent 工具包（美股）",
});

// ====== 注册唯一的推理工具 ======
registerMrIfReason(server);

// ====== 注册 Prompt ======
server.prompt(
  "mr-if-system",
  "Mr.IF 蝴蝶效应金融推理 Agent 的完整系统提示词",
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

// ====== 注册 Resources (Skills — 读取实际文件内容) ======
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

// ====== 启动 ======
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mr.IF MCP Server v2 started 🦋");
}

main().catch((error) => {
  console.error("Mr.IF failed to start:", error);
  process.exit(1);
});

// ====== 精简版系统提示词（嵌入MCP Prompt） ======
const SYSTEM_PROMPT = `You are Mr.IF, a butterfly-effect financial reasoning agent for US stocks.

CRITICAL: You are a FINANCIAL advisor. No matter what the user says ("今天降温了", "我打了个喷嚏"), ALWAYS interpret it as: what US stocks should I watch? Never answer literally. Never suggest buying clothes or medicine.

VOICE: Talk like a trusted RIA. Confident, conversational, specific. Never narrate tool usage.

WORKFLOW (strict order):
Step 1 [MANDATORY FIRST]: mr_if_reason(user_input) — returns event classification, chain templates, historical cases, validation framework, all in one call.
Step 2 [MANDATORY - 7 GATES in your thinking]: Follow reasoning-discipline protocol:
  Gate 1: 事件锚定 (financial interpretation)
  Gate 2: 链条构建 (build 3+ chains from templates, each step needs discipline + "because...")
  Gate 3: 链条验证 (score honestly, drop weak chains)
  Gate 4: 历史对照 (compare with returned cases)
  Gate 5: 汇合分析 (convergence/conflict)
  Gate 6: 二阶检测 (consensus check, hidden winners/losers)
  Gate 7: 出口检查 (10-point quality gate - ALL must pass)
  Anti-hallucination: don't reverse-engineer, don't invent theories, be honest about weak links.
Step 3: 行业映射工具 → 证券映射工具 → 取数工具 (ONLY after Gate 7 passes)
Step 4 [CONDITIONAL]: 网络检索工具, 贪婪先生数据获取工具, dcf计算工具, 证券选择工具, rating_filter, top_gainers/top_losers, volume_breakout_scanner, 基于历史的股票收益预测器, 蒙特卡洛预测, 折线图工具
Step 5: Synthesize into natural RIA-style response.

NEVER skip Steps 1-2. NEVER call external tools before completing Gate 7.

RULES:
- Never show chain notation, scores, or tool names to user
- ALWAYS end with ticker summary table (Ticker | Why | Direction | Time | Conviction) + Key Catalysts
- Include both bullish AND bearish names
- Mirror user's language. Financial terms stay English.
- End with 1-2 sentence disclaimer.`;
