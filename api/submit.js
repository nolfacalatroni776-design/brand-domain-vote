import { createHash } from "node:crypto";

const REPOSITORY = process.env.GITHUB_REPOSITORY || "nolfacalatroni776-design/brand-domain-vote";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.BRAND_VOTE_GITHUB_TOKEN;
const VOTER_ID_SALT = process.env.VOTER_ID_SALT || "";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://nolfacalatroni776-design.github.io",
  "https://brand-domain-vote.vercel.app",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const MAX_VOTES_PER_GROUP = 3;

const baseDomestic = [
  "KunlunGround.com",
  "OrbitTasker.com",
  "annocrew.com",
  "crowdAnno.com"
];

const baseOverseas = [
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

const rdapCache = new Map();

function allowOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function validDomain(domain) {
  return /^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain)
    && !domain.split(".").some((part) => part.startsWith("-") || part.endsWith("-"));
}

function groupForDomain(domain) {
  return domain.endsWith(".com") ? "domestic" : "overseas";
}

function normalizeBrand(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validBrand(brand) {
  return /^[\p{L}\p{N}][\p{L}\p{N} .&'_-]{1,79}$/u.test(brand);
}

function normalizeVoterKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validVoterKey(value) {
  const normalized = normalizeVoterKey(value);
  return normalized.length >= 2 && normalized.length <= 80;
}

function voterIdFor(voterKey) {
  if (!VOTER_ID_SALT) {
    throw new Error("VOTER_ID_SALT is required.");
  }
  return createHash("sha256")
    .update(`${VOTER_ID_SALT}\n${normalizeVoterKey(voterKey).toLowerCase()}`)
    .digest("hex");
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}

function mapCandidates(domestic, overseas) {
  return {
    domestic: new Map(domestic.map((domain) => [domain.toLowerCase(), domain])),
    overseas: new Map(overseas.map((domain) => [domain.toLowerCase(), domain]))
  };
}

async function fetchCandidates() {
  const domestic = [...baseDomestic];
  const overseas = [...baseOverseas];
  const current = await fetchCurrentResults();
  domestic.push(...Object.keys(current.domestic || {}));
  overseas.push(...Object.keys(current.overseas || {}));
  return {
    domestic: [...new Set(domestic)],
    overseas: [...new Set(overseas)]
  };
}

async function fetchCurrentResults() {
  try {
    const response = await fetch("https://nolfacalatroni776-design.github.io/brand-domain-vote/data/results.json", {
      cache: "no-store"
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Rebuild from base candidates if the public result file is unavailable.
  }
  return {
    generatedAt: null,
    totalVoters: 0,
    domestic: Object.fromEntries(baseDomestic.map((domain) => [domain, { votes: 0 }])),
    overseas: Object.fromEntries(baseOverseas.map((domain) => [domain, { votes: 0 }])),
    addedDomains: [],
    votes: []
  };
}

async function rdapEndpointFor(domain) {
  const tld = domain.split(".").pop();
  if (!tld) return null;
  if (!rdapCache.has("bootstrap")) {
    const response = await fetch("https://data.iana.org/rdap/dns.json", {
      headers: { "Accept": "application/json", "User-Agent": "brand-domain-vote-submit-api" }
    });
    if (!response.ok) throw new Error(`IANA RDAP bootstrap failed: ${response.status}`);
    rdapCache.set("bootstrap", await response.json());
  }
  const bootstrap = rdapCache.get("bootstrap");
  const service = bootstrap.services?.find(([names]) => names.includes(tld));
  const endpoint = service?.[1]?.[0];
  return endpoint ? (endpoint.endsWith("/") ? endpoint : `${endpoint}/`) : null;
}

async function domainAvailability(domain) {
  const endpoint = await rdapEndpointFor(domain);
  if (!endpoint) {
    return { ok: false, available: false, reason: `无法找到 .${domain.split(".").pop()} 的 RDAP 查询端点` };
  }
  const response = await fetch(`${endpoint}domain/${encodeURIComponent(domain)}`, {
    headers: { "Accept": "application/rdap+json, application/json", "User-Agent": "brand-domain-vote-submit-api" }
  });
  if (response.status === 404) return { ok: true, available: true };
  if (response.status === 200) return { ok: true, available: false, reason: "域名已注册" };
  return { ok: false, available: false, reason: `RDAP 查询返回 ${response.status}` };
}

function issueBody(title, payload) {
  return [
    title,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```"
  ].join("\n");
}

function emptyCounts(items) {
  return Object.fromEntries(items.map((domain) => [domain, { votes: 0 }]));
}

function increment(group, domain) {
  group[domain] ||= { votes: 0 };
  group[domain].votes += 1;
}

async function resultWithVote(payload, createdIssue) {
  const current = await fetchCurrentResults();
  const domesticCandidates = [...new Set([...baseDomestic, ...Object.keys(current.domestic || {})])];
  const overseasCandidates = [...new Set([...baseOverseas, ...Object.keys(current.overseas || {})])];
  const voterKey = payload.voterId;
  const votes = (Array.isArray(current.votes) ? current.votes : [])
    .filter((vote) => (vote.voterId || vote.user) !== voterKey);
  const createdAt = createdIssue.created_at || payload.submittedAt;
  votes.push({
    voterId: payload.voterId,
    user: "api",
    domestic: payload.domestic,
    overseas: payload.overseas,
    choices: [...payload.domestic, ...payload.overseas],
    issue: createdIssue.html_url,
    createdAt,
    submittedAt: payload.submittedAt
  });
  votes.sort((a, b) => (a.user || "").localeCompare(b.user || "") || String(a.voterId || "").localeCompare(String(b.voterId || "")));

  const result = {
    generatedAt: new Date().toISOString(),
    totalVoters: votes.length,
    domestic: emptyCounts(domesticCandidates),
    overseas: emptyCounts(overseasCandidates),
    addedDomains: Array.isArray(current.addedDomains) ? current.addedDomains : [],
    votes,
    realtime: true
  };

  for (const vote of votes) {
    for (const domain of Array.isArray(vote.domestic) ? vote.domestic : []) increment(result.domestic, domain);
    for (const domain of Array.isArray(vote.overseas) ? vote.overseas : []) increment(result.overseas, domain);
  }

  return result;
}

async function createIssue(title, body) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required.");
  }
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/issues`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "brand-domain-vote-submit-api"
    },
    body: JSON.stringify({ title, body })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `GitHub issue API failed: ${response.status}`);
  }
  return data;
}

async function buildVoteIssue(input) {
  const voterKey = normalizeVoterKey(input.voterKey);
  if (!validVoterKey(voterKey)) {
    return { error: "请输入 2-80 个字符的投票人标识。", status: 400 };
  }

  const { domestic, overseas } = await fetchCandidates();
  const maps = mapCandidates(domestic, overseas);
  const domesticChoices = [...new Set((Array.isArray(input.domestic) ? input.domestic : [])
    .map((domain) => maps.domestic.get(normalizeDomain(domain)))
    .filter(Boolean))].slice(0, MAX_VOTES_PER_GROUP);
  const overseasChoices = [...new Set((Array.isArray(input.overseas) ? input.overseas : [])
    .map((domain) => maps.overseas.get(normalizeDomain(domain)))
    .filter(Boolean))].slice(0, MAX_VOTES_PER_GROUP);

  if (domesticChoices.length + overseasChoices.length === 0) {
    return { error: "请选择至少一个候选域名。", status: 400 };
  }

  const voterId = voterIdFor(voterKey);
  const payload = {
    type: "brand-domain-vote",
    version: 3,
    voterId,
    domestic: domesticChoices,
    overseas: overseasChoices,
    submittedVia: "api",
    submittedAt: new Date().toISOString()
  };
  return {
    title: `Vote: ${voterId.slice(0, 12)}`,
    body: issueBody("Brand domain vote", payload),
    payload
  };
}

async function buildAddDomainIssue(input) {
  const brand = normalizeBrand(input.brand);
  const domain = normalizeDomain(input.domain);

  if (!validBrand(brand)) {
    return { error: "请输入有效品牌名，长度 2-80，可包含字母、数字、空格和 .&'_-。", status: 400 };
  }
  if (!input.brandAvailableConfirmed) {
    return { error: "请先确认品牌名可用。", status: 400 };
  }
  if (!validDomain(domain)) {
    return { error: "请输入有效域名，例如 example.ai 或 example.com。", status: 400 };
  }

  const { domestic, overseas } = await fetchCandidates();
  const maps = mapCandidates(domestic, overseas);
  if (maps.domestic.has(domain) || maps.overseas.has(domain)) {
    return { error: "这个域名已经在候选列表中，可以直接投票。", status: 400 };
  }

  const availability = await domainAvailability(domain);
  if (!availability.ok || !availability.available) {
    return { error: availability.reason || "域名不可用。", status: 400 };
  }

  const payload = {
    type: "brand-domain-add",
    version: 3,
    brand,
    domain,
    group: groupForDomain(domain),
    brandAvailableConfirmed: true,
    submittedVia: "api",
    submittedAt: new Date().toISOString()
  };
  return {
    title: `Add domain: ${brand} / ${domain}`,
    body: issueBody("Add brand domain candidate", payload),
    payload
  };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  if (!allowOrigin(req.headers.origin)) {
    sendJson(res, 403, { ok: false, error: "提交来源未授权。" });
    return;
  }

  let input;
  try {
    input = parseBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: "请求格式不是有效 JSON。" });
    return;
  }

  try {
    const issue = input.kind === "add-domain"
      ? await buildAddDomainIssue(input)
      : await buildVoteIssue(input);
    if (issue.error) {
      sendJson(res, issue.status || 400, { ok: false, error: issue.error });
      return;
    }

    const created = await createIssue(issue.title, issue.body);
    const result = input.kind === "add-domain" ? null : await resultWithVote(issue.payload, created);
    sendJson(res, 200, {
      ok: true,
      issueNumber: created.number,
      issueUrl: created.html_url,
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败，请稍后重试。";
    sendJson(res, 500, { ok: false, error: message });
  }
}
