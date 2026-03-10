import { getRuntimeSkillSpec, type SkillName } from "../skills/runtime-registry.js";

export type RouteName =
  | "follow_up"
  | "noise_minimal"
  | "weak_minimal"
  | "medium_standard"
  | "strong_full";

export interface SkillRouteInput {
  signalStrength: string;
  question: string;
  layer3?: string;
  followUp?: boolean;
}

export interface SkillRouteProfile {
  routeName: RouteName;
  requiredSkills: SkillName[];
  optionalSkills: SkillName[];
  maxSearchQueries: number;
  maxCandidates: number;
  writeTemperature: number;
  maxTickers: number;
  resultSeeking: boolean;
  preferSectorOnly: boolean;
  forceNoiseFraming: boolean;
}

export interface SkillRouteContextOptions {
  maxSearchQueries?: number;
  maxCandidates?: number;
  maxTickers?: number;
  preferSectorOnly?: boolean;
  fastMode?: boolean;
}

function normalizeSignal(raw: string): "noise" | "weak" | "medium" | "strong" {
  const s = raw.trim().toLowerCase();
  if (s === "weak" || s === "medium" || s === "strong") return s;
  return "noise";
}

/**
 * Code-level signal upgrade: catches group-behavior patterns that LLM may
 * misclassify as noise due to first-person framing ("我发现身边...").
 * Only upgrades noise→medium; never downgrades an existing signal.
 */
function upgradeSignalIfGroupBehavior(
  question: string,
  currentSignal: "noise" | "weak" | "medium" | "strong"
): "noise" | "weak" | "medium" | "strong" {
  if (currentSignal !== "noise") return currentSignal;
  const q = question.toLowerCase();

  // Consumer decision-criterion shift: the question asked WHEN BUYING changes
  // e.g. "买车先问续航/充电", "买家电先问能不能接语音助手"
  const consumerStandardShift =
    /(买.{0,12}(先问|第一个问题|都问|都先问)|购.{0,6}(车|房|家电|设备).{0,10}(先问|都问|第一问))/.test(q);

  // Group infrastructure installation at neighbourhood/org scale
  // e.g. "小区装充电桩", "楼道安装人脸识别门禁"
  const groupInfrastructure =
    /(小区|社区|楼道|公共区域|园区).{0,25}(安装|改装|配备|升级|部署|装上|换上)/.test(q);

  // Collective education/training decision by parents or employers
  // e.g. "家长讨论让孩子转学AI方向", "大量报编程夏令营"
  const groupEducation =
    /(家长|孩子|父母).{0,40}(学|报名|转学|转方向|培训|课程|夏令营)/.test(q) &&
    /(越来越多|很多|大量|身边.*都|纷纷|都在讨论|开始讨论)/.test(q);

  // Obvious cross-group lifestyle/behaviour shift with scale marker
  // e.g. "越来越多朋友参加马拉松和骑行", "很多家庭给老人配智能手环"
  const groupLifestyleShift =
    /(越来越多.{0,25}(家庭|朋友|同事|人|公司).{0,15}(开始|参加|选择|配备|使用|改用|换成)|很多家庭.{0,20}(开始|给|配))/.test(q);

  // Safe-haven capital rotation: people shifting savings to gold / USD / foreign bonds
  // e.g. "开始在家里囤黄金", "把积蓄换成美元或买美债"
  const safeHavenRotation =
    /(囤黄金|买金饰|买黄金|换成美元|换美元|买美债|买外汇|换汇|避险).{0,30}/.test(q) &&
    /(好多人|很多人|身边|朋友|大家|越来越多)/.test(q);

  // Group tech-behaviour adoption: AI tools, self-checkout, skill courses used at group scale
  // e.g. "好多人开始用AI写简历", "超市自助结账队伍比收银台长", "同事碎片时间刷职业技能课"
  const groupTechAdoption =
    /(好多人|很多人|很多同事|越来越多).{0,20}(开始用|用ai|用人工智能|刷.*课|技能课|自助结账|自助收银)/.test(q) ||
    /(自助结账.{0,10}(队伍|人|比).{0,10}(长|多|收银)|碎片时间.{0,10}(刷|学|上).{0,10}(课|技能|职业))/.test(q);

  // Consumer downtrading / financial tightening at group scale
  // e.g. "很多人开始买二手奢侈品而不是新款", "聚会大家开始AA制"
  const groupDowntrading =
    /(很多人|好多人|大家|身边).{0,20}(开始买二手|买二手.{0,10}(而不是|不买新)|aa制|开始aa|不抢着买单)/.test(q);

  // Group health-monitoring tech adoption (wearables, sleep trackers, health sensors)
  // e.g. "好多朋友开始关注睡眠数据，有人买了睡眠监测设备"
  const groupHealthMonitoring =
    /(睡眠.{0,10}(监测|设备|数据)|智能手环|健康监测设备|可穿戴).{0,30}/.test(q) &&
    /(好多|很多|越来越多|大家|朋友|家庭|老人)/.test(q);

  if (
    consumerStandardShift ||
    groupInfrastructure ||
    groupEducation ||
    groupLifestyleShift ||
    safeHavenRotation ||
    groupTechAdoption ||
    groupDowntrading ||
    groupHealthMonitoring
  ) {
    return "medium";
  }
  return currentSignal;
}

