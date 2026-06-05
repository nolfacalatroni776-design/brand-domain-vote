import { writeFile } from "node:fs/promises";

const domestic = [
  "KunlunGround.com",
  "OrbitTasker.com",
  "annocrew.com",
  "crowdAnno.com"
];

const overseas = [
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
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "brand-domain-vote-counter"
};

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

function parseVote(issue) {
  if (!issue.title?.startsWith("Vote:")) return null;
  const match = issue.body?.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }

  if (payload.type !== "brand-domain-vote") return null;
  if (!domestic.includes(payload.domestic)) return null;
  if (!overseas.includes(payload.overseas)) return null;

  return {
    user: issue.user?.login || "unknown",
    domestic: payload.domestic,
    overseas: payload.overseas,
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

const issues = await fetchIssues();
const latestByUser = new Map();

for (const issue of issues) {
  const vote = parseVote(issue);
  if (!vote) continue;
  const previous = latestByUser.get(vote.user);
  if (!previous || new Date(vote.createdAt) >= new Date(previous.createdAt)) {
    latestByUser.set(vote.user, vote);
  }
}

const votes = [...latestByUser.values()].sort((a, b) => a.user.localeCompare(b.user));
const result = {
  generatedAt: new Date().toISOString(),
  totalVoters: votes.length,
  domestic: emptyCounts(domestic),
  overseas: emptyCounts(overseas),
  votes
};

for (const vote of votes) {
  increment(result.domestic, vote.domestic);
  increment(result.overseas, vote.overseas);
}

await writeFile("data/results.json", `${JSON.stringify(result, null, 2)}\n`);
