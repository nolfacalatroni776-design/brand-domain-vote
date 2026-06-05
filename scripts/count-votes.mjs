import { writeFile } from "node:fs/promises";

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

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token || !repository) {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
}

const headers = {
  "Accept": "application/vnd.github+json",
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "brand-domain-vote-counter"
};
const rdapCache = new Map();

async function fetchIssues() {
  const issues = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `https://api.github.com/repos/${repository}/issues?state=all&per_page=100&page=${page}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub issues API failed: ${response.status} ${await response.text()}`);
    }
    const batch = await response.json();
    issues.push(...batch.filter((issue) => !issue.pull_request));
    if (batch.length < 100) break;
  }
  return issues;
}

async function commentOnIssue(issue, message) {
  if (!issue.comments_url) return;
  const marker = "<!-- brand-domain-vote-check -->";
  const existingResponse = await fetch(issue.comments_url, { headers });
  const existing = existingResponse.ok ? await existingResponse.json() : [];
  if (Array.isArray(existing) && existing.some((comment) => comment.body?.includes(marker))) return;

  const response = await fetch(issue.comments_url, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: `${marker}\n${message}` })
  });
  if (!response.ok) {
    console.warn(`Unable to comment on issue ${issue.number}: ${response.status} ${await response.text()}`);
  }
}

async function rdapEndpointFor(domain) {
  const tld = domain.split(".").pop();
  if (!tld) return null;
  if (!rdapCache.has("bootstrap")) {
    const response = await fetch("https://data.iana.org/rdap/dns.json", {
      headers: { "Accept": "application/json", "User-Agent": "brand-domain-vote-counter" }
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
    headers: { "Accept": "application/rdap+json, application/json", "User-Agent": "brand-domain-vote-counter" }
  });
  if (response.status === 404) return { ok: true, available: true };
  if (response.status === 200) return { ok: true, available: false, reason: "域名已注册" };
  return { ok: false, available: false, reason: `RDAP 查询返回 ${response.status}` };
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

function extractPayload(issue, expectedType) {
  const match = issue.body?.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }

  return payload.type === expectedType ? payload : null;
}

function candidateMaps(domestic, overseas) {
  return {
    domestic: new Map(domestic.map((domain) => [domain.toLowerCase(), domain])),
    overseas: new Map(overseas.map((domain) => [domain.toLowerCase(), domain]))
  };
}

async function parseAddDomain(issue, maps) {
  if (!issue.title?.startsWith("Add domain:")) return null;
  const payload = extractPayload(issue, "brand-domain-add");
  if (!payload) return null;

  const brand = normalizeBrand(payload.brand);
  const domain = normalizeDomain(payload.domain);
  if (!validBrand(brand)) {
    await commentOnIssue(issue, "新增域名未通过：品牌名格式无效。");
    return null;
  }
  if (!payload.brandAvailableConfirmed) {
    await commentOnIssue(issue, "新增域名未通过：提交时未确认品牌名可用。");
    return null;
  }
  if (!validDomain(domain)) {
    await commentOnIssue(issue, "新增域名未通过：域名格式无效。");
    return null;
  }

  const group = groupForDomain(domain);
  if (maps.domestic.has(domain) || maps.overseas.has(domain)) return null;

  const availability = await domainAvailability(domain);
  if (!availability.ok || !availability.available) {
    await commentOnIssue(issue, `新增域名未通过：${availability.reason || "域名不可用"}。`);
    return null;
  }

  return {
    brand,
    domain,
    group,
    user: issue.user?.login || "unknown",
    issue: issue.html_url,
    createdAt: issue.created_at,
    submittedAt: payload.submittedAt || issue.created_at
  };
}

function parseVote(issue, maps) {
  if (!issue.title?.startsWith("Vote:")) return null;
  const payload = extractPayload(issue, "brand-domain-vote");
  if (!payload) return null;

  const domesticPayload = Array.isArray(payload.domestic) ? payload.domestic : [payload.domestic];
  const overseasPayload = Array.isArray(payload.overseas) ? payload.overseas : [payload.overseas];
  const domestic = [...new Set(domesticPayload.map((domain) => maps.domestic.get(normalizeDomain(domain))).filter(Boolean))].slice(0, 3);
  const overseas = [...new Set(overseasPayload.map((domain) => maps.overseas.get(normalizeDomain(domain))).filter(Boolean))].slice(0, 3);
  const isClear = payload.clear === true;
  if (!isClear && domestic.length + overseas.length === 0) return null;

  return {
    voterId: payload.voterId || null,
    user: issue.user?.login || "unknown",
    clear: isClear,
    domestic,
    overseas,
    choices: [...domestic, ...overseas],
    issue: issue.html_url,
    createdAt: issue.created_at,
    submittedAt: payload.submittedAt || issue.created_at
  };
}

function emptyCounts(items) {
  return Object.fromEntries(items.map((domain) => [domain, { votes: 0 }]));
}

function increment(group, domain) {
  group[domain] ||= { votes: 0 };
  group[domain].votes += 1;
}

function voteTimestamp(vote) {
  return new Date(vote.submittedAt || vote.createdAt).getTime();
}

const issues = await fetchIssues();
const domestic = [...baseDomestic];
const overseas = [...baseOverseas];
const maps = candidateMaps(domestic, overseas);
const addedDomains = [];

for (const issue of issues) {
  const added = await parseAddDomain(issue, maps);
  if (!added) continue;
  addedDomains.push(added);
  if (added.group === "domestic") {
    domestic.push(added.domain);
    maps.domestic.set(added.domain, added.domain);
  } else {
    overseas.push(added.domain);
    maps.overseas.set(added.domain, added.domain);
  }
}

const latestByUser = new Map();

for (const issue of issues) {
  const vote = parseVote(issue, maps);
  if (!vote) continue;
  const voterKey = vote.voterId || vote.user;
  const previous = latestByUser.get(voterKey);
  if (!previous || voteTimestamp(vote) >= voteTimestamp(previous)) {
    latestByUser.set(voterKey, vote);
  }
}

const votes = [...latestByUser.values()].sort((a, b) => a.user.localeCompare(b.user));
const activeVotes = votes.filter((vote) => !vote.clear);
const result = {
  generatedAt: new Date().toISOString(),
  totalVoters: activeVotes.length,
  domestic: emptyCounts(domestic),
  overseas: emptyCounts(overseas),
  addedDomains: addedDomains.sort((a, b) => a.domain.localeCompare(b.domain)),
  votes: activeVotes
};

for (const vote of activeVotes) {
  for (const domain of vote.domestic) increment(result.domestic, domain);
  for (const domain of vote.overseas) increment(result.overseas, domain);
}

await writeFile("data/results.json", `${JSON.stringify(result, null, 2)}\n`);
