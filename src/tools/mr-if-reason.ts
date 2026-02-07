/**
 * Mr.IF 蝴蝶效应推理引擎 — 合一工具
 *
 * 一次调用，完成全部推理前置工作：
 * 1. 事件分类 + 推理方向 (原 butterfly_analyze)
 * 2. 链条模板匹配 + 构建指引 (原 causal_chain_build)
 * 3. 验证框架 + 评分规则 (原 chain_validate 的框架部分)
 * 4. 历史先例搜索 (原 historical_echo)
 * 5. 汇合分析规则 (原 chain_confluence 的规则部分)
 *
 * LLM 拿到这个工具的返回后，在 thinking 中完成：
 * - 填充链条步骤
 * - 自行打分验证
 * - 汇合分析
 * 然后再调用外部工具（行业映射、证券映射、取数等）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ======================================================================
// Section 1: 事件分类 (from butterfly-analyze.ts)
// ======================================================================

const EVENT_TYPES = {
  physiological: {
    name: "Physiological / 生理现象",
    keywords: ["sneeze", "cough", "insomnia", "headache", "fever", "allergy", "catch cold", "common cold", "sick", "flu", "fatigue", "obesity", "stress",
               "打喷嚏", "咳嗽", "失眠", "头疼", "发烧", "过敏", "感冒", "疲劳", "肥胖", "压力", "焦虑", "生病"],
    reasoning_angles: ["Pharma supply chain", "Healthcare demand", "Public health", "Health insurance", "Wellness consumption"],
  },
  weather: {
    name: "Weather & Climate / 天气气候",
    keywords: ["cold", "hot", "rain", "snow", "hurricane", "drought", "flood", "heatwave", "freeze", "wildfire", "tornado",
               "冷", "热", "下雨", "下雪", "飓风", "干旱", "洪水", "高温", "降温", "山火"],
    reasoning_angles: ["Energy demand", "Agriculture impact", "Consumer behavior shift", "Infrastructure damage", "Logistics disruption", "Insurance claims"],
  },
  economic: {
    name: "Economic Signal / 经济信号",
    keywords: ["inflation", "deflation", "layoff", "hiring", "IPO", "bankruptcy", "interest rate", "Fed", "CPI", "GDP", "unemployment", "tariff",
               "涨价", "降价", "裁员", "招聘", "上市", "通胀", "利率", "美联储", "关税"],
    reasoning_angles: ["Supply-demand shift", "Industry chain transmission", "Fed policy expectation", "Capital flow", "Sector rotation"],
  },
  social: {
    name: "Social Trend / 社会现象",
    keywords: ["aging", "remote work", "gig economy", "mental health", "loneliness", "migration", "inequality", "TikTok", "influencer",
               "老龄化", "远程办公", "零工经济", "心理健康", "孤独", "移民", "网红", "短视频"],
    reasoning_angles: ["Consumer trend", "Generational shift", "Policy implication", "Cultural change", "Labor market"],
  },
  technology: {
    name: "Technology / 科技",
    keywords: ["AI", "robot", "EV", "chip", "semiconductor", "5G", "quantum", "blockchain", "VR", "autonomous", "SpaceX", "ChatGPT",
               "人工智能", "机器人", "电动车", "芯片", "半导体", "区块链", "自动驾驶"],
    reasoning_angles: ["Tech substitution", "Industry upgrade", "Cost revolution", "New market creation", "Capex cycle"],
  },
  policy: {
    name: "Policy & Regulation / 政策法规",
    keywords: ["ban", "subsidy", "regulation", "antitrust", "tariff", "sanction", "carbon", "data privacy", "FDA", "SEC", "executive order",
               "禁令", "补贴", "监管", "反垄断", "关税", "制裁", "碳中和", "数据安全"],
    reasoning_angles: ["Market access change", "Compliance cost", "Policy tailwind", "Industry reshoring", "Geopolitical risk"],
  },
  nature: {
    name: "Natural Event / 自然事件",
    keywords: ["earthquake", "volcano", "flood", "wildfire", "pandemic", "epidemic", "tsunami", "solar storm",
               "地震", "火山", "洪水", "山火", "疫情", "海啸"],
    reasoning_angles: ["Supply chain shock", "Post-disaster rebuild", "Insurance claims", "Substitute demand", "Defense spending"],
  },
  daily: {
    name: "Daily Observation / 日常观察",
    keywords: ["line", "traffic", "delivery", "coffee", "gym", "pet", "movie", "Uber", "Costco", "Amazon",
               "排队", "堵车", "快递", "咖啡", "健身", "宠物", "电影", "外卖"],
    reasoning_angles: ["Consumer trend", "Industry sentiment", "Lifestyle shift", "New business model"],
  },
  geopolitical: {
    name: "Geopolitical / 地缘政治",
    keywords: ["war", "conflict", "sanction", "NATO", "China", "Russia", "Taiwan", "Middle East", "oil embargo", "trade war", "BRICS",
               "trump", "特朗普", "战争", "冲突", "制裁", "北约", "中国", "俄罗斯", "台湾", "中东", "贸易战"],
    reasoning_angles: ["Defense spending", "Energy security", "Supply chain reshoring", "Safe haven flow", "Commodity disruption"],
  },
} as const;

const SEASONAL_CONTEXT: Record<number, string> = {
  1: "Winter deep, post-New Year slowdown, CES, flu season peak, Q4 earnings, Fed policy expectations",
  2: "Late winter, Super Bowl, flu season tail, Valentine retail, earnings season dense",
  3: "Early spring, FOMC, allergy season start, Spring Break travel, tech launches",
  4: "Spring, Tax Day, Q1 earnings, planting season, Easter",
  5: "Late spring, Memorial Day, summer travel ramp, Sell in May debate",
  6: "Summer start, WWDC, FOMC, peak electricity demand, Pride Month",
  7: "Midsummer, July 4th, summer travel peak, Q2 earnings, hurricane season start",
  8: "Late summer, Back-to-School, Jackson Hole, hurricane peak",
  9: "Early fall, Labor Day, iPhone launch, FOMC, fall retail prep",
  10: "Fall, Q3 earnings, Halloween, election uncertainty (even years)",
  11: "Fall-winter, Thanksgiving+Black Friday+Cyber Monday, heating season start",
  12: "Winter, Holiday shopping peak, Christmas+New Year retail, Tax-Loss Harvesting, low liquidity",
};

// 短英文关键词需要词边界匹配，避免 "rain" 匹配 "AI"
const SHORT_EN_KEYWORDS = new Set(["ai", "ev", "5g", "vr", "ban", "hot", "flu"]);

function keywordMatch(inputLower: string, kw: string): boolean {
  const kwLower = kw.toLowerCase();
  // 中文关键词：直接 includes
  if (/[\u4e00-\u9fff]/.test(kw)) {
    return inputLower.includes(kwLower);
  }
  // 短英文关键词（<=3字符）：用词边界正则避免误命中
  if (kwLower.length <= 3 || SHORT_EN_KEYWORDS.has(kwLower)) {
    const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(inputLower);
  }
  // 长英文关键词：includes 即可
  return inputLower.includes(kwLower);
}

function classifyEvent(input: string) {
  const inputLower = input.toLowerCase();
  const matches: Array<{ type: string; name: string; count: number; keywords: string[] }> = [];

  for (const [typeKey, typeInfo] of Object.entries(EVENT_TYPES)) {
    const matched = typeInfo.keywords.filter((kw) => keywordMatch(inputLower, kw));
    if (matched.length > 0) {
      matches.push({ type: typeKey, name: typeInfo.name, count: matched.length, keywords: matched });
    }
  }
  matches.sort((a, b) => b.count - a.count);

  if (matches.length === 0) {
    return { primary_type: "daily", secondary_types: [] as string[], matched_keywords: [] as string[] };
  }
  return {
    primary_type: matches[0].type,
    secondary_types: matches.slice(1).map((m) => m.type),
    matched_keywords: matches.flatMap((m) => m.keywords),
  };
}

// ======================================================================
// Section 2: 链条模板 (from causal-chain-builder.ts)
// ======================================================================

const CHAIN_TEMPLATES: Record<string, {
  name: string;
  pattern: string;
  disciplines: string[];
  typical_steps: number;
  triggers: string[];
}> = {
  symptom_to_pharma: {
    name: "症状→医药产业链",
    pattern: "身体症状 → 疾病分类 → 患病人群规模 → 药物/治疗需求 → 医药公司业绩",
    disciplines: ["生理学", "流行病学", "经济学"],
    typical_steps: 4,
    triggers: ["打喷嚏", "咳嗽", "失眠", "头疼", "发烧", "sneeze", "cough", "flu", "sick"],
  },
  weather_to_energy: {
    name: "天气→能源/大宗商品",
    pattern: "天气变化 → 能源需求变化 → 大宗商品供需 → 能源/化工企业利润",
    disciplines: ["物理学", "气象学", "经济学"],
    typical_steps: 4,
    triggers: ["降温", "高温", "暴雨", "干旱", "cold", "hot", "freeze", "heatwave"],
  },
  consumption_to_industry: {
    name: "消费观察→行业趋势",
    pattern: "消费现象 → 背后驱动力 → 行业增长/衰退 → 行业龙头股",
    disciplines: ["社会学", "心理学", "经济学"],
    typical_steps: 4,
    triggers: ["咖啡", "外卖", "排队", "商场", "coffee", "delivery", "traffic"],
  },
  emotion_to_capital: {
    name: "社会情绪→资金流向",
    pattern: "社会情绪 → 群体行为变化 → 消费/投资偏好 → 资金流向",
    disciplines: ["心理学", "行为经济学", "金融学"],
    typical_steps: 4,
    triggers: ["焦虑", "恐慌", "乐观", "躺平", "fear", "panic", "FOMO", "anxiety"],
  },
  policy_to_industry: {
    name: "政策信号→产业调整",
    pattern: "政策动向 → 行业准入变化 → 产业结构调整 → 受益/受损企业",
    disciplines: ["政治学", "法学", "经济学"],
    typical_steps: 4,
    triggers: ["禁令", "补贴", "碳中和", "ban", "subsidy", "regulation", "tariff", "executive order"],
  },
  tech_to_revolution: {
    name: "技术突破→产业革命",
    pattern: "技术进展 → 成本/效率变化 → 产业格局重构 → 价值重估",
    disciplines: ["工程学", "物理学", "经济学"],
    typical_steps: 5,
    triggers: ["AI", "电池", "芯片", "量子", "ChatGPT", "chip", "quantum"],
  },
  disaster_to_supply: {
    name: "灾害→供应链→替代需求",
    pattern: "突发事件 → 供应链中断 → 替代品需求 → 替代供应商受益",
    disciplines: ["地理学", "物流学", "经济学"],
    typical_steps: 4,
    triggers: ["地震", "台风", "疫情", "贸易战", "earthquake", "pandemic", "trade war"],
  },
  health_to_wellness: {
    name: "健康心理→大健康消费",
    pattern: "身体信号 → 健康意识觉醒 → 保健消费意愿 → 大健康产业",
    disciplines: ["生理学", "心理学", "消费经济学"],
    typical_steps: 4,
    triggers: ["打喷嚏", "体检", "亚健康", "熬夜", "sneeze", "health check", "fatigue"],
  },
  geopolitical_to_safehaven: {
    name: "地缘冲突→避险资产",
    pattern: "地缘事件 → 市场恐慌(VIX↑) → 资金避险 → 黄金/国债/美元↑",
    disciplines: ["地缘政治", "心理学", "金融学"],
    typical_steps: 3,
    triggers: ["war", "conflict", "sanction", "missile", "NATO", "trump", "特朗普", "战争", "冲突", "制裁"],
  },
  geopolitical_to_supply: {
    name: "地缘冲突→供应链断裂→替代供应商",
    pattern: "制裁/冲突 → 某国供给中断 → 大宗商品暴涨 → 替代供应商受益",
    disciplines: ["地缘政治", "供应链", "经济学"],
    typical_steps: 4,
    triggers: ["tariff", "sanction", "embargo", "trade war", "China", "Russia", "关税", "封锁"],
  },
  supply_chain_bottleneck: {
    name: "供应链瓶颈→定价权→利润暴增",
    pattern: "某环节产能紧张 → 无替代 → 极端定价权 → 毛利率飙升",
    disciplines: ["供应链", "工程学", "经济学"],
    typical_steps: 4,
    triggers: ["shortage", "bottleneck", "GPU", "chip", "缺货", "产能"],
  },
  event_to_fed_rotation: {
    name: "经济数据→Fed政策预期→板块轮动",
    pattern: "经济数据/事件 → 改变Fed加息/降息预期 → 利率敏感行业轮动",
    disciplines: ["经济学", "货币政策", "金融学"],
    typical_steps: 4,
    triggers: ["CPI", "inflation", "jobs", "unemployment", "Fed", "rate", "通胀", "就业", "利率"],
  },
  second_order_hidden: {
    name: "一阶推理→二阶预期差→隐藏赢家",
    pattern: "明显事件 → 直觉赢家(已price in) → 寻找隐藏赢家/输家",
    disciplines: ["心理学", "市场传导", "二阶思维"],
    typical_steps: 5,
    triggers: ["obvious", "everyone knows", "consensus", "price in", "所有人都知道"],
  },
  tech_pickaxe: {
    name: "科技范式→卖铲人链",
    pattern: "技术爆发 → 应用需求暴增 → 基础设施瓶颈 → 基础设施供应商受益最大",
    disciplines: ["工程学", "供应链", "经济学"],
    typical_steps: 5,
    triggers: ["AI", "ChatGPT", "data center", "cloud", "GPU", "算力", "数据中心"],
  },
  demographic_to_sector: {
    name: "人口结构→行业变迁",
    pattern: "人口趋势 → 需求结构变化 → 行业兴衰 → 长期投资方向",
    disciplines: ["社会学", "人口学", "经济学"],
    typical_steps: 5,
    triggers: ["aging", "老龄化", "Gen Z", "millennial", "retirement", "birth rate"],
  },
  environment_to_greentech: {
    name: "环境问题→绿色科技",
    pattern: "环境恶化 → 政策收紧 → 环保投入增加 → 绿色科技企业",
    disciplines: ["化学", "环境科学", "经济学"],
    typical_steps: 4,
    triggers: ["雾霾", "碳排放", "塑料", "pollution", "carbon", "wildfire", "山火"],
  },
};

function matchTemplates(eventType: string, keywords: string[]): string[] {
  const matched: string[] = [];
  const inputJoined = keywords.join(" ").toLowerCase();

  for (const [key, tpl] of Object.entries(CHAIN_TEMPLATES)) {
    if (key === "second_order_hidden") continue; // 二阶思维单独处理，永远加入
    const hit = tpl.triggers.some((t) => keywordMatch(inputJoined, t));
    if (hit) matched.push(key);
  }

  if (matched.length === 0) {
    const fallback: Record<string, string[]> = {
      physiological: ["symptom_to_pharma", "health_to_wellness"],
      weather: ["weather_to_energy", "consumption_to_industry", "event_to_fed_rotation"],
      economic: ["event_to_fed_rotation", "consumption_to_industry", "emotion_to_capital"],
      social: ["emotion_to_capital", "demographic_to_sector", "consumption_to_industry"],
      technology: ["tech_to_revolution", "tech_pickaxe", "supply_chain_bottleneck"],
      policy: ["policy_to_industry", "event_to_fed_rotation", "geopolitical_to_supply"],
      nature: ["disaster_to_supply", "weather_to_energy", "geopolitical_to_safehaven"],
      daily: ["consumption_to_industry", "emotion_to_capital"],
      geopolitical: ["geopolitical_to_safehaven", "geopolitical_to_supply", "supply_chain_bottleneck"],
    };
    matched.push(...(fallback[eventType] || ["consumption_to_industry"]));
  }

  const unique = [...new Set(matched)];

  // 二阶思维永远作为最后一个模板加入（对每个事件都有价值）
  if (!unique.includes("second_order_hidden")) {
    unique.push("second_order_hidden");
  }

  return unique.slice(0, 5);
}

// ======================================================================
// Section 3: 历史案例库 (from historical-echo.ts)
// ======================================================================

interface HistCase {
  id: string; title: string; year: number; trigger: string;
  chain_summary: string; steps: string[]; disciplines: string[];
  outcome: string; tickers: string[]; sector: string;
  magnitude: string; time_to_impact: string; lesson: string; tags: string[];
}

const CASES: HistCase[] = [
  { id: "covid-2020", title: "COVID-19: 一场肺炎引发的全球市场海啸", year: 2020, trigger: "武汉出现不明原因肺炎",
    chain_summary: "地方疫情→全球大流行→封锁→暴跌→放水→科技股暴涨", steps: ["不明肺炎(流行病学)","人传人→全球扩散","各国封锁→经济停摆","S&P500跌34%(恐慌)","Fed零利率+无限QE","WFH爆发→Zoom/AMZN暴涨","mRNA疫苗→MRNA/BNTX飙升"],
    disciplines: ["流行病学","心理学","货币经济学"], outcome: "SPY从339跌至218再反弹至373; MRNA从19涨至157", tickers: ["SPY","MRNA","ZM","AMZN","PFE"], sector: "pharma,tech", magnitude: "extreme", time_to_impact: "2-4周暴跌,6-12月反弹", lesson: "极端事件中看谁是危机受益者", tags: ["pandemic","flu","virus","sneeze","cough","health","lockdown","Fed"] },
  { id: "texas-freeze-2021", title: "德州暴风雪: 冰冻引发能源危机", year: 2021, trigger: "德州遭遇罕见极寒",
    chain_summary: "极寒→供暖暴增→电网崩溃→天然气飙升→能源股暴涨", steps: ["极地涡旋南下-18°C(气象学)","供暖需求暴增400%","风电冻结+管道冻堵(工程)","ERCOT电网崩溃430万户停电","天然气现货$400/MMBtu","能源股飙升"],
    disciplines: ["气象学","物理学","工程学","经济学"], outcome: "UNG一周涨12%; OXY涨15%", tickers: ["UNG","OXY","XOM","LNG"], sector: "energy", magnitude: "large", time_to_impact: "即时到2周", lesson: "极端天气对能源冲击即时且剧烈", tags: ["cold","freeze","snow","weather","energy","gas","heating","power grid"] },
  { id: "hurricane-katrina-2005", title: "卡特里娜飓风: 风暴到油价飙升", year: 2005, trigger: "5级飓风登陆墨西哥湾",
    chain_summary: "飓风→石油平台关停→汽油短缺→油价飙升", steps: ["5级飓风(气象)","墨西哥湾95%产能关停","炼油厂受损","汽油$3+/加仑","原油$70+/桶","保险巨额赔付"],
    disciplines: ["气象学","工程学","经济学"], outcome: "WTI从$60涨至$70+; HD/LOW灾后重建受益", tickers: ["USO","XLE","HD","LOW","ALL"], sector: "energy,industrials", magnitude: "large", time_to_impact: "即时到数月", lesson: "飓风季关注墨西哥湾产能+灾后重建", tags: ["hurricane","storm","flood","oil","energy","insurance","rebuild"] },
  { id: "russia-ukraine-2022", title: "俄乌冲突: 重塑全球能源版图", year: 2022, trigger: "俄罗斯入侵乌克兰",
    chain_summary: "战争→制裁→能源危机→通胀→加息→成长股暴跌", steps: ["俄全面入侵(地缘)","西方全面制裁","俄断供天然气→欧洲危机","油价$120+","CPI 9.1%","Fed加息至5%+","NASDAQ跌33%"],
    disciplines: ["地缘政治","经济学","货币政策"], outcome: "XLE涨65%; LMT涨37%; QQQ跌33%", tickers: ["XLE","LMT","RTX","GLD","QQQ"], sector: "energy,defense", magnitude: "extreme", time_to_impact: "即时到1-2年", lesson: "地缘冲击:第一波避险,第二波供应链,第三波通胀→加息", tags: ["war","conflict","Russia","oil","gas","inflation","Fed","defense","sanction"] },
  { id: "trade-war-2018", title: "中美贸易战: 关税阴影下的科技脱钩", year: 2018, trigger: "美国对中国加征关税",
    chain_summary: "关税→供应链不确定→科技承压→避险", steps: ["$250B商品加征25%关税","中国反制","PMI下滑","半导体/苹果受威胁","VIX飙升","避险资金流入国债"],
    disciplines: ["国际贸易","产业链","心理学"], outcome: "SPY Q4跌20%; AAPL跌39%; SMH跌25%", tickers: ["SPY","AAPL","SMH","TLT","GLD"], sector: "tech,macro", magnitude: "large", time_to_impact: "即时到数月", lesson: "关税打击全球化受益者,推动供应链多元化", tags: ["tariff","trade war","China","supply chain","semiconductor","trump","特朗普"] },
  { id: "fed-pivot-2023", title: "美联储转向: 一句话点燃牛市", year: 2023, trigger: "Fed暗示2024年可能降息",
    chain_summary: "Fed鸽派→利率见顶→成长股估值修复→Mag7暴涨", steps: ["Powell暗示加息结束","10Y从5%降至3.8%","DCF折现率↓→成长股↑","AI叙事叠加→Mag7暴涨"],
    disciplines: ["货币政策","金融学","心理学"], outcome: "QQQ涨54%; NVDA涨239%", tickers: ["QQQ","NVDA","META","TLT"], sector: "tech,macro", magnitude: "large", time_to_impact: "数天启动,持续数月", lesson: "Don't fight the Fed. 利率方向决定成长vs价值", tags: ["Fed","rate","pivot","dovish","growth","tech","bond"] },
  { id: "chatgpt-2022", title: "ChatGPT发布: AI从论文走向大众", year: 2022, trigger: "OpenAI发布ChatGPT,两月破亿",
    chain_summary: "ChatGPT→AI军备竞赛→GPU供不应求→NVDA暴涨", steps: ["ChatGPT发布全民体验","企业布局AI算力竞赛","NVIDIA GPU供不应求","NVDA营收翻倍","AI基础设施跟涨"],
    disciplines: ["计算机科学","经济学","产业链"], outcome: "NVDA涨240%; MSFT涨57%; META涨194%", tickers: ["NVDA","MSFT","META","AMD","SMH"], sector: "tech", magnitude: "extreme", time_to_impact: "1-3月概念,6-12月业绩兑现", lesson: "范式级技术突破最大受益者是卖铲人(基础设施)", tags: ["AI","ChatGPT","GPU","semiconductor","NVIDIA","data center"] },
  { id: "gme-2021", title: "GameStop逼空: 散户vs华尔街", year: 2021, trigger: "Reddit WSB集体买入GME",
    chain_summary: "社交媒体→散户集体买入→空头爆仓→GME涨100倍", steps: ["DFV在Reddit发分析","Melvin 140%做空","散户集体买入short squeeze","GME从$4到$483","Robinhood限制买入","SEC介入"],
    disciplines: ["行为金融","传播学","博弈论"], outcome: "GME从$4涨至$483; AMC从$2涨至$72", tickers: ["GME","AMC","HOOD"], sector: "consumer,financials", magnitude: "large", time_to_impact: "1-2周高波动", lesson: "社交媒体时代散户集体行动可成市场力量", tags: ["meme","Reddit","short squeeze","retail","social media","GameStop"] },
  { id: "fed-hike-2022", title: "2022暴力加息: 40年最快加息杀估值", year: 2022, trigger: "CPI飙至9.1%,Fed暴力加息",
    chain_summary: "通胀失控→暴力加息→成长股暴跌→价值/能源跑赢", steps: ["后疫情需求爆发+供应链瓶颈→CPI 9.1%","Fed从0%加至5.25%","10Y从1.5%飙至4.2%","ARKK跌67%","价值/能源股跑赢"],
    disciplines: ["货币政策","宏观经济","金融学"], outcome: "ARKK跌67%; QQQ跌33%; XLE涨65%", tickers: ["ARKK","QQQ","XLE","TLT"], sector: "tech,energy,macro", magnitude: "extreme", time_to_impact: "全年持续", lesson: "利率是所有资产定价的锚", tags: ["Fed","rate hike","inflation","CPI","growth","value","rotation"] },
  { id: "btc-etf-2024", title: "比特币ETF获批: 加密进入主流", year: 2024, trigger: "SEC批准首批比特币现货ETF",
    chain_summary: "ETF获批→机构资金涌入→BTC破$70K→矿业/交易所暴涨", steps: ["SEC批准11只BTC ETF","IBIT首月吸金$4B+","BTC从$42K涨至$73K","MARA/RIOT矿业暴涨","COIN交易量飙升"],
    disciplines: ["金融监管","经济学","金融学"], outcome: "BTC从$42K涨至$73K; MARA涨120%; COIN涨60%", tickers: ["IBIT","COIN","MARA","MSTR"], sector: "financials,tech", magnitude: "large", time_to_impact: "即时到3-6月", lesson: "监管从阻力变催化剂是最强买入信号", tags: ["bitcoin","crypto","ETF","SEC","regulation","mining"] },
  { id: "ozempic-2023", title: "GLP-1减肥药: 产业链地震", year: 2023, trigger: "Ozempic/Wegovy减肥效果走红",
    chain_summary: "减肥药爆火→LLY/NVO暴涨→零食/医疗器械预期下调", steps: ["GLP-1减重15-20%(药理学)","社交媒体/名人效应→全民求药","LLY/NVO市值飙升","减肥→零食需求↓","胃旁路/睡眠呼吸机需求↓","WMT证实购物篮变化"],
    disciplines: ["药理学","心理学","消费行为学"], outcome: "LLY从$330涨至$800+; DXCM跌40%", tickers: ["LLY","NVO","MDLZ","DXCM"], sector: "pharma,consumer", magnitude: "large", time_to_impact: "3-6月概念,12-24月传导", lesson: "颠覆性疗法重塑整个消费链,找二阶影响", tags: ["drug","obesity","weight loss","GLP-1","health","food","pharma"] },
  { id: "suez-2021", title: "长赐号搁浅: 一艘船堵住全球贸易", year: 2021, trigger: "集装箱船在苏伊士运河搁浅",
    chain_summary: "运河堵塞→航运中断→运费飙升→通胀压力", steps: ["400米巨轮侧向搁浅","每天$9.6B贸易被阻断","集装箱运费飙升","欧洲进口延迟","通胀预期上升"],
    disciplines: ["物理学","经济学","物流学"], outcome: "ZIM/MATX涨; 油价短期涨", tickers: ["ZIM","MATX","USO"], sector: "industrials,energy", magnitude: "medium", time_to_impact: "即时到数月", lesson: "全球贸易咽喉出问题→航运股暴涨→通胀传导", tags: ["supply chain","shipping","logistics","trade","inflation"] },
  { id: "svb-2023", title: "硅谷银行倒闭: 48小时银行挤兑", year: 2023, trigger: "SVB宣布出售债券亏损$1.8B",
    chain_summary: "SVB亏损→社交媒体传播→挤兑→倒闭→区域银行恐慌", steps: ["SVB长期国债浮亏(金融)","社交媒体疯传(传播学)","单日挤兑$42B","FDIC接管","恐慌蔓延→First Republic倒","KRE暴跌30%","资金涌入大银行JPM"],
    disciplines: ["金融学","心理学","传播学"], outcome: "KRE跌30%; JPM逆势涨; GLD涨10%", tickers: ["KRE","JPM","GLD","TLT"], sector: "financials,safe_haven", magnitude: "large", time_to_impact: "即时到数月", lesson: "社交媒体时代挤兑速度100倍,区分飞机和堡垒", tags: ["bank","crisis","panic","fear","deposit","regional bank","safe haven"] },
  { id: "drought-2012", title: "2012美国大旱: 玉米带变火焰带", year: 2012, trigger: "美国中西部50年最严重干旱",
    chain_summary: "干旱→玉米/大豆减产→农产品暴涨→饲料成本↑→肉类涨价", steps: ["极端干旱(气象)","产量大幅下调","玉米从$5涨至$8.3","饲料成本暴涨","肉类涨价→CPI","化肥/农机需求次年增"],
    disciplines: ["气象学","农业学","经济学"], outcome: "CORN涨27%; SOYB涨20%; ADM涨", tickers: ["CORN","SOYB","WEAT","ADM","MOS","DE"], sector: "agriculture,materials", magnitude: "large", time_to_impact: "即时到6月+", lesson: "美国是全球粮仓,中西部天气直接影响全球粮价", tags: ["drought","crop","corn","agriculture","food","weather","hot","heat"] },
];

function searchCases(keywords: string[]): Array<{ case_data: HistCase; score: number }> {
  const results: Array<{ case_data: HistCase; score: number }> = [];
  for (const c of CASES) {
    let score = 0;
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (c.tags.some((t) => t.toLowerCase().includes(kwLower) || kwLower.includes(t.toLowerCase()))) score += 3;
      if (c.trigger.toLowerCase().includes(kwLower)) score += 2;
      if (c.chain_summary.toLowerCase().includes(kwLower)) score += 1;
    }
    if (score > 0) results.push({ case_data: c, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

// ======================================================================
// Section 4: 事件类型→学科知识速查（注入到工具输出，让LLM有知识可用）
// ======================================================================

const DISCIPLINE_KNOWLEDGE: Record<string, string> = {
  weather: `### 关键学科知识（天气→金融）

**物理/能源：**
- HDD(采暖度日)每偏离历史均值10% → 天然气现货约波动5-8%
- 天然气库存低于5年均值>15% = 价格上行风险加大
- EIA周度库存报告(每周四) = 天然气价格最强短期催化剂
- ERCOT电力储备margin<6% = 限电风险显著
- 飓风Cat3+登陆Gulf Coast → 历史平均5-15%油价短期跳升

**常见错误：**
- 天气预报≠确定事件，关注概率偏差
- 大型能源公司通常对冲了60-80%产量，短期价格暴涨对EPS影响有限
- 现货价暴涨≠远月也涨，看期货曲线结构(contango/backwardation)

**气象→农业：**
- Corn Belt干旱 → CORN/SOYB↑ → 饲料成本↑ → 肉类涨价 → 食品CPI↑
- 受益标的: MOS(化肥), ADM(粮商), DE(农机)

**天气→消费行为：**
- 暖冬: UNG↓, 但户外零售↑(NKE/LULU)
- 寒潮: UNG↑, 室内消费↑(NFLX/EA), 电商替代(AMZN↑)
- 飓风威胁: 备灾消费(HD/LOW↑), 出行取消(DAL/UAL↓)`,

  physiological: `### 关键学科知识（生理→金融）

**流行病学锚点：**
- CDC ILI baseline ~2.5%，超过3.5% = 流感季偏强
- 美国年流感医疗支出~$11B，严重年份$20B+
- GLP-1市场年增速>50%，渗透率<5%（长跑道）
- Pharma新药: Phase 3 → FDA filing → 审批 = 6-18月

**季节性健康周期：**
- Winter: Flu peak → PFE/GILD/ABT; 室内↑ → NFLX/gaming
- Spring: Allergy → 抗过敏OTC; 户外↑ → NKE/LULU
- Summer: 防晒/饮料(KO,PEP); Travel peak → BKNG/ABNB
- Fall: Flu vaccine rollout → MRNA/PFE

**常见错误：**
- "我打喷嚏"≠"流感爆发"，需要CDC数据确认群体趋势
- 流感药占PFE总收入<5%，流感季强也不会大幅推升PFE
- 人口老龄化是十年趋势，不能用来推"这周买什么"`,

  economic: `### 关键学科知识（经济→金融）

**Fed反应函数（最重要单一变量）：**
- Core PCE>3% = 不会降息, >4% = 可能加息, <2.5% = 降息窗口
- 10Y每上升100bp → QQQ历史平均承压-8~-12%
- Unemployment<4% = 劳动力紧→工资通胀; >4.5% = 衰退预警
- ISM PMI<47 = 历史高衰退概率
- Yield Curve(2Y-10Y)倒挂 = 衰退预警(领先12-18月)

**板块轮动：**
- CPI↑: XLE,GLD,TIP ↑ / TLT,QQQ ↓
- NFP强: XLY,XLF ↑ / TLT ↓(降息推迟)
- Fed降息: QQQ,XLRE,GLD ↑ / KBE ↓

**常见错误：**
- CPI单月跳升≠通胀失控，看3月annualized rate
- Fed说的≠Fed要做的，看dot plot和实际利率路径
- Headline NFP增加但全是兼职/政府岗→信号完全不同`,

  geopolitical: `### 关键学科知识（地缘→金融）

**传导波次：**
- 第一波(0-48h): 恐慌→VIX↑, GLD↑, TLT↑, 股市↓
- 第二波(1-4周): 供应链冲击→受影响大宗暴涨
- 第三波(1-6月): 通胀传导→CPI↑→Fed政策变化
- 第四波(6月+): 产业重构→供应链转移/国防支出/能源安全

**资源控制关键数据：**
- 俄罗斯: 石油出口~12%, 天然气~17%, 钯~40%, 小麦~18%
- 台湾(TSMC): 先进制程芯片>80%(7nm以下)
- 中东(OPEC+): ~40%石油产能, 沙特swing capacity~2-3M bpd
- Strait of Hormuz: ~20%全球石油贸易
- 中国: ~60%稀土加工, ~80%锂电池产能

**常见错误：**
- 80%地缘事件市场冲击是短暂的(1-4周回落)，除非引发实质供应中断
- 台海风险是极端尾部事件(low prob, extreme impact)，不能做日常推理
- 第二次关税升级冲击通常小于第一次(供应链已开始调整)`,

  technology: `### 关键学科知识（科技→金融）

**AI算力供应链（当前最热）：**
- GPU: NVDA(>80%) → AMD → INTC
- HBM内存: SK Hynix, Samsung, MU
- CoWoS封装: TSMC(产能瓶颈)
- 光模块: COHR → 数据中心互联
- 电力: 数据中心耗电暴增 → VST, CEG
- 冷却: VRT(液冷)
- 云: AMZN(AWS), MSFT(Azure), GOOGL(GCP)

**供应链分析框架：**
- 瓶颈分析: 产能最紧环节=最大定价权=最大利润弹性
- TSMC产能利用率>95% = 涨价能力强, <80% = 行业低迷
- 半导体库存周期~3-4年, 库存/营收比>1.5x = 过剩预警

**常见错误：**
- "瓶颈"不是永久的，所有瓶颈终将被capex解决(2-3年)
- 短缺时下游double-ordering → 真实需求被放大 → 泡沫化库存
- 营收暴增但上游也涨价 → 利润可能反而压缩`,

  policy: `### 关键学科知识（政策→金融）

**制裁经济学：**
- 制裁→被制裁国出口受阻→全球供给↓→大宗涨价→替代供应商受益
- 例: 制裁俄石油→沙特/美页岩受益→XOM, COP
- 例: 制裁中国芯片→美设备短期受益但长期风险→ASML, LRCX

**美国政治周期：**
- 大选年: 政策不确定性↑→VIX季节性走高(Q3)
- 两党差异: 能源/医疗/科技/加密受影响
- 新总统: FTC/SEC/EPA政策转向→科技并购/能源方向切换

**常见错误：**
- 政策宣布≠政策执行, 关注立法进程时间线
- 市场在政策明确前会price in预期，明确后反而"buy rumor sell news"`,

  social: `### 关键学科知识（社会→金融）

**美国代际消费差异：**
- Boomers(60-78): Healthcare/旅行/分红股→UNH, BKNG, VYM
- Gen X(44-59): 房贷/子女教育/401k→银行, SPY/QQQ
- Millennials(29-43): 体验>物质/订阅/ESG→ABNB, NFLX, ICLN
- Gen Z(13-28): 短视频/环保/mental health→SNAP, TDOC

**关键趋势→标的：**
- Remote Work: ZM, MSFT, EQIX ↑ / SPG ↓
- Ozempic Culture: LLY, NVO ↑ / MDLZ, DXCM ↓
- AI Anxiety: COUR ↑(upskilling)
- Loneliness: CHWY(宠物), META(社交), TDOC(心理健康)

**常见错误：**
- 区分viral moment vs secular trend, 看渗透率和adoption curve
- 社交媒体热度≠真实消费变化，需要数据验证`,

  nature: `### 关键学科知识（自然事件→金融）

**灾害传导：**
- 供应链中断→替代品需求↑→替代供应商受益
- 保险理赔→ALL/TRV短期承压→但能提价回血(中期)
- 灾后重建→HD/LOW/建材受益

**关键数据：**
- 飓风季: Jun-Nov, Gulf Coast影响石油产能
- 野火: California为主, 保险撤出→RE↓, 电力公司责任(PCG风险)
- 地震: 美国西海岸, 关注supply chain disruption

**常见错误：**
- 自然灾害对市场冲击通常是短暂的，除非规模极端
- 保险股短期跌但中期可能因提价反弹`,

  daily: `### 关键学科知识（日常观察→金融）

**消费观察→趋势：**
- 排队/火爆 = 需求旺盛 → 看龙头公司增速
- 冷清/关店 = 需求萎缩 → 看行业周期位置
- 新消费现象 = 可能是趋势拐点

**市场传导机制：**
- EPS预期修正: 事件→影响收入/成本→分析师修正→股价(1-4周)
- 估值倍数变化: 叙事变化→PE扩张/收缩(可能即时)
- 资金流: 投资者重配→板块轮动(即时到数周)
- Price In检测: 如果Bloomberg/CNBC随便搜都有→已price in

**常见错误：**
- 利好事件≠股价涨, "buy rumor sell news"
- 所有人都long某个ticker→即使基本面好upside也有限(crowded trade)
- 用forward PE(预期盈利)而非trailing PE(过去盈利)做判断`,
};

// ======================================================================
// Section 5: 注册合一工具
// ======================================================================

export function registerMrIfReason(server: McpServer): void {
  server.tool(
    "mr_if_reason",
    `Mr.IF蝴蝶效应推理引擎。输入任何日常事件,一次性返回: 事件分类、推理链模板、历史先例、验证框架、汇合规则。
这是Mr.IF的核心推理工具,必须在所有其他工具之前调用。
用户说"今天降温了"→不是问买衣服,是问关注什么美股。永远从金融视角解读用户输入。`,
    {
      user_input: z.string().describe("用户的原始输入,例如'今天降温了'、'特朗普又发神经了'"),
      current_date: z.string().optional().describe("当前日期 YYYY-MM-DD"),
    },
    async ({ user_input, current_date }) => {
      const date = current_date ? new Date(current_date) : new Date();
      const month = date.getMonth() + 1;
      const seasonContext = SEASONAL_CONTEXT[month] || "";

      // 1. 事件分类
      const cls = classifyEvent(user_input);
      const primaryInfo = EVENT_TYPES[cls.primary_type as keyof typeof EVENT_TYPES];
      const allDirections: string[] = primaryInfo ? [...primaryInfo.reasoning_angles] : ["Consumer trend"];
      for (const sec of cls.secondary_types) {
        const info = EVENT_TYPES[sec as keyof typeof EVENT_TYPES];
        if (info) info.reasoning_angles.forEach((d) => { if (!allDirections.includes(d)) allDirections.push(d); });
      }

      // 2. 链条模板
      const templateKeys = matchTemplates(cls.primary_type, cls.matched_keywords);
      const chains = templateKeys.map((key, i) => {
        const tpl = CHAIN_TEMPLATES[key];
        return {
          chain_id: i + 1,
          name: tpl?.name || key,
          pattern: tpl?.pattern || "通用推理",
          disciplines: tpl?.disciplines || ["经济学"],
          typical_steps: tpl?.typical_steps || 4,
          prompt: `从"${user_input}"出发,按【${tpl?.name}】模式推理: ${tpl?.pattern}。涉及学科: ${tpl?.disciplines.join("、")}。${seasonContext ? `季节语境: ${seasonContext}` : ""}`,
        };
      });

      // 3. 历史案例
      const allKw = [...cls.matched_keywords, ...user_input.split(/[\s,，。！？]+/).filter((w) => w.length > 1)];
      const histMatches = searchCases(allKw);

      // 4. 学科知识注入（根据事件类型）
      const primaryKnowledge = DISCIPLINE_KNOWLEDGE[cls.primary_type] || DISCIPLINE_KNOWLEDGE["daily"] || "";
      const secondaryKnowledge = cls.secondary_types
        .slice(0, 1)
        .map((t) => DISCIPLINE_KNOWLEDGE[t])
        .filter(Boolean)
        .join("\n\n");

      // 5. 组装 markdown 格式输出（比 JSON 对 LLM 更友好）
      const histSection = histMatches.length > 0
        ? histMatches.map(({ case_data: c, score }) =>
            `**${c.title}** (${c.year}, relevance: ${score})\n` +
            `- 触发: ${c.trigger}\n` +
            `- 链路: ${c.chain_summary}\n` +
            `- 结果: ${c.outcome}\n` +
            `- 标的: ${c.tickers.join(", ")}\n` +
            `- 教训: ${c.lesson}`
          ).join("\n\n")
        : "无直接匹配案例。考虑用网络检索工具搜索类似历史事件。";

      const chainSection = chains.map((c) =>
        `**Chain ${c.chain_id}: ${c.name}**\n` +
        `- 模式: ${c.pattern}\n` +
        `- 学科: ${c.disciplines.join(" → ")}\n` +
        `- 建议步数: ${c.typical_steps}\n` +
        `- 构建指引: ${c.prompt}`
      ).join("\n\n");

      const output = `# Mr.IF 推理引擎输出

## 1. 事件分类
- 用户输入: "${user_input}"
- 事件类型: ${cls.primary_type} (${primaryInfo?.name || "日常观察"})
- 次要类型: ${cls.secondary_types.join(", ") || "无"}
- 命中关键词: ${cls.matched_keywords.join(", ") || "无精确命中，使用默认模板"}
- 日期: ${date.toISOString().split("T")[0]}
- 季节语境: ${seasonContext}

## 2. 推理方向
${allDirections.map((d, i) => `${i + 1}. ${d}`).join("\n")}

## 3. 链条模板（用这些模板构建因果链）
${chainSection}

## 4. 历史案例
${histSection}

## 5. 事件相关学科知识（推理时使用这些锚点和规则）
${primaryKnowledge}
${secondaryKnowledge ? `\n${secondaryKnowledge}` : ""}

## 6. 验证框架（给每条链打分）
**6个维度：** 逻辑连贯性(25%) | 学科准确性(20%) | 假设显性化(15%) | 反面论证(15%) | 时间一致性(10%) | 规模合理性(15%)

**加分：** 链<4步+1 | 有历史先例+1 | 多链同向+0.5~1.0 | 实时数据支撑+1 | 公认原理+1
**减分：** 链>5步-1 | 1个weak link-0.5 | 2+个weak-0.5再每个-1.0 | 未验证假设-1 | 单一学科-0.5 | 推理=市场共识-1

**汇合规则：** 2链同向→confidence+0.5 | 3链同向→+1.0 | 矛盾→标记mixed需裁决

## 7. 执行指令

**在你的thinking中，严格按以下顺序执行（7-Gate协议）：**

Gate 1 事件锚定: 确认金融解读。如果你的解读像生活建议→重来。
Gate 2 链条构建: 用上面的${chains.length}个模板，构建${chains.length}+条因果链。每步标注: 内容+学科+强度+"因为..."
Gate 3 链条验证: 用上面的6维度打分。诚实标记弱点。得分<2.5→丢弃。
Gate 4 历史对照: 对比上面的历史案例。一致→增强。矛盾→必须解释为什么这次不同。
Gate 5 汇合分析: 多链收敛=高置信。矛盾=标记mixed。推导净方向(看多/看空/中性)。
Gate 6 二阶检测: 每个净方向问——这是共识吗？隐藏赢家？隐藏输家？时间错配？
Gate 7 出口检查: ①至少3条链 ②至少2个不同学科 ③有反面论证 ④有历史对照 ⑤有净方向 ⑥有二阶检测 ⑦有具体行业方向 ⑧无编造理论 ⑨至少1条链>=3分 ⑩全部通过

**反幻觉规则：**
- 不能倒推（先想好结论再编链）
- 每个"因为"必须经得起追问
- 不确定的学科理论→改用常识表述
- 不确定的数字→标注"需取数工具确认"
- 至少承认1条链有弱点

**Gate 7全部通过后：**
→ 调用 行业映射工具 → 证券映射工具 → 取数工具
→ 按需调用: 网络检索工具(时事), 贪婪先生数据获取工具(情绪), dcf计算工具(估值), 等
→ 合成自然的RIA风格回答 + 必须以ticker summary table结尾

**永远不要向用户展示Gate、评分、链条标记、工具名称。输出要像坐在对面的投资顾问在聊天。**`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
