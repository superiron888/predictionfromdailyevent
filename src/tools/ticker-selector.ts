export interface TickerCatalogItem {
  ticker: string;
  name: string;
  sector: string;
}

export interface TickerSelectionResult {
  allowedTickers: string[];
  droppedTickers: string[];
  reason: string;
}

export interface UnsafeCompanyEntity {
  name: string;
  reason: string;
  resolvedTicker?: string;
}

interface TickerMention {
  original: string;
  normalized: string;
  companyHint?: string;
}

interface YahooSearchQuote {
  symbol?: string;
  quoteType?: string;
  typeDisp?: string;
  exchange?: string;
  exchDisp?: string;
  shortname?: string;
  longname?: string;
  score?: number;
}

interface CachedQuotes {
  expiresAt: number;
  quotes: YahooSearchQuote[];
}

export const TICKER_ALIAS_MAP: Record<string, string> = {
  FB: "META",
  FOX: "FOXA",
  GOOG: "GOOGL",
};

const TICKER_CATALOG: TickerCatalogItem[] = [
  { ticker: "AAPL", name: "Apple", sector: "Technology" },
  { ticker: "MSFT", name: "Microsoft", sector: "Technology" },
  { ticker: "GOOGL", name: "Alphabet", sector: "Technology" },
  { ticker: "AMZN", name: "Amazon", sector: "Consumer/Cloud" },
  { ticker: "META", name: "Meta Platforms", sector: "Technology" },
  { ticker: "NFLX", name: "Netflix", sector: "Streaming" },
  { ticker: "DIS", name: "Walt Disney", sector: "Media" },
  { ticker: "FOXA", name: "Fox Corporation", sector: "Media" },
  { ticker: "SPOT", name: "Spotify", sector: "Streaming" },
  { ticker: "ROKU", name: "Roku", sector: "Streaming/Ads" },
  { ticker: "AKAM", name: "Akamai Technologies", sector: "CDN/Cloud" },
  { ticker: "TTD", name: "The Trade Desk", sector: "AdTech" },
  { ticker: "OMC", name: "Omnicom Group", sector: "Advertising" },
  { ticker: "IPG", name: "Interpublic Group", sector: "Advertising" },
  { ticker: "SBUX", name: "Starbucks", sector: "Consumer" },
  { ticker: "COST", name: "Costco", sector: "Consumer" },
  { ticker: "WMT", name: "Walmart", sector: "Consumer" },
  { ticker: "TGT", name: "Target", sector: "Consumer" },
  { ticker: "BBY", name: "Best Buy", sector: "Consumer Electronics Retail" },
  { ticker: "ETSY", name: "Etsy", sector: "E-commerce Marketplace" },
  { ticker: "BKNG", name: "Booking Holdings", sector: "Travel" },
  { ticker: "ABNB", name: "Airbnb", sector: "Travel" },
  { ticker: "MAR", name: "Marriott", sector: "Travel" },
  { ticker: "HLT", name: "Hilton", sector: "Travel" },
  { ticker: "RCL", name: "Royal Caribbean", sector: "Travel" },
  { ticker: "CCL", name: "Carnival", sector: "Travel" },
  { ticker: "UBER", name: "Uber", sector: "Mobility" },
  { ticker: "LYFT", name: "Lyft", sector: "Mobility" },
  { ticker: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { ticker: "HUM", name: "Humana", sector: "Healthcare" },
  { ticker: "CVS", name: "CVS Health", sector: "Healthcare" },
  { ticker: "HCA", name: "HCA Healthcare", sector: "Healthcare" },
  { ticker: "THC", name: "Tenet Healthcare", sector: "Healthcare" },
  { ticker: "TDOC", name: "Teladoc Health", sector: "Telehealth" },
  { ticker: "AMN", name: "AMN Healthcare Services", sector: "Healthcare Staffing" },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { ticker: "PFE", name: "Pfizer", sector: "Healthcare" },
  { ticker: "MRK", name: "Merck", sector: "Healthcare" },
  { ticker: "DHR", name: "Danaher", sector: "Life Sciences Tools" },
  { ticker: "GEHC", name: "GE HealthCare", sector: "Medical Equipment" },
  { ticker: "ADBE", name: "Adobe", sector: "Software" },
  { ticker: "ADSK", name: "Autodesk", sector: "Software" },
  { ticker: "CRM", name: "Salesforce", sector: "Software" },
  { ticker: "NOW", name: "ServiceNow", sector: "Software" },
  { ticker: "INTU", name: "Intuit", sector: "Software" },
  { ticker: "WDAY", name: "Workday", sector: "Software" },
  { ticker: "ZS", name: "Zscaler", sector: "Cybersecurity" },
  { ticker: "UPWK", name: "Upwork", sector: "Labor Marketplace" },
  { ticker: "LZ", name: "LegalZoom", sector: "Legal Technology" },
  { ticker: "COUR", name: "Coursera", sector: "Education" },
  { ticker: "DUOL", name: "Duolingo", sector: "Education" },
  { ticker: "CHGG", name: "Chegg", sector: "Education" },
  { ticker: "AON", name: "Aon", sector: "Insurance Services" },
  { ticker: "MKL", name: "Markel Group", sector: "Insurance" },
  { ticker: "MMC", name: "Marsh & McLennan", sector: "Insurance Services" },
  { ticker: "AJG", name: "Arthur J. Gallagher", sector: "Insurance Services" },
  { ticker: "PGR", name: "Progressive", sector: "Insurance" },
  { ticker: "ALL", name: "Allstate", sector: "Insurance" },
  { ticker: "GOLD", name: "Barrick Gold", sector: "Materials" },
  { ticker: "NEM", name: "Newmont", sector: "Materials" },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials" },
  { ticker: "GS", name: "Goldman Sachs", sector: "Financials" },
  { ticker: "BLK", name: "BlackRock", sector: "Financials" },
  { ticker: "V", name: "Visa", sector: "Payments" },
  { ticker: "MA", name: "Mastercard", sector: "Payments" },
  { ticker: "PYPL", name: "PayPal", sector: "Payments" },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { ticker: "CVX", name: "Chevron", sector: "Energy" },
  { ticker: "COP", name: "ConocoPhillips", sector: "Energy" },
  { ticker: "TSLA", name: "Tesla", sector: "Automotive" },
  { ticker: "GM", name: "General Motors", sector: "Automotive" },
  { ticker: "F", name: "Ford", sector: "Automotive" },
  { ticker: "EA", name: "Electronic Arts", sector: "Gaming" },
];

const TICKER_SET = new Set<string>(TICKER_CATALOG.map((x) => x.ticker));
const YAHOO_CACHE_TTL_MS = 10 * 60 * 1000;
const yahooSearchCache = new Map<string, CachedQuotes>();
const US_EXCHANGE_CODES = new Set([
  "NMS",
  "NGM",
  "NCM",
  "NYQ",
  "ASE",
  "BTS",
  "ARC",
  "PCX",
]);
const NON_US_OR_UNSUPPORTED_EXCHANGES = new Set([
  "PNK",
  "OQX",
  "OQB",
  "GREY",
  "OTC",
]);
const YAHOO_SEARCH_TIMEOUT_MS = 2200;
const NAME_STOP_TOKENS = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "company",
  "co",
  "ltd",
  "limited",
  "plc",
  "class",
  "common",
  "stock",
  "shares",
  "the",
]);
const SHELL_ENTITY_HINTS = [
  "special purpose acquisition",
  "blank check",
  "acquisition corp",
  "acquisition corporation",
  "acquisition company",
  "capital acquisition",
  "warrant",
  "rights",
  "units",
];
const COMPANY_ENTITY_SUFFIXES = [
  "Health",
  "Group",
  "Holdings",
  "Technologies",
  "Technology",
  "Therapeutics",
  "Systems",
  "Software",
  "Capital",
  "Analytics",
  "Networks",
  "Platforms",
  "Logistics",
  "Entertainment",
  "Services",
  "Pharma",
  "Biotech",
  "Biosciences",
  "Bio",
  "Labs",
];

