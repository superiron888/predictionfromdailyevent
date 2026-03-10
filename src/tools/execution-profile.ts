import type { SkillRouteProfile } from "./skill-router.js";

export type ExecutionProfileName = "research" | "production";
export type VerificationDepth = "full" | "light" | "fast";
export type TickerValidationMode = "network" | "catalog";

export interface ExecutionBudget {
  profileName: ExecutionProfileName;
  maxSearchQueries: number;
  maxCandidates: number;
  maxToolRounds: number;
  maxEvidenceItems: number;
  maxTickers: number;
  preferSectorOnly: boolean;
  useJudge: boolean;
  useClaimCard: boolean;
  verificationDepth: VerificationDepth;
  tickerValidationMode: TickerValidationMode;
}

export function normalizeExecutionProfile(
  raw: string | undefined,
  fallback: ExecutionProfileName
): ExecutionProfileName {
  const value = raw?.trim().toLowerCase();
  if (value === "research" || value === "production") return value;
  return fallback;
}

export function resolveExecutionBudget(
  route: SkillRouteProfile,
  profileName: ExecutionProfileName
): ExecutionBudget {
  if (profileName === "research") {
    return {
      profileName,
      maxSearchQueries: route.maxSearchQueries,
      maxCandidates: route.maxCandidates,
      maxToolRounds: route.maxSearchQueries,
      maxEvidenceItems: 12,
      maxTickers: route.maxTickers,
      preferSectorOnly: route.preferSectorOnly,
      useJudge: route.maxCandidates > 1,
      useClaimCard:
        route.routeName === "medium_standard" || route.routeName === "strong_full",
      verificationDepth: "full",
      tickerValidationMode: "network",
    };
  }

  switch (route.routeName) {
    case "noise_minimal":
      return {
        profileName,
        maxSearchQueries: 0,
        maxCandidates: 1,
        maxToolRounds: 0,
        maxEvidenceItems: 0,
        maxTickers: 0,
        preferSectorOnly: route.preferSectorOnly,
        useJudge: false,
        useClaimCard: false,
        verificationDepth: "fast",
        tickerValidationMode: "catalog",
      };
    case "weak_minimal":
      return {
        profileName,
        maxSearchQueries: 0,
        maxCandidates: 1,
        maxToolRounds: 0,
        maxEvidenceItems: 0,
        maxTickers: 0,
        preferSectorOnly: true,
        useJudge: false,
        useClaimCard: false,
        verificationDepth: "fast",
        tickerValidationMode: "catalog",
      };
    case "follow_up":
      return {
        profileName,
        maxSearchQueries: Math.min(route.maxSearchQueries, 1),
        maxCandidates: 1,
        maxToolRounds: 0,
        maxEvidenceItems: 4,
        maxTickers: Math.min(route.maxTickers, 1),
        preferSectorOnly: false,
        useJudge: false,
        useClaimCard: false,
        verificationDepth: "fast",
        tickerValidationMode: "catalog",
      };
    case "medium_standard":
      return {
        profileName,
        maxSearchQueries: Math.min(route.maxSearchQueries, 1),
        maxCandidates: 1,
        maxToolRounds: 0,
        maxEvidenceItems: 4,
        maxTickers: 0,
        preferSectorOnly: true,
        useJudge: false,
        useClaimCard: false,
        verificationDepth: "fast",
        tickerValidationMode: "catalog",
      };
    case "strong_full":
    default:
      return {
        profileName,
        maxSearchQueries: Math.min(route.maxSearchQueries, 1),
        maxCandidates: 1,
        maxToolRounds: 0,
        maxEvidenceItems: 6,
        maxTickers: 0,
        preferSectorOnly: true,
        useJudge: false,
        useClaimCard: false,
        verificationDepth: "fast",
        tickerValidationMode: "catalog",
      };
  }
}
