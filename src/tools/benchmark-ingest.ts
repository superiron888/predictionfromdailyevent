import * as fs from "fs/promises";
import { z } from "zod";
import type { RoiRunSummary } from "./roi-metrics.js";

const ScoreSchema = z.coerce.number().min(0).max(10);

const BlindQualityQuestionSchema = z.object({
  question: z.string().min(1),
  reasoning_hardness: ScoreSchema,
  angle_quality: ScoreSchema,
  expression_naturalness: ScoreSchema,
  honesty_boundaries: ScoreSchema,
  follow_up_value: ScoreSchema,
  quality_score: ScoreSchema.optional(),
  notes: z.string().optional(),
});

const BlindQualityFileSchema = z.object({
  benchmark_name: z.string().optional(),
  evaluated_model: z.string().optional(),
  scores: z.array(BlindQualityQuestionSchema).min(1),
});

const BaselineQuestionSchema = z.object({
  question: z.string().min(1),
  quality_score: z.coerce.number().nonnegative(),
  all_in_cost_usd: z.coerce.number().nonnegative(),
  wall_time_ms: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

const BaselineSummarySchema = z.object({
  avg_quality_score: z.coerce.number().nonnegative(),
  avg_all_in_cost_usd: z.coerce.number().nonnegative(),
  p95_latency_ms: z.coerce.number().nonnegative(),
  roi_score: z.coerce.number().nonnegative(),
  speed_score: z.coerce.number().nonnegative(),
});

const BaselineBenchmarkFileSchema = z.object({
  benchmark_name: z.string().optional(),
  label: z.string().default("baseline"),
  model: z.string().default("unknown"),
  questions: z.array(BaselineQuestionSchema).optional(),
  summary: BaselineSummarySchema.optional(),
});

export interface BlindQualityQuestion {
  question: string;
  reasoningHardness: number;
  angleQuality: number;
  expressionNaturalness: number;
  honestyBoundaries: number;
  followUpValue: number;
  qualityScore: number;
  notes?: string;
}

export interface BlindQualityBenchmark {
  benchmarkName?: string;
  evaluatedModel?: string;
  scores: BlindQualityQuestion[];
}

export interface BenchmarkRunMetrics {
  question: string;
  qualityScore: number | null;
  allInCostUsd: number;
  wallTimeMs: number;
}

export interface BenchmarkSummary {
  benchmarkName?: string;
  label: string;
  model: string;
  questionCount: number;
  avgQualityScore: number | null;
  avgAllInCostUsd: number;
  p95LatencyMs: number;
  roiScore: number | null;
  speedScore: number | null;
}

export interface BaselineBenchmark {
  benchmarkName?: string;
  label: string;
  model: string;
  summary: BenchmarkSummary;
  questions: BenchmarkRunMetrics[];
}

export interface BenchmarkComparison {
  baselineLabel: string;
  baselineModel: string;
  targetQualityPctOfBaseline: number | null;
  roiMultipleVsBaseline: number | null;
  speedMultipleVsBaseline: number | null;
  passesQualityFloor: boolean | null;
  passesRoiGate: boolean | null;
}

export interface BenchmarkExportQuestion extends BenchmarkRunMetrics {
  routeName?: string;
}

export interface BenchmarkExportFile {
  benchmarkName: string;
  label: string;
  model: string;
  summary: BenchmarkSummary;
  questions: BenchmarkExportQuestion[];
  baselineComparison?: BenchmarkComparison;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, x) => sum + x, 0) / values.length;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function roundMetric(value: number | null, digits = 6): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeBlindQualityQuestion(
  input: z.infer<typeof BlindQualityQuestionSchema>
): BlindQualityQuestion {
  const derivedQuality =
    (input.reasoning_hardness +
      input.angle_quality +
      input.expression_naturalness +
      input.honesty_boundaries +
      input.follow_up_value) /
    5;

  return {
    question: input.question,
    reasoningHardness: input.reasoning_hardness,
    angleQuality: input.angle_quality,
    expressionNaturalness: input.expression_naturalness,
    honestyBoundaries: input.honesty_boundaries,
    followUpValue: input.follow_up_value,
    qualityScore: input.quality_score ?? Number(derivedQuality.toFixed(4)),
    notes: input.notes,
  };
}

export async function loadBlindQualityBenchmark(path: string): Promise<BlindQualityBenchmark> {
  const raw = JSON.parse(await fs.readFile(path, "utf-8"));
  const parsed = BlindQualityFileSchema.parse(raw);
  return {
    benchmarkName: parsed.benchmark_name,
    evaluatedModel: parsed.evaluated_model,
    scores: parsed.scores.map(normalizeBlindQualityQuestion),
  };
}

export function buildBlindQualityMap(benchmark: BlindQualityBenchmark): Map<string, BlindQualityQuestion> {
  return new Map(benchmark.scores.map((score) => [score.question, score]));
}

export function summarizeRuns(input: {
  benchmarkName?: string;
  label: string;
  model: string;
  runs: BenchmarkRunMetrics[];
}): BenchmarkSummary {
  const qualityValues = input.runs
    .map((run) => run.qualityScore)
    .filter((score): score is number => score != null);
  const avgQualityScore =
    qualityValues.length > 0 ? roundMetric(avg(qualityValues), 4) : null;
  const avgAllInCostUsd =
    input.runs.length > 0 ? Number(avg(input.runs.map((run) => run.allInCostUsd)).toFixed(6)) : 0;
  const p95LatencyMs = input.runs.length > 0 ? Math.round(p95(input.runs.map((run) => run.wallTimeMs))) : 0;
  const roiScore =
    avgQualityScore != null && avgAllInCostUsd > 0 ? roundMetric(avgQualityScore / avgAllInCostUsd) : null;
  const speedScore =
    avgQualityScore != null && p95LatencyMs > 0 ? roundMetric(avgQualityScore / p95LatencyMs) : null;

  return {
    benchmarkName: input.benchmarkName,
    label: input.label,
    model: input.model,
    questionCount: input.runs.length,
    avgQualityScore,
    avgAllInCostUsd,
    p95LatencyMs,
    roiScore,
    speedScore,
  };
}

export async function loadBaselineBenchmark(path: string): Promise<BaselineBenchmark> {
  const raw = JSON.parse(await fs.readFile(path, "utf-8"));
  const parsed = BaselineBenchmarkFileSchema.parse(raw);

  const questions: BenchmarkRunMetrics[] =
    parsed.questions?.map((question) => ({
      question: question.question,
      qualityScore: question.quality_score,
      allInCostUsd: question.all_in_cost_usd,
      wallTimeMs: question.wall_time_ms,
    })) ?? [];

  const summary =
    parsed.summary != null
      ? {
          benchmarkName: parsed.benchmark_name,
          label: parsed.label,
          model: parsed.model,
          questionCount: questions.length,
          avgQualityScore: parsed.summary.avg_quality_score,
          avgAllInCostUsd: parsed.summary.avg_all_in_cost_usd,
          p95LatencyMs: parsed.summary.p95_latency_ms,
          roiScore: parsed.summary.roi_score,
          speedScore: parsed.summary.speed_score,
        }
      : summarizeRuns({
          benchmarkName: parsed.benchmark_name,
          label: parsed.label,
          model: parsed.model,
          runs: questions,
        });

  return {
    benchmarkName: parsed.benchmark_name,
    label: parsed.label,
    model: parsed.model,
    summary,
    questions,
  };
}

export function compareToBaseline(
  target: BenchmarkSummary,
  baseline: BenchmarkSummary
): BenchmarkComparison {
  const targetQualityPctOfBaseline =
    target.avgQualityScore != null && baseline.avgQualityScore != null && baseline.avgQualityScore > 0
      ? roundMetric((target.avgQualityScore / baseline.avgQualityScore) * 100, 2)
      : null;
  const roiMultipleVsBaseline =
    target.roiScore != null && baseline.roiScore != null && baseline.roiScore > 0
      ? roundMetric(target.roiScore / baseline.roiScore, 4)
      : null;
  const speedMultipleVsBaseline =
    target.speedScore != null && baseline.speedScore != null && baseline.speedScore > 0
      ? roundMetric(target.speedScore / baseline.speedScore, 4)
      : null;

  return {
    baselineLabel: baseline.label,
    baselineModel: baseline.model,
    targetQualityPctOfBaseline,
    roiMultipleVsBaseline,
    speedMultipleVsBaseline,
    passesQualityFloor:
      targetQualityPctOfBaseline == null ? null : targetQualityPctOfBaseline >= 85,
    passesRoiGate: roiMultipleVsBaseline == null ? null : roiMultipleVsBaseline >= 6,
  };
}

export function buildBenchmarkExport(input: {
  benchmarkName: string;
  label: string;
  model: string;
  questions: Array<{
    question: string;
    routeName?: string;
    roiMetrics: RoiRunSummary;
  }>;
  baseline?: BaselineBenchmark | null;
}): BenchmarkExportFile {
  const questionRuns: BenchmarkExportQuestion[] = input.questions.map((question) => ({
    question: question.question,
    routeName: question.routeName,
    qualityScore: question.roiMetrics.qualityScore,
    allInCostUsd: question.roiMetrics.allInCostUsd,
    wallTimeMs: question.roiMetrics.wallTimeMs,
  }));
  const summary = summarizeRuns({
    benchmarkName: input.benchmarkName,
    label: input.label,
    model: input.model,
    runs: questionRuns,
  });
  const baselineComparison = input.baseline
    ? compareToBaseline(summary, input.baseline.summary)
    : undefined;

  return {
    benchmarkName: input.benchmarkName,
    label: input.label,
    model: input.model,
    summary,
    questions: questionRuns,
    baselineComparison,
  };
}