export function normalizeTickerSymbol(raw: string): string {
  const key = raw.toUpperCase().trim();
  return TICKER_ALIAS_MAP[key] ?? key;
}

export function extractTickerMentions(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/[\(（]([A-Z]{1,5}(?:-[A-Z])?)[\)）]/g)) {
    ids.add(normalizeTickerSymbol(m[1]));
  }
  return [...ids];
}

export function selectAllowedTickers(params: {
  text: string;
  maxTickers: number;
}): TickerSelectionResult {
  const { text, maxTickers } = params;
  const mentions = extractTickerMentions(text);
  if (mentions.length === 0) {
    return { allowedTickers: [], droppedTickers: [], reason: "no_ticker_mention" };
  }

  if (maxTickers <= 0) {
    return {
      allowedTickers: [],
      droppedTickers: mentions,
      reason: "route_forbids_ticker",
    };
  }

  const whitelisted = mentions.filter((t) => TICKER_SET.has(t));
  const allowedTickers = whitelisted.slice(0, maxTickers);
  const droppedTickers = mentions.filter((t) => !allowedTickers.includes(t));

  return {
    allowedTickers,
    droppedTickers,
    reason:
      allowedTickers.length > 0
        ? `selected_from_whitelist:${allowedTickers.join(",")}`
        : "no_whitelisted_mention",
  };
}

function dedupeInOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function normalizeNameForCompare(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantNameTokens(raw: string): string[] {
  return normalizeNameForCompare(raw)
    .split(" ")
    .filter((x) => x.length >= 2 && !NAME_STOP_TOKENS.has(x));
}

function buildCompanyHintQueries(companyHint?: string): string[] {
  const cleaned = toCleanCompanyHint(companyHint ?? "");
  if (!cleaned) return [];

  const queries: string[] = [cleaned];
  const english = [...cleaned.matchAll(/([A-Z][A-Za-z&.\-]+(?:\s+[A-Z][A-Za-z&.\-]+){0,4})/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (english.length > 0) {
    queries.unshift(english[english.length - 1]);
  }

  return dedupeInOrder(queries).slice(0, 3);
}

function isShellLikeQuote(q: YahooSearchQuote): boolean {
  const blob = `${q.shortname ?? ""} ${q.longname ?? ""}`.toLowerCase();
  return SHELL_ENTITY_HINTS.some((hint) => blob.includes(hint));
}

function findExactUsEquityQuote(
  quotes: YahooSearchQuote[],
  symbol: string
): YahooSearchQuote | null {
  const target = symbol.toUpperCase().trim();
  if (!target) return null;
  for (const q of quotes) {
    if (!isUsEquityQuote(q)) continue;
    const s = (q.symbol ?? "").toUpperCase().trim();
    if (s === target) return q;
  }
  return null;
}

function companyHintLooksSpecific(companyHint?: string): boolean {
  if (!companyHint) return false;
  const queries = buildCompanyHintQueries(companyHint);
  if (queries.length === 0) return false;
  return queries.some((q) => significantNameTokens(q).length > 0);
}

function companyHintMatchesQuote(companyHint: string, q: YahooSearchQuote): boolean {
  const queries = buildCompanyHintQueries(companyHint);
  if (queries.length === 0) return false;

  const quoteNames = [q.shortname ?? "", q.longname ?? ""].filter(Boolean);
  if (quoteNames.length === 0) return false;

  for (const query of queries) {
    const queryNorm = normalizeNameForCompare(query);
    if (!queryNorm) continue;

    for (const quoteName of quoteNames) {
      const quoteNorm = normalizeNameForCompare(quoteName);
      if (!quoteNorm) continue;
      if (quoteNorm.includes(queryNorm) || queryNorm.includes(quoteNorm)) return true;

      const queryTokens = significantNameTokens(query);
      const quoteTokens = new Set(significantNameTokens(quoteName));
      if (queryTokens.length === 0 || quoteTokens.size === 0) continue;
      const overlap = queryTokens.filter((token) => quoteTokens.has(token)).length;
      if (overlap / queryTokens.length >= 0.6) return true;
    }
  }

  return false;
}

async function resolveCompanyHintToTicker(companyHint?: string): Promise<string | null> {
  const queries = buildCompanyHintQueries(companyHint);
  for (const query of queries) {
    const quotes = await fetchYahooSearchQuotes(query);
    const symbol = pickBestUsEquity(quotes);
    if (!symbol) continue;
    const exactQuote = findExactUsEquityQuote(quotes, symbol);
    if (exactQuote && isShellLikeQuote(exactQuote)) continue;
    return symbol;
  }
  return null;
}

function extractCompanyEntityCandidates(text: string): string[] {
  const suffixPattern = COMPANY_ENTITY_SUFFIXES.join("|");
  const re = new RegExp(
    `\\b([A-Z][A-Za-z&.\\-]+(?:\\s+[A-Z][A-Za-z&.\\-]+){0,4}\\s+(?:${suffixPattern}))\\b`,
    "g"
  );
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    out.push(m[1].trim());
  }
  return dedupeInOrder(out).slice(0, 6);
}

function toCleanCompanyHint(raw: string): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(/[^\p{L}\p{N}&.\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extractTickerMentionsDetailed(text: string): TickerMention[] {
  const out: TickerMention[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(/([^\n\r()（）]{2,80})\s*[\(（]([A-Z]{1,5}(?:-[A-Z])?)[\)）]/g)) {
    const normalized = normalizeTickerSymbol(m[2]);
    const key = normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      original: m[2].toUpperCase().trim(),
      normalized,
      companyHint: toCleanCompanyHint(m[1]),
    });
  }

  for (const m of text.matchAll(/[\(（]([A-Z]{1,5}(?:-[A-Z])?)[\)）]/g)) {
    const normalized = normalizeTickerSymbol(m[1]);
    const key = normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      original: m[1].toUpperCase().trim(),
      normalized,
    });
  }

  return out;
}

