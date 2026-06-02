# RFC — The News of the Day

## Problem & goal

Following the daily news through dozens of outlets is noisy and time-consuming, yet most days have one story that actually matters. The News of the Day is a one-page website that surfaces a single, LLM-synthesized "news of the day" with links to the sources it was built from, refreshed every 3 hours.

The goal is a calm, glanceable replacement for doomscrolling a feed — open the page, get one well-sourced story, close the tab.

A secondary goal is hands-on practice with Vercel Cron, Tavily, Nebius, and Vercel KV.

## Non-goals

- No user accounts, sign-in, or personalization.
- No archive — only "today" is visible; older entries may exist in storage but aren't surfaced.
- No comments, reactions, or social features.
- No multi-story feed — exactly one news item per refresh.
- No mobile app — responsive web only.
- No live/breaking-news guarantees — refreshed every 3 hours, not real-time.
- No editorial control panel — the LLM's output is what ships (no human-in-the-loop step in v1).

## Success criteria

- The site is live on a public Vercel URL (custom domain optional).
- Vercel Cron has run `/api/refresh` every 3 hours for 7 consecutive days with no manual intervention.
- On any visit, the page renders a single headline + dek + image + at least 3 source links.
- The main news shows a "last updated" timestamp; if the timestamp is older than 210 minutes, a stale warning is shown.

## Proposed solution

### Sequence diagram

The refresh runs server-side every 3 hours; KV is read server-side (the browser never reads KV directly).

```mermaid
sequenceDiagram
  participant C as Vercel Cron
  participant R as Vercel /api/refresh
  participant T as Tavily
  participant N as Nebius
  participant KV as Upstash Redis
  participant V as Visitor
  participant P as Vercel page (server)
  participant L as Vercel /api/latest

  Note over C,KV: Refresh every 3 hours
  C->>R: scheduled GET + secret
  R->>R: validate cron secret
  R->>T: crawl sources
  T-->>R: articles
  R->>N: send articles + prompt
  N-->>R: synthesized news
  R->>KV: store news:latest
  KV-->>R: ok
  R-->>C: 200 done

  Note over V,KV: Page load (later)
  V->>P: GET / (server component)
  P->>KV: GET news:latest
  KV-->>P: news payload
  P-->>V: render HTML
  Note over P,L: /api/latest is an auxiliary JSON endpoint (also reads KV; not used by the page)
```

### Tools

| Task | Tool |
|---|---|
| Write & edit code | Claude Code (desktop) |
| Preview UI while building | Browser at `localhost:3000` |
| Web framework | Next.js (TypeScript + Tailwind) |
| 3-hourly refresh trigger | Vercel Cron |
| Crawl news sources | Tavily API (called from `/api/refresh`) |
| Synthesize daily news | Nebius-hosted LLM (called from `/api/refresh`) |
| Refresh + secret validation | Route `/api/refresh` |
| Store latest news | Upstash Redis via Vercel Marketplace (key `news:latest`) |
| Serve news as JSON (auxiliary) | Route `/api/latest` (reads KV; not used by the page) |
| Render the page | Server component (`app/page.tsx`) reading KV directly via `lib/kv.ts` |
| Host the live site | Vercel |
| Version control & auto-deploy | GitHub → Vercel |
| Secrets / API keys | `.env.local` + Vercel env vars (incl. `CRON_SECRET`) |

### Data contract

The value at the Redis key `news:latest` is a single JSON object written by `/api/refresh`. The page (`app/page.tsx`) reads it directly from KV server-side via `lib/kv.ts`; `/api/latest` returns the same object as-is for any programmatic consumer. Future per-day archive keys (e.g. `news:2026-05-20`) would use the same shape.

