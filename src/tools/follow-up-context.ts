import OpenAI from "openai";

export function getLastAssistantReply(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message?.role !== "assistant") continue;
    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

export function buildFollowUpSeedContext(
  history: OpenAI.Chat.ChatCompletionMessageParam[]
): string {
  const lastAnswer = getLastAssistantReply(history);
  if (!lastAnswer) return "";
  const clipped = lastAnswer.length > 2400 ? `${lastAnswer.slice(0, 2400)}...` : lastAnswer;
  return (
    `[Follow-up Seed]\n` +
    `Deepen the prior answer below instead of replacing it with a new thesis:\n${clipped}`
  );
}
