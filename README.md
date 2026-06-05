# Brand Domain Vote

Static GitHub Pages voting page for domain shortlist selection.

## Voting model

- Each voter can select up to three `.com` domestic domains and up to three overseas domains.
- A voter can submit any partial ballot without filling all three slots in either group. Re-submitting records a new backend submission and replaces that voter's effective vote with the latest valid submission.
- Long candidate lists use a constrained scroll area with search/filtering and visible result counts.
- The page submits directly to the `/api/submit` serverless endpoint. The endpoint creates internal GitHub issues, so voters do not need to understand or visit GitHub.
- GitHub Actions scans `Vote:` issues, deduplicates by hashed voter identity when present, and keeps the latest valid vote from each voter.
- Aggregated results are written to `data/results.json` and read by the page.
- Users can submit new candidate domains from the Add tab. The serverless endpoint opens an internal `Add domain:` issue, and GitHub Actions merges valid additions into `data/results.json`.
- Added `.com` domains are grouped as domestic candidates. Added non-`.com` domains are grouped as overseas candidates.
- Added domains must pass an RDAP registration check. Registered domains, unsupported TLDs, or inconclusive checks are rejected.
- Brand availability is self-confirmed by the submitter; the page requires an explicit confirmation checkbox before submitting a new candidate.

## Candidate groups

Domestic `.com`:

- `KunlunGround.com`
- `OrbitTasker.com`
- `annocrew.com`
- `crowdAnno.com`

Overseas:

- `humanbench.ai`
- `crowdbench.ai`
- `omnitruth.ai`
- `nextbench.ai`
- `evalcrew.ai`
- `benchcrew.ai`
- `crewbench.ai`
- `rubricbench.ai`
- `judgebench.ai`
- `omnieval.ai`
- `omnianno.ai`
- `omnirubric.ai`
- `benchgrid.ai`
- `veribench.ai`
- `scorebench.ai`
- `benchscore.ai`
- `omniverify.ai`
- `Pronovix.ai`
- `CorpusFlow.ai`
- `VelaBase.ai`
- `PyxisBase.ai`
- `AIPayout.ai`
- `AIPayout.io`
- `DataGigs.ai`
- `VastPulse.ai`
- `CogniLoop.ai`
- `annocrew.ai`
- `crowdAnno.ai`

## Local preview

```bash
python3 -m http.server 8787
```

Open `http://127.0.0.1:8787`.

## Direct submission API

GitHub Pages is static and cannot safely write votes by itself. Direct submission uses a serverless endpoint in `api/submit.js`, intended for Vercel.

Required environment variables for the API deployment:

- `GITHUB_TOKEN`: a GitHub token with permission to create issues in `nolfacalatroni776-design/brand-domain-vote`.
- `GITHUB_REPOSITORY`: optional, defaults to `nolfacalatroni776-design/brand-domain-vote`.
- `VOTER_ID_SALT`: required secret salt for hashing voter identity before it is stored in public issues/results.
- `ALLOWED_ORIGINS`: optional comma-separated origins. Defaults include the GitHub Pages URL and `brand-domain-vote.vercel.app`.

The public GitHub Pages page calls `https://brand-domain-vote.vercel.app/api/submit` by default. If the Vercel project uses a different domain, update `DEFAULT_API_ENDPOINT` in `index.html` or set `window.BRAND_VOTE_API_ENDPOINT` before the page script loads.