async function fetchYahooSearchQuotes(query: string): Promise<YahooSearchQuote[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const cacheKey = normalizedQuery.toUpperCase();
  const now = Date.now();
  const cached = yahooSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.quotes;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YAHOO_SEARCH_TIMEOUT_MS);
  try {
    const url =
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(normalizedQuery)}` +
      "&quotesCount=10&newsCount=0";
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { quotes?: YahooSearchQuote[] };
    const quotes = Array.isArray(json.quotes) ? json.quotes : [];
    yahooSearchCache.set(cacheKey, {
      expiresAt: now + YAHOO_CACHE_TTL_MS,
      quotes,
    });
    return quotes;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function isUsEquityQuote(q: YahooSearchQuote): boolean {
  const quoteType = (q.quoteType ?? q.typeDisp ?? "").toUpperCase();
  if (quoteType !== "EQUITY") return false;

  const symbol = (q.symbol ?? "").toUpperCase().trim();
  if (!/^[A-Z]{1,5}(?:-[A-Z])?$/.test(symbol)) return false;

  const exchange = (q.exchange ?? "").toUpperCase().trim();
  if (NON_US_OR_UNSUPPORTED_EXCHANGES.has(exchange)) return false;
  if (US_EXCHANGE_CODES.has(exchange)) return true;

  const exchDisp = (q.exchDisp ?? "").toUpperCase();
  return (
    exchDisp.includes("NASDAQ") ||
    exchDisp.includes("NYSE") ||
    exchDisp.includes("AMERICAN") ||
    exchDisp.includes("BATS")
  );
}

function pickByExactSymbol(quotes: YahooSearchQuote[], symbol: string): string | null {
  const target = symbol.toUpperCase().trim();
  if (!target) return null;
  for (const q of quotes) {
    if (!isUsEquityQuote(q)) continue;
    const s = (q.symbol ?? "").toUpperCase().trim();
    if (s === target) return s;
  }
  return null;
}

function pickBestUsEquity(quotes: YahooSearchQuote[]): string | null {
  const equities = quotes.filter(isUsEquityQuote);
  if (equities.length === 0) return null;
  equities.sort((a, b) => (Number(b.score ?? 0) - Number(a.score ?? 0)));
  return (equities[0].symbol ?? "").toUpperCase().trim() || null;
}

async function resolveMentionToTicker(mention: TickerMention): Promise<string | null> {
  const symbol = mention.normalized;
  if (!symbol) return null;

  const bySymbol = await fetchYahooSearchQuotes(symbol);
  const exactQuote = findExactUsEquityQuote(bySymbol, symbol);
  const exact = exactQuote ? (exactQuote.symbol ?? "").toUpperCase().trim() : null;
  if (exactQuote && isShellLikeQuote(exactQuote)) return null;

  const companyResolved = await resolveCompanyHintToTicker(mention.companyHint);
  const hasSpecificCompanyHint = companyHintLooksSpecific(mention.companyHint);

  if (companyResolved) {
    if (exact && companyResolved !== exact) return null;
    return companyResolved;
  }

  if (exact && hasSpecificCompanyHint && mention.companyHint) {
    if (companyHintMatchesQuote(mention.companyHint, exactQuote!)) return exact;
    return null;
  }

  if (exact && TICKER_SET.has(exact)) {
    return exact;
  }

  return null;
}

export async function findUnsafeCompanyEntities(params: {
  text: string;
  allowedTickers?: string[];
}): Promise<UnsafeCompanyEntity[]> {
  const allowedSet = new Set(
    (params.allowedTickers ?? []).map((x) => normalizeTickerSymbol(x)).filter(Boolean)
  );
  const candidates = extractCompanyEntityCandidates(params.text);
  if (candidates.length === 0) return [];

  const out: UnsafeCompanyEntity[] = [];
  for (const name of candidates) {
    const quotes = await fetchYahooSearchQuotes(name);
    const symbol = pickBestUsEquity(quotes);
    if (!symbol) {
      out.push({ name, reason: "no_listed_match" });
      continue;
    }

    const exactQuote = findExactUsEquityQuote(quotes, symbol);
    if (exactQuote && isShellLikeQuote(exactQuote)) {
      out.push({ name, reason: "shell_like_match", resolvedTicker: symbol });
      continue;
    }

    if (allowedSet.size === 0) {
      out.push({ name, reason: "named_company_without_safe_ticker", resolvedTicker: symbol });
      continue;
    }

    if (!allowedSet.has(symbol)) {
      out.push({ name, reason: "not_in_allowed_tickers", resolvedTicker: symbol });
    }
  }

  return out;
}

export async function resolveAllowedTickers(params: {
  text: string;
  maxTickers: number;
  mode?: "dynamic" | "catalog";
}): Promise<TickerSelectionResult> {
  const { text, maxTickers, mode = "dynamic" } = params;
  if (mode === "catalog") {
    return selectAllowedTickers({ text, maxTickers });
  }
  const mentions = extractTickerMentionsDetailed(text);

  if (mentions.length === 0) {
    return { allowedTickers: [], droppedTickers: [], reason: "no_ticker_mention" };
  }

  if (maxTickers <= 0) {
    return {
      allowedTickers: [],
      droppedTickers: dedupeInOrder(mentions.map((m) => m.normalized)),
      reason: "route_forbids_ticker",
    };
  }

  const resolved = await Promise.all(mentions.map(resolveMentionToTicker));
  const resolvedSymbols = dedupeInOrder(
    resolved.map((x) => (x ?? "").toUpperCase().trim()).filter(Boolean)
  );
  const allowedTickers = resolvedSymbols.slice(0, maxTickers);

  const dropped: string[] = [];
  for (let i = 0; i < mentions.length; i++) {
    const hit = resolved[i]?.toUpperCase().trim();
    if (!hit) {
      dropped.push(mentions[i].normalized);
      continue;
    }
    if (!allowedTickers.includes(hit)) {
      dropped.push(hit);
    }
  }
  const droppedTickers = dedupeInOrder(dropped);

  return {
    allowedTickers,
    droppedTickers,
    reason:
      allowedTickers.length > 0
        ? `selected_dynamic:${allowedTickers.join(",")}`
        : "no_resolved_us_equity",
  };
}