```ts
type NewsEntry = {
  date: NewsDate;
  news: NewsBody;
  sources: NewsSource[];
};

type NewsDate = {
  date: string;            // ISO date, e.g. "2026-05-21" (frontend formats it in the user's local TZ)
};

type NewsBody = {
  imageUrl?: string;       // one of the images parsed from the sources, optional
  headline: string;        // the main news title
  dek: string;             // one-sentence summary under the headline
  generatedAt: string;     // timestamp of the refresh run
};

type NewsSource = {
  title: string;           // article title as the source published it
  outlet: string;          // e.g. "New York Times", "BBC"
  url: string;
};
```

### News sources list

Tavily crawls the following outlets. The list is intentionally broad (geographically and politically) and biased toward sites without hard paywalls so the crawler can actually read article bodies.

1. BBC News — `bbc.com/news`
2. Reuters — `reuters.com`
3. Associated Press — `apnews.com`
4. The Guardian — `theguardian.com`
5. New York Times — `nytimes.com` _(soft paywall)_
6. Al Jazeera English — `aljazeera.com`
7. Bloomberg — `bloomberg.com/uk`
8. The Wall Street Journal — `wsj.com` _(hard paywall, may yield headlines only)_

### LLM prompt sketch

**System prompt** You are a wire-service editor. Given the articles below, identify the single most important story of the day and write one headline (≤12 words) and one dek (≤30 words, one sentence). Use only facts present in the provided articles — do not infer, speculate, or add context not in the sources. If sources disagree on a fact, omit it. Paraphrase rather than quote — no verbatim passages over ~15 words from any single source. Pick a tone that is calm and neutral (Reuters/AP style), not opinionated. Choose between 3 and 6 sources for the `sources` array, preferring ones that independently confirm the story. If a usable image URL appears in the source articles, include it as `imageUrl`. Return a JSON object matching the `NewsEntry` schema — nothing else, no prose around it.

**User prompt** Each Tavily article is passed as `{ outlet, title, url, publishedAt, body }` in a JSON array. Today's date (ISO, e.g. "2026-05-21") is provided alongside as a string.

**Failure modes.** If fewer than 3 articles are returned by Tavily, the refresh aborts and KV is not overwritten. If the LLM returns invalid JSON or fewer than 3 sources, the refresh aborts. The previous `news:latest` stays in place until the next successful run.

### Observability

- **Logs.** `/api/refresh` logs are visible in the Vercel dashboard (Project → Logs). Every run logs: start, Tavily query count + status, Nebius model + status, KV write status, total duration. Errors log with stack.
- **Stale warning on the page.** The `NewsEntry` includes `generatedAt`. The page shows it as "Generated at …" in the meta line under the dek; if it's older than 210 minutes (3h cycle + 30 min slack), that line also shows a "last updated X minutes ago" notice (styled per `DESIGN.md`).

## Open questions

- **Tavily query budget.** Free tier has a monthly quota — at 8 refreshes/day × 8 sources = 64 queries/day, ~1900/month. Need to verify this fits before going live. (Still open — operational check, not yet live.)

## Implementation plan

Executed as 7 small coding PRs, one no-code provisioning step (Step 2), and one design/docs step (Step 6), each merged to `main` independently so every PR gets its own Vercel preview deploy. Each PR is reviewable in under 15 minutes.

Smoke-testing each external tool (Tavily, Nebius, Upstash Redis, Vercel Cron) is done **locally before the step that uses it**, with throwaway scripts that are never committed.

Decisions deferred until the step that needs them:
- Specific Nebius model — Step 5.
- Cold-start UI copy — Step 6 (Design).
- Duplicate-headline policy — Step 9 (default: overwrite-always).

---

### Step 1 — Next.js scaffold + repo hygiene

**Goal:** A deployable empty Next.js app, linked to a Vercel project, with stubbed API routes and a preview that builds green. External services are not provisioned yet — they land in Step 2.

**Changes:**
- `npx create-next-app@latest .` (TypeScript, Tailwind v4, App Router, ESLint).
- `tsconfig.json`: `strict: true`, add `noUncheckedIndexedAccess: true`.
- Replace the default `app/page.tsx` with a minimal placeholder: black text on white, "The News of the Day — coming soon" in Plantin (Georgia fallback).
- Stub routes returning `501 { error: 'not implemented' }`:
  - `app/api/refresh/route.ts`
  - `app/api/latest/route.ts`