function needsHistorical(question: string, layer3 = ""): boolean {
  const blob = `${question} ${layer3}`.toLowerCase();
  return /(历史|先例|此前|过去|曾经|2008|2020|recession|crisis|同比|yoy)/.test(blob);
}

function wantsQuickDirection(question: string): boolean {
  const q = question.toLowerCase();
  return /(买什么|什么标的|美国标的|标的|推荐.*标的|推荐买|买哪个|what to buy|which stock|which stocks|recommend.*stock|ticker|tickers)/.test(
    q
  );
}

function isSubjectiveSoftSignal(question: string): boolean {
  const q = question.toLowerCase();
  const softInference =
    /(看着|感觉|似乎|像是|looks|looks like|seems|feels like|mood)/.test(q) ||
    (/心情/.test(q) && /(不错|好|差|开心|高兴|乐观|糟|不好)/.test(q));
  const scalableObservable =
    /(很多人|四处都是人|排队|裁员|新品|结婚|感冒|放假|涨价|订单|销量|发布|traffic|crowd|queue|layoff|launch|holiday|wedding|cases|sales|pricing)/.test(
      q
    );
  return softInference && !scalableObservable;
}

export function chooseSkillRoute(input: SkillRouteInput): SkillRouteProfile {
  const resultSeeking = wantsQuickDirection(input.question);
  const preferSectorOnly = resultSeeking && !input.followUp;
  if (input.followUp) {
    const optional: SkillName[] = ["cross-domain-reasoning"];
    if (needsHistorical(input.question, input.layer3)) optional.push("historical-precedent");
    return {
      routeName: "follow_up",
      requiredSkills: ["chain-builder", "second-order-thinking", "insight-framing"],
      optionalSkills: optional,
      maxSearchQueries: 2,
      maxCandidates: 2,
      writeTemperature: 0.66,
      maxTickers: 2,
      resultSeeking,
      preferSectorOnly: false,
      forceNoiseFraming: false,
    };
  }

  if (isSubjectiveSoftSignal(input.question)) {
    return {
      routeName: "noise_minimal",
      requiredSkills: ["insight-framing"],
      optionalSkills: [],
      maxSearchQueries: 0,
      maxCandidates: 1,
      writeTemperature: 0.58,
      maxTickers: 0,
      resultSeeking,
      preferSectorOnly,
      forceNoiseFraming: true,
    };
  }

  const signal = upgradeSignalIfGroupBehavior(
    input.question,
    normalizeSignal(input.signalStrength)
  );
  if (signal === "noise") {
    return {
      routeName: "noise_minimal",
      requiredSkills: ["insight-framing"],
      optionalSkills: [],
      maxSearchQueries: 0,
      maxCandidates: 1,
      writeTemperature: 0.58,
      maxTickers: 0,
      resultSeeking,
      preferSectorOnly,
      forceNoiseFraming: false,
    };
  }

  if (signal === "weak") {
    const optional: SkillName[] = ["inversion-engine"];
    if (needsHistorical(input.question, input.layer3)) optional.push("historical-precedent");
    return {
      routeName: "weak_minimal",
      requiredSkills: ["chain-builder", "second-order-thinking", "insight-framing"],
      optionalSkills: optional,
      maxSearchQueries: 2,
      maxCandidates: 2,
      writeTemperature: 0.62,
      maxTickers: 0,
      resultSeeking,
      preferSectorOnly,
      forceNoiseFraming: false,
    };
  }

  if (signal === "medium") {
    const optional: SkillName[] = ["inversion-engine", "cross-domain-reasoning"];
    if (needsHistorical(input.question, input.layer3)) optional.push("historical-precedent");
    return {
      routeName: "medium_standard",
      requiredSkills: ["chain-builder", "second-order-thinking", "insight-framing"],
      optionalSkills: optional,
      maxSearchQueries: 3,
      maxCandidates: 3,
      writeTemperature: 0.70,
      maxTickers: resultSeeking ? 1 : 0,
      resultSeeking,
      preferSectorOnly,
      forceNoiseFraming: false,
    };
  }

  const optional: SkillName[] = ["inversion-engine", "cross-domain-reasoning", "historical-precedent"];
  return {
    routeName: "strong_full",
    requiredSkills: ["chain-builder", "second-order-thinking", "insight-framing"],
    optionalSkills: optional,
    maxSearchQueries: 3,
    maxCandidates: 3,
    writeTemperature: 0.74,
    maxTickers: resultSeeking ? 1 : 0,
    resultSeeking,
    preferSectorOnly,
    forceNoiseFraming: false,
  };
}

