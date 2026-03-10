export function cleanOptionalText(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "none" ||
    lowered === "n/a"
  ) return "";
  return trimmed;
}

export function cleanOptionalTextOrUndefined(value: unknown): string | undefined {
  const cleaned = cleanOptionalText(value);
  return cleaned || undefined;
}