- `README.md`: one paragraph + links to RFC, DESIGN, CLAUDE.
- Link the Vercel project to the GitHub repo (Hobby plan, deploy-on-push to `main`).

**Verification:**
- `npm run dev` → `localhost:3000` renders the placeholder.
- `curl localhost:3000/api/latest` returns 501.
- `npm run build` succeeds with no type errors.
- Vercel preview URL renders the placeholder.

---

### Step 1 cleanup — remove scaffold cruft

**Goal:** Drop files left over from `create-next-app` and the initial scaffold that aren't referenced anywhere or wired into the build, so the repo only carries what's actually used.

**Changes:**
- Delete `AGENTS.md` — project uses `CLAUDE.md` for agent context.
- Delete unreferenced `create-next-app` demo SVGs in `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).
- Delete `app/favicon.ico` (Next default) — real favicon lands in Step 8.
- Delete `.prettierrc` and `.prettierignore` — Prettier isn't installed or referenced by any npm script, so they were dormant.

**Verification:**
- `npm run build` still clean.
- Placeholder home and 501 stubs still serve as expected.

---

### Step 2 — Pre-PR setup (provision external services, no code)

Dashboard and password-manager work only — no commits, no branch.

**Steps:**
1. **Upstash Redis** via Vercel Marketplace → Storage → Connect Database (free tier). Auto-wires `KV_REST_API_URL`, `KV_REST_API_TOKEN` (plus a few extras we ignore) to Production + Preview env vars.
2. **Tavily** account + API key.
3. **Nebius** account + API key. Model choice deferred to Step 5.
4. `CRON_SECRET` = `openssl rand -hex 32`.
5. Add three remaining vars on the Vercel project, Production + Preview, Sensitive ON: `TAVILY_API_KEY`, `NEBIUS_API_KEY`, `CRON_SECRET`.
6. Local `.env.local` with all five values (gitignored). `.gitignore` updated to ignore `.env.local` explicitly.
7. Save all five values in a password manager.

**Verification:**
- Vercel env vars page lists all five with Production + Preview scope.
- Locally: `node --env-file=.env.local -e "['TAVILY_API_KEY','NEBIUS_API_KEY','KV_REST_API_URL','KV_REST_API_TOKEN','CRON_SECRET'].forEach(k => console.log(k, process.env[k] ? 'set' : 'MISSING'))"` confirms all five.

---

### Step 3 — Shared types, Redis adapter, `/api/latest`

**Smoke test first (local, throwaway, not committed):** tiny `scripts/kv-ping.ts` using `@upstash/redis` to `set` then `get` against `news:test`. Confirm the round-trip. Delete before opening the PR.

**Goal:** A working `/api/latest` route that reads `news:latest` from Upstash Redis and returns it as JSON.

**Changes:**
- `npm install @upstash/redis`.
- `lib/types.ts` — exports `NewsEntry`, `NewsDate`, `NewsBody`, `NewsSource` per the data contract above. `NewsBody.imageUrl` optional.
- `lib/env.ts` — typed accessor `requireEnv(name)` that throws on missing env at module init.
- `lib/kv.ts` — `getLatestNews(): Promise<NewsEntry | null>` and `setLatestNews(entry)`. Uses `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Key constant `NEWS_LATEST_KEY = 'news:latest'`.
- `app/api/latest/route.ts` — `GET` handler:
  - 200 + `NewsEntry` JSON if Redis has a value.
  - 200 + `{ entry: null }` if empty (cold start).
  - 500 on Redis errors (logged with stack).
  - `export const dynamic = 'force-dynamic'`.

**Verification:**
- Empty Redis: `curl <preview>/api/latest` → `{ "entry": null }`.
- After seeding a hand-crafted `NewsEntry` to `news:latest`: `curl <preview>/api/latest` returns that entry exactly.
- `npm run build` clean.

---

### Step 4 — Tavily crawl module (lib only, no wiring yet)

