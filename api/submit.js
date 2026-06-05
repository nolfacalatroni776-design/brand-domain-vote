import { createHash } from "node:crypto";
import {
  ADDED_DOMAINS_KEY,
  GITHUB_TOKEN,
  MAX_VOTES_PER_GROUP,
  REPOSITORY,
  VOTER_ID_SALT,
  allowOrigin,
  candidateMaps,
  computeResult,
  fetchStaticResult,
  groupForDomain,
  hasRedisEnv,
  normalizeBrand,
  normalizeDomain,
  normalizeVoterKey,
  parseBody,
  redisCandidates,
  redisClient,
  redisResult,
  sendJson,
  setCors,
  validBrand,
  validDomain,
  validVoterKey,
  VOTES_KEY
} from "./_shared.js";

const rdapCache = new Map();

function voterIdFor(voterKey) {
  if (!VOTER_ID_SALT) {
    throw new Error("VOTER_ID_SALT is required.");
  }
  return createHash("sha256")
    .update(`${VOTER_ID_SALT}\n${normalizeVoterKey(voterKey).toLowerCase()}`)
    .digest("hex");
}

async function fallbackCandidates() {
  const current = await fetchStaticResult();
  return {
    domestic: Object.keys(current.domestic || {}),
    overseas: Object.keys(current.overseas || {}),
    addedDomains: Array.isArray(current.addedDomains) ? current.addedDomains : []
  };
}

async function currentCandidates() {
  const redis = redisClient();
  return redis ? redisCandidates(redis) : fallbackCandidates();
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

async function buildVotePayload(input) {
  const voterKey = normalizeVoterKey(input.voterKey);
  if (!validVoterKey(voterKey)) {
    return { error: "请输入 2-80 个字符的投票人标识。", status: 400 };
  }
  const isClear = input.clear === true;
  const { domestic, overseas } = await currentCandidates();
  const maps = candidateMaps(domestic, overseas);
  const domesticChoices = [...new Set((Array.isArray(input.domestic) ? input.domestic : [])
    .map((domain) => maps.domestic.get(normalizeDomain(domain)))
    .filter(Boolean))].slice(0, MAX_VOTES_PER_GROUP);
  const overseasChoices = [...new Set((Array.isArray(input.overseas) ? input.overseas : [])
    .map((domain) => maps.overseas.get(normalizeDomain(domain)))
    .filter(Boolean))].slice(0, MAX_VOTES_PER_GROUP);

  if (!isClear && domesticChoices.length + overseasChoices.length === 0) {
    return { error: "请选择至少一个候选域名。", status: 400 };
  }

  const voterId = voterIdFor(voterKey);
  return {
    payload: {
      type: "brand-domain-vote",
      version: 4,
      voterId,
      user: "api",
      clear: isClear,
      domestic: domesticChoices,
      overseas: overseasChoices,
      choices: [...domesticChoices, ...overseasChoices],
      submittedVia: hasRedisEnv() ? "redis" : "api",
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString()
    }
  };
}

async function buildAddDomainPayload(input) {
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

  const { domestic, overseas } = await currentCandidates();
  const maps = candidateMaps(domestic, overseas);
  if (maps.domestic.has(domain) || maps.overseas.has(domain)) {
    return { error: "这个域名已经在候选列表中，可以直接投票。", status: 400 };
  }

  const availability = await domainAvailability(domain);
  if (!availability.ok || !availability.available) {
    return { error: availability.reason || "域名不可用。", status: 400 };
  }

  return {
    payload: {
      type: "brand-domain-add",
      version: 4,
      brand,
      domain,
      group: groupForDomain(domain),
      brandAvailableConfirmed: true,
      submittedVia: hasRedisEnv() ? "redis" : "api",
      submittedAt: new Date().toISOString()
    }
  };
}

async function submitVoteToRedis(payload) {
  const redis = redisClient();
  if (!redis) return null;
  await redis.hset(VOTES_KEY, { [payload.voterId]: payload });
  return redisResult();
}

async function addDomainToRedis(payload) {
  const redis = redisClient();
  if (!redis) return null;
  await redis.hset(ADDED_DOMAINS_KEY, { [payload.domain.toLowerCase()]: payload });
  const { domestic, overseas, addedDomains } = await redisCandidates(redis);
  return computeResult({ domestic, overseas, addedDomains, votes: await redis.hvals(VOTES_KEY), realtime: true });
}

async function submitViaIssue(payload) {
  const isAdd = payload.type === "brand-domain-add";
  const title = isAdd
    ? `Add domain: ${payload.brand} / ${payload.domain}`
    : `Vote: ${payload.voterId.slice(0, 12)}${payload.clear ? " clear" : ""}`;
  const created = await createIssue(title, issueBody(isAdd ? "Add brand domain candidate" : "Brand domain vote", payload));
  return {
    issueNumber: created.number,
    issueUrl: created.html_url,
    result: isAdd ? null : await fallbackResultWithVote(payload, created)
  };
}

async function fallbackResultWithVote(payload, createdIssue) {
  const current = await fetchStaticResult();
  const domestic = Object.keys(current.domestic || {});
  const overseas = Object.keys(current.overseas || {});
  const votes = (Array.isArray(current.votes) ? current.votes : [])
    .filter((vote) => (vote.voterId || vote.user) !== payload.voterId);
  if (!payload.clear) {
    votes.push({
      ...payload,
      issue: createdIssue.html_url,
      createdAt: createdIssue.created_at || payload.submittedAt
    });
  }
  return computeResult({
    domestic,
    overseas,
    addedDomains: Array.isArray(current.addedDomains) ? current.addedDomains : [],
    votes,
    realtime: true
  });
}

export default async function handler(req, res) {
  setCors(req, res, "POST, OPTIONS");

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
    const built = input.kind === "add-domain"
      ? await buildAddDomainPayload(input)
      : await buildVotePayload(input);
    if (built.error) {
      sendJson(res, built.status || 400, { ok: false, error: built.error });
      return;
    }

    const payload = built.payload;
    if (hasRedisEnv()) {
      const result = payload.type === "brand-domain-add"
        ? await addDomainToRedis(payload)
        : await submitVoteToRedis(payload);
      sendJson(res, 200, { ok: true, result, source: "redis" });
      return;
    }

    const issueResult = await submitViaIssue(payload);
    sendJson(res, 200, { ok: true, ...issueResult, source: "github-issue" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败，请稍后重试。";
    sendJson(res, 500, { ok: false, error: message });
  }
}
