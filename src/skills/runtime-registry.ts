import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SKILLS_DIR = path.join(PROJECT_ROOT, "skills");

export const SKILL_NAMES = [
  "chain-builder",
  "second-order-thinking",
  "insight-framing",
  "inversion-engine",
  "cross-domain-reasoning",
  "historical-precedent",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export interface RuntimeSkillSpec {
  name: SkillName;
  filePath: string;
  sourcePath: string;
  sourceHash: string;
  sourceRef: string;
  title: string;
  description: string;
  minPass: string[];
  raw: string;
}

function readSkillFile(name: SkillName): string {
  return fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), "utf-8");
}

function firstHeading(markdown: string): string {
  const line = markdown.split(/\r?\n/).find((x) => x.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : "";
}

function extractSection(markdown: string, headingMatchers: RegExp[]): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    headingMatchers.some((matcher) => matcher.test(line.trim()))
  );
  if (start < 0) return [];

  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line.trim())) break;
    if (/^#\s+/.test(line.trim())) break;
    out.push(line);
  }
  return out;
}

function normalizeParagraph(lines: string[]): string {
  const cleaned = lines
    .map((line) => line.trim())
    .filter((line) => line && line !== "---");
  if (cleaned.length === 0) return "";

  const para: string[] = [];
  for (const line of cleaned) {
    if (line.startsWith("- ")) break;
    para.push(line);
  }
  return para.join(" ").trim();
}

function extractBullets(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function buildRuntimeSkillSpec(name: SkillName): RuntimeSkillSpec {
  const sourcePath = path.join("skills", `${name}.md`);
  const filePath = path.join(SKILLS_DIR, `${name}.md`);
  const raw = readSkillFile(name);
  const title = firstHeading(raw) || name;
  const description =
    normalizeParagraph(
      extractSection(raw, [/^##\s+Purpose$/i, /^##\s+Why This Matters$/i])
    ) || title;
  const minPass = extractBullets(
    extractSection(raw, [/^##\s+最小通过标准/, /^##\s+Minimum Pass/i])
  );
  const sourceHash = createHash("sha1").update(raw).digest("hex").slice(0, 12);

  return {
    name,
    filePath,
    sourcePath,
    sourceHash,
    sourceRef: `${sourcePath}#${sourceHash}`,
    title,
    description,
    minPass,
    raw,
  };
}

const SKILL_SPEC_MAP = new Map<SkillName, RuntimeSkillSpec>(
  SKILL_NAMES.map((name) => [name, buildRuntimeSkillSpec(name)])
);

export function getRuntimeSkillSpec(name: SkillName): RuntimeSkillSpec {
  return SKILL_SPEC_MAP.get(name)!;
}

export function getRuntimeSkillCatalog(): RuntimeSkillSpec[] {
  return SKILL_NAMES.map((name) => getRuntimeSkillSpec(name));
}