**Smoke test first:** `scripts/tavily-ping.ts` — one `/search` call against `bbc.com/news`, log article count + first title. Confirm key + plan work. Delete after.

**Goal:** A reusable `crawlSources()` that returns normalized articles. Not wired into `/api/refresh` yet — that's Step 5.

**Changes:**
- No SDK — use the global `fetch` against Tavily's `/search` (decided after smoke-test; see [Tavily access via direct `fetch`](#tavily-access-via-direct-fetch-not-tavilysdk-step-4)).
- `lib/tavily.ts`:
  - Constant `SOURCES` — the 8 outlets from [News sources list](#news-sources-list).
  - `type TavilyArticle = { outlet, title, url, publishedAt?, body, imageUrl? }`.
  - `crawlSources(): Promise<TavilyArticle[]>` — fires one query per outlet in parallel, normalizes results, filters out entries with empty `body`. No retries in v1.
  - Throws if every source errors.
- Temporary debug route `app/api/_debug/tavily/route.ts` calling `crawlSources()` and returning `{ count, sample }`. Guarded by `CRON_SECRET` header. Deleted in Step 5.

**Verification:**
- `curl -H "x-cron-secret: $CRON_SECRET" <preview>/api/_debug/tavily` returns `count >= 3` and a sane sample.
- `npm run build` clean.

---

### Step 5 — `/api/refresh` happy path (Tavily + Nebius + Redis)

**Decide before opening this PR:** which Nebius model. Smoke-test 1–2 candidates with `scripts/nebius-ping.ts` (uncommitted) against a small fixture set; check JSON-mode quality + latency. Record the choice in `CLAUDE.md`.

**Goal:** `POST /api/refresh` (still secret-guarded but manually triggered — cron lands in Step 8) crawls, synthesizes, writes Redis, returns the new `NewsEntry`.

**Changes:**
- No SDK — call the Nebius REST endpoint directly with the global `fetch` (Nebius is OpenAI-API-compatible, but a single chat-completions POST doesn't need a client library). See [Nebius via direct `fetch`](#nebius-via-direct-fetch-step-5b).
- `lib/nebius.ts`:
  - `synthesizeNews(articles, todayIso): Promise<NewsEntry>`.
  - System prompt per [LLM prompt sketch](#llm-prompt-sketch). Encodes wire-service tone, ≤12-word headline, ≤30-word dek, paraphrase-not-quote rule, 3–6 sources, JSON output matching `NewsEntry`.
  - Request `response_format: { type: 'json_object' }`.
  - Validate response shape. Throw on invalid JSON, missing required fields, or `sources.length < 3`.
- `app/api/refresh/route.ts` — replace the 501 stub:
  - `POST` handler. Reject if `x-cron-secret` header ≠ `CRON_SECRET` → 401.
  - Pipeline with logged stages: start → crawl (log count) → synthesize (log model + duration) → Redis write → return `NewsEntry`. Total duration at end.
  - On any of [<3 articles, LLM error, invalid JSON, <3 sources]: log, **do not overwrite Redis**, return 503.
- Delete the debug route from Step 4.
- `export const runtime = 'nodejs'`, `export const maxDuration = 60`.

**Verification:**
- `curl -X POST -H "x-cron-secret: $CRON_SECRET" <preview>/api/refresh` returns a `NewsEntry` within ~30s.
- Immediately after: `curl <preview>/api/latest` returns the same entry.
- Vercel function logs show staged log lines.
- Missing header → 401.

---

### Step 6 — Design

**Goal:** Lock the page structure and the DESIGN-rule mapping in `DESIGN.md` *before* building, so the frontend step is mechanical. Docs only — no code, no data-contract change.

We don't have a finished comp — only the style rules in `DESIGN.md` and a structure reference. The screenshot is the source of truth for what's visible.

**Decided** (recorded in `DESIGN.md` → Page Structure (v1) + Typography, which are the source of truth):
- Single-story layout, top → bottom: masthead wordmark → date block → lead image card → headline → dek → meta line → `SOURCES` → source list → footer.
- **Georgia** as the serif. **Helvetica Neue** (Arial fallback) as the sans.
- **Dek** set in Helvetica Neue (sans), not the serif.
- The reference's byline slot under the dek is **reused** as a **meta line** showing **"Generated at {generatedAt}"**, which also carries the stale notice when the entry is old.
- **Image credit** kept as a **TBD** placeholder (no field in the contract — rendered around, not faked).
- **Sources** rendered as **"By {outlet}"** with the outlet linked (the contract has no author names).
- **Stale notice** styled per `DESIGN.md` (Editorial Yellow accent).
- **Cold-start copy** confirmed: centered "First refresh pending — check back shortly" in Georgia, no image, no sources.
- `DESIGN.md` trimmed to only the tokens/components this single-page app uses.

**Verification:**
- `DESIGN.md` reads coherently; Page Structure (v1), the element→`NewsEntry` mapping, and the typography map are present and match the screenshot.
- No dangling references to pruned tokens/components.

---

### Step 7 — Frontend rendering

Cold-start copy was decided in Step 6: centered "First refresh pending — check back shortly" in Georgia, no image, no sources block.

**Goal:** The single page matches `DESIGN.md` → Page Structure (v1) and reads KV server-side via `lib/kv.ts` (the browser never touches KV directly).

**Changes:**
- Tailwind v4 theme tokens — copy the `@theme` block from `DESIGN.md` into `app/globals.css`.
- Fonts: Georgia (serif) and Helvetica Neue (Arial fallback) via CSS font stacks — both are system/fallback faces, so no `next/font` or webfont loading is needed.
- `app/page.tsx` (server component): read the latest entry at request time (`dynamic = 'force-dynamic'`) and render the structure from `DESIGN.md`:
  - **Masthead** — centered "The News of the Day" wordmark (Georgia); hairline rule below.
  - **Date block** — hairline, centered date `<h1>` (Georgia) formatted client-side from `entry.date.date` via `Intl.DateTimeFormat` in the user's TZ, hairline.
  - **Image** (optional) — `entry.news.imageUrl` inside a content card (8px radius, 16px padding); bottom-right credit overlay is TBD. Not a link. Skip the block if absent.
  - **Headline** — Georgia 700, 40px display, tracking −0.8px.
  - **Dek** — Helvetica Neue, ~18–20px.
  - **Meta line** — Helvetica Neue caption: "Generated at {generatedAt}"; when `generatedAt` is older than 210 min, also render the stale notice "last updated X minutes ago" (computed client-side, styled per `DESIGN.md`).
  - **Sources list** — hairline-separated rows: source title (Georgia) linked to `url`, then "By {outlet}" with the outlet linked, `target=_blank rel=noopener`.
  - **Footer** — Helvetica Neue caption: "© {year} The News of the Day".
- Cold-start path: render the centered Georgia message only; no image, no sources.
- Max width 1296px; narrow reading column (~640px) centered. Single-column always.

**Verification:**
- With Redis populated: page matches `DESIGN.md` → Page Structure (v1) — masthead, date block, meta line, "By {outlet}" sources, Georgia headlines.
- Clear Redis: page shows cold-start copy.
- Back-date `generatedAt` past 210 min: stale notice appears in the meta line.
- Lighthouse mobile + desktop pass on Performance + Accessibility.
- Visual sanity check against the curated WSJ reference + screenshot.

---

### Step 8 — Cron schedule + secret hardening

**Smoke test first:** before opening this PR, deploy a one-off no-op cron via a temporary `vercel.json` hitting a logging-only endpoint on a tight schedule (e.g. `*/10 * * * *` for an hour). Confirm Vercel Cron actually fires in your account/region. Roll it back before opening the PR.

**Goal:** Vercel Cron triggers `/api/refresh` every 3 hours; secret validation uses the same code path as Step 5.

**Changes:**
- `vercel.json`:
  ```json
  {
    "crons": [
      { "path": "/api/refresh", "schedule": "0 */3 * * *" }
    ]
  }
  ```
- Adjust `app/api/refresh/route.ts`:
  - Accept either `GET` (cron) or `POST` (manual).
  - Validate via `Authorization: Bearer ...` header against `CRON_SECRET`. Optionally keep `x-cron-secret` for manual-curl ergonomics.
- Document the manual trigger in `README.md`.

**Verification:**
- After merge, wait for the next `0 */3` slot or trigger manually from the Vercel dashboard. Function logs show the run; Redis updates; page reflects new content.
- Unauthorized GET → 401.

---

### Step 9 — Edge states + polish

**Decide before opening this PR:** duplicate-headline handling. Default: overwrite-always.

**Goal:** All RFC edge states are verified; basic SEO/social meta is set.

**Changes — edge states:**
- **Stale notice.** Built in Step 7 (meta line under the dek). Here, just verify it appears when `generatedAt` is older than 210 min and reads "last updated {N} minutes ago".
- **Cold-start UI** — confirm the cold-start copy (decided in Step 6) renders correctly.
- **Refresh failure path** — already returns 503 from Step 5; verify the page still serves the previous good entry after a failed refresh (no frontend change needed if Step 5 is correct).
- **Duplicate-headline policy** applied per decision above.

**Changes — polish:**
- `app/favicon.ico` — black square or simple monogram.
- `app/layout.tsx` metadata: `title: 'The News of the Day'`, `description: 'One LLM-synthesized story, refreshed every 3 hours.'`.
- `public/og.png` — 1200×630, title in Georgia on white.
- `public/robots.txt` permitting indexing.
- Final pass on `CLAUDE.md` "Still open" section — convert resolved items to decisions.

**Verification:**
- Back-date `generatedAt` to 4 hours ago in Redis → stale notice appears in the meta line.
- Lighthouse SEO ≥ 95.
- Share the URL in a chat that unfurls OG → image renders.
- `/favicon.ico` and `/robots.txt` both 200.

---

## Design decisions

Decisions made during execution that the original RFC didn't lock down. Recorded here so future readers (and future-me) can see *why* the code looks the way it does.

### Tavily access via direct `fetch`, not `@tavily/sdk` *(Step 4)*

Tavily's `/search` is a single POST returning clean JSON. An SDK would have added a few hundred npm packages for ergonomic gain we don't need. `lib/tavily.ts` uses Node's global `fetch` directly.

### Nebius via direct `fetch` *(Step 5b)*

Same reasoning as Tavily. Synthesis is a single chat-completions POST to `https://api.studio.nebius.com/v1/chat/completions` with `response_format: { type: 'json_object' }`. Nebius is OpenAI-API-compatible, so the `openai` SDK would work — but the one call we make doesn't justify the dependency. `lib/nebius.ts` uses the global `fetch` directly; there's no `openai` package in `package.json`.

### Per-result images, not response-level *(Step 4)*

Tavily's `/search` response includes `images` at two levels: an aggregated response-level array and a per-result `images` array on each article. We use the per-result one so `TavilyArticle.imageUrl` belongs to *that specific article* — important when the LLM picks one to display alongside the headline it chose.

### Debug route under `/api/debug/`, not `/api/_debug/` *(Step 4)*

The RFC originally proposed `/api/_debug/tavily`. Folders prefixed with `_` are **private** in Next.js App Router and aren't routed — the path 404s. We used `/api/debug/tavily` instead (still secret-guarded, still temporary, deleted in Step 5a).

### Step 5 split into 5a (stub) + 5b (real synthesis) *(Step 5a)*

The original Step 5 wired Tavily + Nebius + KV in one PR. We split it:
- **5a** proves the non-LLM half end-to-end (auth, route, KV write, type contract) with a stub `synthesizeNews()` that fakes a `NewsEntry` from the first crawled article.
- **5b** replaces the stub with the real Nebius call.

Smaller diffs, easier to bisect when something breaks, and the Step 7 frontend can be built against a real (if dumb) KV entry instead of a hand-seeded one.

### Server-overridden `date.date` and `news.generatedAt` *(Step 5a/5b)*

The LLM has no reliable clock or calendar. The server passes today's ISO date in as a string and unconditionally overwrites both fields after parsing the LLM response. Avoids a class of "the entry says 2026-05-27 but was generated 2026-05-28" bugs.

### Crawler shape — per-outlet `/search`, not homepage `/extract` *(Step 5b)*

When tightening crawler input for the LLM, we considered two ways to collect material:

| | Tavily `/search` per outlet | Tavily `/extract` on each outlet's homepage |
|---|---|---|
| **What we get** | ~10 ranked recent (≤24h) news articles per outlet × 8 outlets ≈ 80 article entries with title + short snippet | 8 full homepage text extractions, including nav, sidebar, evergreen links |
| **Token cost to LLM** | ~80 × ~550 chars ≈ 44 KB ≈ **~11K tokens** | 8 × ~40 KB plain-text page ≈ 320 KB ≈ **~80K tokens** |
| **Recency** | Tavily filters last 24h server-side | Whatever's on the homepage now (often includes archived/evergreen content) |
| **Ranking** | Tavily ranks by relevance to "top news today" | Whatever order the page renders, mixed with ads + nav |
| **Robustness** | One API surface; Tavily handles per-outlet quirks | Each outlet has different HTML; per-outlet parsers brittle to redesigns |

We picked `/search` per outlet with `max_results: 10`. "More content" via homepage extraction would have been mostly noise — and noise hurts synthesis quality because the LLM can't tell which entries are today's actual stories vs. evergreen sidebar content.

### Snippet, not raw_content *(Step 5b)*

Related decision: we **drop `include_raw_content`** from the Tavily request and feed the LLM Tavily's `content` field (a short snippet, ~200 chars of actual lede text) instead of full article bodies. Full bodies are dominated by page chrome ("[Skip to content]", "[Watch Live]", nav, footers) that the LLM has to wade through before reaching real content. Titles + snippets are a tighter signal at lower token cost.

### Strict URL validation against the crawled set *(Step 5b)*

After parsing the LLM response, every `source.url` (and `news.imageUrl` if present) is checked against the URLs returned by `crawlSources()`. Any URL not in that set throws → 503 → KV unchanged. LLMs occasionally invent plausible URLs; we'd rather skip a refresh than ship broken links.

### Model configurability via `NEBIUS_MODEL` env var *(Step 5b)*

The Nebius model ID is read from an env var `NEBIUS_MODEL` with a code default of `Qwen/Qwen3.5-397B-A17B-fast`. This lets us swap models without redeploying code, and means there's no smoke-test step in the PR — pick a default, ship, change later if needed.

**To change the model:**

- **Local development** — add `NEBIUS_MODEL=<model-id>` to `.env.local`, restart the dev server.
- **Production / Preview on Vercel** — Project → Settings → Environment Variables → Add New. Key `NEBIUS_MODEL`, value `<model-id>`, tick Production + Preview. New deployments pick it up automatically; redeploy the current production deployment to apply it immediately.
- **Code default** — change `DEFAULT_MODEL` in `lib/nebius.ts`. Applies wherever the env var isn't set.

Available model IDs: <https://tokenfactory.nebius.com/models>.

---

## End-to-end verification (after Step 9)

The project is "done" when:
- The Vercel production URL renders a real (cron-generated) news entry, not a fixture.
- Vercel dashboard shows ≥3 successive cron runs at `0 */3` UTC with 200 responses.
- Triggering `/api/refresh` manually with the bearer header overwrites Redis, and the page reflects the new entry within one reload.
- A simulated failure (e.g. temporarily revoking the Tavily key and hitting refresh) returns 503 and the page still serves the previous good entry.
- Stale warning appears when `generatedAt` is back-dated past 210 min.
- The RFC's success criteria (live URL, ≥3 sources per visit, stale warning works, 7 consecutive cron days) are all met.
