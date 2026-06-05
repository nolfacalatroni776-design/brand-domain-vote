# Brand Domain Vote

Static GitHub Pages voting page for domain shortlist selection.

## Voting model

- Each voter can select up to three `.com` domestic domains and up to three overseas domains.
- A voter can submit any partial ballot without filling all three slots in either group. Re-submitting creates a new issue and replaces that GitHub user's effective vote with the latest valid submission.
- Long candidate lists use a constrained scroll area with search/filtering and visible result counts.
- The page opens a prefilled GitHub issue for submission.
- GitHub Actions scans `Vote:` issues, deduplicates by GitHub username, and keeps the latest valid vote from each user.
- Aggregated results are written to `data/results.json` and read by the page.
- Users can submit new candidate domains from the Add tab. The page opens an `Add domain:` issue, and GitHub Actions merges valid additions into `data/results.json`.
- Added `.com` domains are grouped as domestic candidates. Added non-`.com` domains are grouped as overseas candidates.
- Added domains must pass an RDAP registration check. Registered domains, unsupported TLDs, or inconclusive checks are rejected.
- Brand availability is self-confirmed by the submitter; the page requires an explicit confirmation checkbox before opening the add-domain issue.

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
