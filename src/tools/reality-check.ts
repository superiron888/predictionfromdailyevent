import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────
// Reality Check Tool — 对抗性验证 + 共识检测
// Validates candidate connections by attacking them.
// This is Mr.IF Spark's "mirror" — prevents Beardstown Ladies syndrome.
// ────────────────────────────────────────────────────────────────

export function registerRealityCheck(server: McpServer): void {
  server.tool(
    "reality_check",
    `Mr.IF Spark's adversarial validation engine. Takes candidate connections from insight_engine and stress-tests them.
Returns: causal gate results, historical validation (with counter-examples), adversarial attack results, consensus detection, and confidence assessment.
Call this AFTER generating candidate connections with insight_engine.
This tool provides the validation framework — YOU (the LLM) perform the actual analysis using its structure.`,
    {
      user_input: z.string().describe("Original user input"),
      event_type: z.string().describe("Classified event type"),
      candidate_connections: z.string().describe(
        "Brief description of the 4-6 candidate connections generated from insight_engine reasoning"
      ),
    },
    async ({ user_input, event_type, candidate_connections }) => {
      let output = `# Reality Check — Adversarial Validation Framework\n\n`;
      output += `**Input**: "${user_input}"\n`;
      output += `**Event Type**: ${event_type}\n`;
      output += `**Candidates**: ${candidate_connections}\n\n`;

      // ── Gate 1: Causal Test ──
      output += `## Gate 1: Causal Test (apply to EACH candidate)\n\n`;
      output += `For each connection chain, check all 4:\n\n`;
      output += `| Checkpoint | Question | Pass/Fail |\n`;
      output += `|-----------|----------|----------|\n`;
      output += `| ☐ Time sequence | Does cause precede effect? | |\n`;
      output += `| ☐ Mechanism clarity | Does each link have a specific "because"? No leaps? | |\n`;
      output += `| ☐ Exclusivity | Is this THE cause, or are there confounders? | |\n`;
      output += `| ☐ Magnitude | Is effect size proportional to cause? Not exaggerated? | |\n\n`;
      output += `**Rule**: If a candidate fails 2+ checkpoints → KILL IT.\n\n`;

      // ── Gate 2: Historical Validation ──
      output += `## Gate 2: Historical Validation\n\n`;
      output += `For each surviving candidate:\n\n`;
      output += `### Path A: Precedent EXISTS\n`;
      output += `- Find a structural analogy (same MECHANISM, not just similar surface)\n`;
      output += `- Structure: Event → Date → Mechanism → Market reaction (specific %) → Sustained or reverted?\n`;
      output += `- **MANDATORY**: Also search for COUNTER-EXAMPLES (times when this logic DIDN'T work)\n`;
      output += `- Counter-example format: "But in [year], [similar event] happened and [expected result] did NOT occur because [reason]"\n\n`;

      output += `### Path B: No precedent (novel event)\n`;
      output += `- Switch to MECHANISM analogy: Has this causal mechanism played out in OTHER domains?\n`;
      output += `- Example: "Musk paying legal fees has no direct precedent, but 'public figure takes polarizing stance → brand polarization → customer segmentation' played out with Nike-Kaepernick in 2018"\n`;
      output += `- Mark confidence as MEDIUM (mechanism analogy is weaker than direct precedent)\n\n`;

      output += `### Confidence Levels\n`;
      output += `| Level | Basis | Language to use |\n`;
      output += `|-------|-------|-----------------|\n`;
      output += `| HIGH | Direct historical precedent with matching mechanism | "历史数据显示..." |\n`;
      output += `| MEDIUM | Mechanism analogy from other domain | "类似的机制在[X]事件中验证过..." |\n`;
      output += `| LOW | Pure reasoning, no precedent or analogy | "这是一个思想实验：如果..." |\n\n`;

      // ── Gate 3: Adversarial Attack ──
      output += `## Gate 3: Adversarial Attack (THE MOST IMPORTANT GATE)\n\n`;
      output += `For each surviving candidate, SWITCH TO ATTACKER ROLE:\n\n`;
      output += `**Not a polite pre-mortem. An aggressive short-seller's attack.**\n\n`;
      output += `Template for each candidate:\n`;
      output += `\`\`\`\n`;
      output += `Connection: [the chain]\n\n`;
      output += `🔴 ATTACK:\n`;
      output += `1. Short-seller argument: [strongest counter-argument]\n`;
      output += `2. Counter-example: [specific time this logic FAILED, with date and numbers]\n`;
      output += `3. Weakest link: [which step] because [specific reason]\n`;
      output += `4. This breaks if: [observable condition the user can check]\n`;
      output += `5. If wrong in 3 months, most likely because: [root cause]\n`;
      output += `\`\`\`\n\n`;

      output += `**Judgment rules**:\n`;
      output += `- Can't find strong counter-argument → connection is probably too OBVIOUS (it's consensus)\n`;
      output += `- Counter-argument is DEVASTATING → KILL the connection\n`;
      output += `- Counter-argument is real but manageable → KEEP, and SHOW the weakness to user (⚠️)\n\n`;

      // ── Gate 4: Consensus Filter ──
      output += `## Gate 4: Consensus Filter\n\n`;
      output += `Tag each surviving connection:\n\n`;
      output += `| Tag | Meaning | Test |\n`;
      output += `|-----|---------|------|\n`;
      output += `| 🟢 Low consensus | Few discussing this angle | Can't find this on Bloomberg/CNBC/FinTwit |\n`;
      output += `| 🟡 Medium consensus | Some niche discussion | Niche analysts mention it, not headlines |\n`;
      output += `| 🔴 High consensus | Market already knows | Found in this week's Wall Street research notes |\n\n`;

      output += `**CRITICAL RULE**: If ALL surviving connections are 🔴 → DO NOT manufacture fake insight.\n`;
      output += `Instead, output honestly: "这件事在金融市场上的信息增量不大。"\n\n`;

      // ── Pattern Monotony Check ──
      output += `## Pattern Monotony Check\n\n`;
      output += `Before finalizing, check: Are you repeating your own patterns?\n\n`;
      output += `Common traps to watch for:\n`;
      output += `- ❌ Always defaulting to "behavioral change" angle\n`;
      output += `- ❌ Always finding "streaming/stay-at-home" connection\n`;
      output += `- ❌ Always using same Setup→Flip→Land formula with same structure\n`;
      output += `- ❌ Every closing is "你觉得哪条逻辑有问题？"\n\n`;
      output += `If caught repeating → force a different bridge type or inversion method.\n\n`;

      // ── Final Output Checklist ──
      output += `## Final Output Checklist\n\n`;
      output += `Before sending to user, verify:\n`;
      output += `- [ ] 2-3 connections survived all 4 gates\n`;
      output += `- [ ] At least 1 connection uses inversion/contrarian angle\n`;
      output += `- [ ] Each connection has: title, Setup→Flip→Land, historical case, verification signal, weakest link, consensus tag\n`;
      output += `- [ ] Confidence-appropriate language used (no assertive language for low-confidence connections)\n`;
      output += `- [ ] Total output ≤ 400 words\n`;
      output += `- [ ] Closes with invitation to pushback or honest disclaimer\n`;
      output += `- [ ] If nothing interesting → said so honestly\n`;
      output += `- [ ] NO specific buy/sell recommendations. Themes/sectors only, tickers as examples.\n`;
      output += `- [ ] NO probability numbers. Qualitative confidence only.\n`;
      output += `- [ ] Mirrors user's language\n`;

      return { content: [{ type: "text" as const, text: output }] };
    }
  );
}