export function buildSkillRouteContext(
  route: SkillRouteProfile,
  options: SkillRouteContextOptions = {}
): string {
  const maxSearchQueries = options.maxSearchQueries ?? route.maxSearchQueries;
  const maxCandidates = options.maxCandidates ?? route.maxCandidates;
  const maxTickers = options.maxTickers ?? route.maxTickers;
  const preferSectorOnly = options.preferSectorOnly ?? route.preferSectorOnly;
  const required = route.requiredSkills
    .map((s) => {
      const spec = getRuntimeSkillSpec(s);
      const checks =
        spec.minPass.length > 0
          ? spec.minPass.map((x) => `    - ${x}`).join("\n")
          : "    - (no parsed checks; see skill file)";
      return `- ${s}: ${spec.description}\n${checks}`;
    })
    .join("\n");
  const optional =
    route.optionalSkills.length > 0
      ? route.optionalSkills
          .map((s) => {
            const spec = getRuntimeSkillSpec(s);
            return `- ${s}: ${spec.description}`;
          })
          .join("\n")
      : "- (none)";

  return (
    `[Skill Router]\n` +
    `Route: ${route.routeName}\n` +
    `Required skills (must apply):\n${required}\n\n` +
    `Optional skills (only if directly supported by evidence):\n${optional}\n\n` +
    `Output hard constraints:\n` +
    `- max_tickers=${maxTickers} (noise route must output 0 ticker)\n` +
    `- numeric/date claims must be evidence-backed; otherwise downgrade to qualitative language\n` +
    `- distinguish trigger evidence from background evidence: TAM/CAGR can support context, but cannot be the main proof that this event matters now\n` +
    `- do not force a flip; validating the user's intuition is allowed if the mechanism is stronger that way\n` +
    `${
      preferSectorOnly && maxTickers === 0
        ? "- result-seeking Layer 1 mode: keep angle/mechanism first, end with one concise direction, and keep that direction at sector/company-type level in this route\n"
        : preferSectorOnly
        ? "- result-seeking Layer 1 mode: default to sector/company-type wording. One representative listed company is allowed only if at least one evidence item ties that company directly to this event or behavior change\n"
        : route.resultSeeking
        ? "- result-seeking follow-up mode: keep angle/mechanism first, but you may name one specific listed company only if at least one evidence item ties that company directly to this event or behavior change\n"
        : ""
    }` +
    `- if you name a specific company, it must map cleanly to a current listed U.S. ticker; otherwise generalize to sector wording\n` +
    `${
      route.routeName === "follow_up"
        ? "- follow_up route: stay on the same mechanism from the prior turn; deepen it into 1-3 directions max, and each direction must include one watchpoint or invalidation condition\n"
        : ""
    }` +
    `${
      route.routeName === "weak_minimal"
        ? "- weak route: prefer one modest, testable angle; if the thesis still feels decorative, output sector-level wording and stop early\n"
        : ""
    }` +
    `${
      options.fastMode
        ? "- fast-response mode: prioritize one sturdy mechanism and one clean caveat; do not broaden into extra companies, examples, or side quests\n"
        : ""
    }` +
    `- if required skill checks cannot be satisfied, fallback to candid + sector-level wording\n\n` +
    `Execution budget:\n` +
    `- search_queries_max=${maxSearchQueries}\n` +
    `- candidate_max=${maxCandidates}\n` +
    `- write_temperature=${route.writeTemperature}\n` +
    `- keep reasoning compact and avoid non-required skill drift`
  );
}
