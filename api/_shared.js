import { Redis } from "@upstash/redis";

export const REPOSITORY = process.env.GITHUB_REPOSITORY || "nolfacalatroni776-design/brand-domain-vote";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.BRAND_VOTE_GITHUB_TOKEN;
export const VOTER_ID_SALT = process.env.VOTER_ID_SALT || "";
export const DEFAULT_ALLOWED_ORIGINS = [
  "https://nolfacalatroni776-design.github.io",
  "https://brand-domain-vote.vercel.app",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
];
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const MAX_VOTES_PER_GROUP = 3;
export const VOTES_KEY = "brand-domain-vote:votes";
export const ADDED_DOMAINS_KEY = "brand-domain-vote:added-domains";
export const SEEDED_KEY = "brand-domain-vote:seeded";

export const baseDomestic = [
  "KunlunGround.com",
  "OrbitTasker.com",
  "annocrew.com",
  "crowdAnno.com"
];

export const baseOverseas = [
  "humanbench.ai",
  "crowdbench.ai",
  "omnitruth.ai",
  "nextbench.ai",
  "evalcrew.ai",
  "benchcrew.ai",
  "crewbench.ai",
  "rubricbench.ai",
  "judgebench.ai",
  "omnieval.ai",
  "omnianno.ai",
  "omnirubric.ai",
  "benchgrid.ai",
  "veribench.ai",
  "scorebench.ai",
  "benchscore.ai",
  "omniverify.ai",
  "Pronovix.ai",
  "CorpusFlow.ai",
  "VelaBase.ai",
  "PyxisBase.ai",
  "AIPayout.ai",
  "AIPayout.io",
  "DataGigs.ai",
  "VastPulse.ai",
  "CogniLoop.ai",
  "annocrew.ai",
  "crowdAnno.ai"
];

export function allowOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

export function setCors(req, res, methods = "GET, POST, OPTIONS") {
  const origin = req.headers.origin;
  if (allowOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");
}

export function sendJson(res, status, body) {
  res.status(status).json(body);
}

export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function validDomain(domain) {
  return /^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain)
    && !domain.split(".").some((part) => part.startsWith("-") || part.endsWith("-"));
}

export function groupForDomain(domain) {
  return domain.endsWith(".com") ? "domestic" : "overseas";
}

export function normalizeBrand(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function validBrand(brand) {
  return /^[\p{L}\p{N}][\p{L}\p{N} .&'_-]{1,79}$/u.test(brand);
}

export function normalizeVoterKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function validVoterKey(value) {
  const normalized = normalizeVoterKey(value);
  return normalized.length >= 2 && normalized.length <= 80;
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}

export function candidateMaps(domestic, overseas) {
  return {
    domestic: new Map(domestic.map((domain) => [domain.toLowerCase(), domain])),
    overseas: new Map(overseas.map((domain) => [domain.toLowerCase(), domain]))
  };
}

export function emptyResult() {
  return {
    generatedAt: null,
    totalVoters: 0,
    domestic: Object.fromEntries(baseDomestic.map((domain) => [domain, { votes: 0 }])),
    overseas: Object.fromEntries(baseOverseas.map((domain) => [domain, { votes: 0 }])),
    addedDomains: [],
    votes: []
  };
}

export async function fetchStaticResult() {
  try {
    const response = await fetch("https://nolfacalatroni776-design.github.io/brand-domain-vote/data/results.json", {
      cache: "no-store"
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Static result is a fallback only.
  }
  return emptyResult();
}

export function emptyCounts(items) {
  return Object.fromEntries(items.map((domain) => [domain, { votes: 0 }]));
}

export function increment(group, domain) {
  group[domain] ||= { votes: 0 };
  group[domain].votes += 1;
}

export function voteTimestamp(vote) {
  return new Date(vote.submittedAt || vote.createdAt).getTime();
}

export function normalizeVoteRecord(vote) {
  const parsed = typeof vote === "string" ? JSON.parse(vote) : vote;
  return {
    voterId: parsed.voterId || null,
    user: parsed.user || "api",
    clear: parsed.clear === true,
    domestic: Array.isArray(parsed.domestic) ? parsed.domestic : [],
    overseas: Array.isArray(parsed.overseas) ? parsed.overseas : [],
    choices: Array.isArray(parsed.choices) ? parsed.choices : [
      ...(Array.isArray(parsed.domestic) ? parsed.domestic : []),
      ...(Array.isArray(parsed.overseas) ? parsed.overseas : [])
    ],
    issue: parsed.issue || null,
    createdAt: parsed.createdAt || parsed.submittedAt || new Date().toISOString(),
    submittedAt: parsed.submittedAt || parsed.createdAt || new Date().toISOString()
  };
}

export function computeResult({ domestic, overseas, addedDomains = [], votes = [], realtime = false }) {
  const latestByUser = new Map();
  for (const rawVote of votes) {
    const vote = normalizeVoteRecord(rawVote);
    const voterKey = vote.voterId || vote.user;
    const previous = latestByUser.get(voterKey);
    if (!previous || voteTimestamp(vote) >= voteTimestamp(previous)) {
      latestByUser.set(voterKey, vote);
    }
  }

  const activeVotes = [...latestByUser.values()]
    .filter((vote) => !vote.clear)
    .sort((a, b) => a.user.localeCompare(b.user) || String(a.voterId || "").localeCompare(String(b.voterId || "")));
  const result = {
    generatedAt: new Date().toISOString(),
    totalVoters: activeVotes.length,
    domestic: emptyCounts(domestic),
    overseas: emptyCounts(overseas),
    addedDomains: [...addedDomains].sort((a, b) => a.domain.localeCompare(b.domain)),
    votes: activeVotes,
    realtime
  };

  for (const vote of activeVotes) {
    for (const domain of vote.domestic) increment(result.domestic, domain);
    for (const domain of vote.overseas) increment(result.overseas, domain);
  }

  return result;
}

export function redisEnv() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  };
}

export function hasRedisEnv() {
  const env = redisEnv();
  return Boolean(env.url && env.token);
}

export function redisClient() {
  const env = redisEnv();
  if (!env.url || !env.token) return null;
  return new Redis({ url: env.url, token: env.token });
}

export async function seedRedisFromStatic(redis) {
  const seeded = await redis.get(SEEDED_KEY);
  if (seeded) return;

  const staticResult = await fetchStaticResult();
  const voteEntries = {};
  for (const vote of Array.isArray(staticResult.votes) ? staticResult.votes : []) {
    const normalized = normalizeVoteRecord(vote);
    const voterKey = normalized.voterId || normalized.user;
    voteEntries[voterKey] = normalized;
  }

  const addedEntries = {};
  for (const item of Array.isArray(staticResult.addedDomains) ? staticResult.addedDomains : []) {
    if (item?.domain) {
      addedEntries[normalizeDomain(item.domain)] = item;
    }
  }

  if (Object.keys(voteEntries).length) await redis.hset(VOTES_KEY, voteEntries);
  if (Object.keys(addedEntries).length) await redis.hset(ADDED_DOMAINS_KEY, addedEntries);
  await redis.set(SEEDED_KEY, new Date().toISOString());
}

export async function redisCandidates(redis) {
  await seedRedisFromStatic(redis);
  const added = redis ? await redis.hvals(ADDED_DOMAINS_KEY) : [];
  const addedDomains = added
    .map((item) => typeof item === "string" ? JSON.parse(item) : item)
    .filter((item) => item && item.domain && item.group);
  const domestic = [...baseDomestic];
  const overseas = [...baseOverseas];
  for (const item of addedDomains) {
    if (item.group === "domestic") domestic.push(item.domain);
    else overseas.push(item.domain);
  }
  return {
    domestic: [...new Set(domestic)],
    overseas: [...new Set(overseas)],
    addedDomains
  };
}

export async function redisResult() {
  const redis = redisClient();
  if (!redis) return null;
  await seedRedisFromStatic(redis);
  const [{ domestic, overseas, addedDomains }, votes] = await Promise.all([
    redisCandidates(redis),
    redis.hvals(VOTES_KEY)
  ]);
  return computeResult({
    domestic,
    overseas,
    addedDomains,
    votes: votes.map((item) => typeof item === "string" ? JSON.parse(item) : item),
    realtime: true
  });
}
