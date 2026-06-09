# Step 8 — Scheduled refresh (working plan + superseded history)

> **⚠️ SUPERSEDED (2026-06-09) — the Vercel-Cron approach below was abandoned.**
>
> **The reframe.** The plan below was stuck fighting two Vercel-Hobby walls at once:
> **daily-only cron** *and* the **60s function ceiling**. Both forced concessions
> (daily cadence, 26h stale window) and kept **OQ1/OQ4** (latency reliability under
> 60s) live on every run. But neither wall is intrinsic — the refresh is just
> "crawl → synthesize → write one KV key", and `lib/tavily.ts` / `lib/nebius.ts` /
> `lib/kv.ts` are framework-agnostic.
>
> **What shipped instead:** the refresh is **offloaded to a scheduled GitHub Actions
> workflow** (`.github/workflows/refresh.yml`, `0 */6 * * *`) running
> `scripts/refresh.ts` → `lib/refresh.ts#runRefresh()`. This dissolves both walls:
> arbitrary-interval cron (so **6h** cadence, not daily) and a multi-hour runtime
> (so **OQ1/OQ4 are moot** — the reasoning model is fine again, with real retries).
> `/api/refresh` survives as a Bearer-authed **manual/backup** trigger. Stale
> threshold is **390 min** (6h + slack), not 26h. **6h not 3h** because the Tavily
> free tier (~1,000/mo) fits 4 runs/day (~960/mo) but not 8 (~1,920/mo).
>
> Shipped as three stacked PRs: (1) the offload, (2) pipeline-gap fixes — per-call
> fetch timeouts + one transient retry (`lib/fetchWithRetry.ts`), a `news:lastRun`
> dead-man's-switch, and the OQ2 source-title fix (derive title/outlet from the
> crawl by URL), (3) the backup route + 390-min stale + this docs sweep.
>
> The Kimi model swap noted below was **testing-only, never adopted**.
>
> The rest of this file is kept as the **historical record** of the abandoned
> Vercel-Cron approach and the analysis that led to the offload. Its line
> references and "keep-set" no longer reflect `main`.

---

> **Saved 2026-06-04.** A first implementation attempt was made and then
> **fully reverted** — the working tree is clean and `main` is untouched. This
> file is the record to resume from. All original-file line references below are
> valid again (code is back to its pre-attempt state). See
> **Status → Open questions** for what must be settled before writing code again.

## Context

The full refresh pipeline (`/api/refresh` → Tavily → Nebius → Upstash) and the
frontend are done. Today `/api/refresh` only runs when triggered manually and
authenticates via an `x-cron-secret` header on `POST`. Step 8 wires Vercel Cron
to fire it automatically and hardens the secret check to the form Vercel Cron
actually sends (`Authorization: Bearer <CRON_SECRET>` on a `GET`).

**Plan-tier decision:** this account is on Vercel **Hobby**, which only runs
crons at **daily** granularity. The documented "every 3 hours" cadence therefore
cannot be honored on this plan. We ship a **once-daily** schedule now and treat
3h as the *Pro-tier target*. Because content will now routinely be up to 24h old,
the page's stale-warning threshold (210 min) must move to ~26h to stay meaningful.

Since the cadence is a load-bearing fact repeated across every doc, this step
also does a **full documentation sweep** so nothing contradicts the shipped
`vercel.json`.

## Decisions captured (from user)

- **Smoke test:** include it (adapted for the constraints below).
- **Schedule:** once-daily at **`0 18 * * *`** = 19:00 BST (today / summer).
  Two caveats baked into the docs: (a) Vercel cron is **fixed UTC, no DST** — in
  winter (GMT) this fires at 18:00 local, an hour early; (b) on **Hobby, timing
  is best-effort** — the actual fire can land anywhere within ~the scheduled hour,
  not at :00 sharp.
- **Auth:** `Authorization: Bearer <CRON_SECRET>` **only**. Drop `x-cron-secret`
  everywhere (code + TEST.md curls).
- **Stale threshold:** bump 210 min → ~26h (1560 min).
- **Resilience:** in-function transient retry only (no 2nd cron, not going Pro
  now). Baseline non-destructive failure already exists (503 → previous
  `news:latest` kept). See PR 8a "Transient retry" below.
- **Model swap (agreed):** `NEBIUS_MODEL` → **`moonshotai/Kimi-K2.5-fast`**
  (non-reasoning, ~7× faster than the default reasoning model). Latency-driven —
  see Status → OQ1.

---

## Status — first attempt reverted, re-planning (2026-06-04)

PR 8a code was written and partially verified locally, then **reverted** after
two discoveries: a latency problem and a data-integrity issue. The auth/cron/stale
parts were verified working; the latency + source-title issues need deliberate
decisions. **The working tree is now clean** — tomorrow we rebuild the agreed
keep-set from this plan once OQ1/OQ4 are settled.

### Open questions / problems uncovered

- **OQ1 — Refresh latency vs the 60s Hobby ceiling (the big one).** Full refresh
  with the old default `Qwen/Qwen3.5-397B-A17B-fast` (a *reasoning* model) =
  **~85s**, over the ceiling → cron would silently time out on prod regardless of
  Step 8. Swapping to **`Kimi-K2.5-fast`** (non-reasoning) dropped a typical run
  to **~27s** — but across repeated runs we still saw one **abort >45s** and one
  **bad-JSON** failure, both correlated with the variable **65–77 article**
  payload. So the model swap helps but is **not yet proven reliable** under the
  full payload. Whether to *also* reduce input is an **open, deliberate
  decision** (do not trim unilaterally). The cost driver is the model **reading**
  all crawled snippets, not generating output. _Suggested next step: a
  Nebius-only measurement harness (crawl once, synthesize ~10× against the fixed
  payload, time + JSON-validate each) with no live-KV writes._
- **OQ2 — Source title↔URL integrity.** Code validates only `source.url` against
  the crawl set ([lib/nebius.ts:130-131](lib/nebius.ts)); `source.title` is taken
  verbatim from the model's output, with no check it matches the article at that
  URL. Two indistinguishable causes: **(1)** model pairs a valid URL with a
  wrong/paraphrased title; **(2)** live-updated URLs (e.g. Reuters markets wraps)
  get re-headlined after crawl. Fix for (1) below; (2) is inherent to citing live
  URLs (would need display-time re-fetch — out of scope).
- **OQ3 — Occasional non-JSON from Kimi.** Seen once. Whether to add JSON-parse
  hardening (fence-strip / brace-slice) and/or one parse-level re-call is **open**
  (was not agreed; the speculative hardening was reverted).
- **OQ4 — Retry sizing.** Needs a deliberate pass once OQ1 settles. Note: with
  synthesis as the long pole, a Nebius *retry* may not fit 60s even with Kimi →
  likely Nebius = single attempt + timeout, retry Tavily only.
- **OQ5 — Live KV overwritten during debugging.** `.env.local` points at the
  production Upstash, so the manual POST test runs wrote several entries to
  `news:latest`. The current live entry is a test-run result, not a scheduled
  one. (Cannot be un-written; the next refresh replaces it.)

### What to (re)build vs avoid

**Rebuild (agreed Step 8 keep-set):**
- `app/api/refresh/route.ts` — GET+POST, Bearer-only, shared handler,
  `x-cron-secret` removed. (401 paths were verified during the attempt.)
- `vercel.json` — daily `0 18 * * *`.
- `app/MetaLine.tsx` — `STALE_THRESHOLD_MIN` 210 → 1560.
- `.env.local` `NEBIUS_MODEL=moonshotai/Kimi-K2.5-fast` — the agreed swap. **Also
  set on Vercel** (Production + Preview) or prod still runs the slow default.
- `lib/retry.ts` + its wiring — the agreed transient-retry helper. Re-include the
  "don't retry our own timeout abort" behavior; size timeouts under OQ4.

**Avoid (deliberately rejected as scope creep — only reconsider via OQ1/OQ3):**
- Trimming `lib/tavily.ts` `max_results` below 10.
- `extractJsonObject()` JSON-parse hardening in `lib/nebius.ts`.

### Source-titles fix — derive titles, don't generate them (OQ2 cause #1)

**Goal:** `source.title` and `source.outlet` are **looked up from our own crawled
data by URL**, never authored or chosen-as-text by the model.

- **Prompt:** `sources` becomes an array of **chosen URLs only** (3–6), drawn from
  the input articles. Update the example-JSON block in `SYSTEM_PROMPT`
  ([lib/nebius.ts:9-28](lib/nebius.ts)) so the model no longer emits source
  title/outlet.
- **Validation:** replace the `crawledUrls` Set at [lib/nebius.ts:113](lib/nebius.ts)
  with a `Map<url, TavilyArticle>`. `TavilyArticle` already carries `outlet` +
  `title` ([lib/tavily.ts:3-10](lib/tavily.ts)). For each returned URL: reject if
  not in the Map (same hallucination guard), else build
  `NewsSource = { title: article.title, outlet: article.outlet, url }`.
- **Shape unchanged:** `NewsEntry` / `NewsSource` keep the same fields →
  **no frontend change.**
- **Benefits:** eliminates title↔URL mismatch (cause #1), removes a hallucination
  surface, shrinks model output slightly. **Does not fix** cause #2 (live
  re-titling) — note as a known limitation.
- **PR placement:** synthesis-pipeline (Step 5) data-integrity fix, independent of
  cron → **separate PR** (e.g. `8c-source-titles`), not folded into the cron PR.

## Two constraints that reshape the RFC's smoke-test plan

1. **Vercel Cron runs only on Production deployments** — not on preview/branch
   deploys. So you cannot confirm the *scheduler* from a PR preview; any real
   cron-fire check happens against production.
2. **Hobby = daily only** — the RFC's tight `*/10 * * * *` smoke loop is not
   possible.

Net effect: a meaningful smoke test must touch production, and waiting for a
natural daily fire costs up to ~24h. The realistic smoke test (Phase A) is a
throwaway **no-op ping cron** deployed to production, fired immediately via the
dashboard **"Run"** button to confirm *both* that cron is wired and that Bearer
auth passes (200, not 401), then reverted — before pointing cron at the real
pipeline.

---

## PR breakdown

The smoke test (Phase A) is **not a merged PR** — it's a throwaway prod deploy
that gets reverted. The real work is small PRs, matching the repo's established
small-PR style (cf. the `docs-to-code-update`, `readme-update`, `mermaid-update`
PRs):

- **PR 8a — `8a-cron-auth` (code).** `vercel.json` + `app/api/refresh/route.ts`
  (GET+POST, Bearer-only) + `app/MetaLine.tsx` (26h threshold) + new `lib/retry.ts`
  wired into `lib/nebius.ts` & `lib/tavily.ts` (transient retry) + the
  `NEBIUS_MODEL` swap. **Excludes** the rejected trim & JSON-hardening.
- **PR 8b — `8b-docs-cadence` (docs).** The full doc sweep below. Merged right
  after 8a so `main` never sits with docs contradicting the shipped config.
- **PR 8c — `8c-source-titles` (code, independent).** Derive source title/outlet
  from crawled data instead of trusting the model (Source-titles fix / OQ2). No
  hard ordering dependency with 8a/8b.

> Alternative: fold 8b into 8a as a single PR. Recommend the split (smaller,
> reviewable diffs; consistent with repo history). Keep 8c separate.

**Still open before resuming code:** OQ1 (is the model swap enough, or do we also
reduce input?) and OQ4 (final retry sizing). The cron PR shouldn't merge until a
real prod run is proven reliably < 60s.

---

## Phase A — Smoke test (throwaway, touches production briefly)

1. Temporary `app/api/_debug/cron-ping/route.ts` — a `GET` that validates
   `Authorization: Bearer <CRON_SECRET>` (same check the real handler will use),
   `console.log`s a timestamp, returns `{ ok: true }`.
2. Temporary `vercel.json`: `{ "crons": [ { "path": "/api/_debug/cron-ping", "schedule": "0 18 * * *" } ] }`.
3. Deploy to **production**. Dashboard → Project → Cron Jobs → **Run**; confirm
   the function log shows the ping with a **200** (not 401 → proves Bearer auth +
   `CRON_SECRET` env var are wired).
4. Revert: delete the debug route + temporary `vercel.json` before opening 8a.
   (Mirrors how the Step 4 Tavily debug route was disposed of.)

---

## PR 8a — Code

### `app/api/refresh/route.ts`
- Extract the current `POST` body into a shared internal handler so `GET` and
  `POST` share one pipeline.
- Single auth helper: compare `req.headers.get('authorization')` against
  `` `Bearer ${requireEnv('CRON_SECRET')}` `` (helper already in
  [lib/env.ts](lib/env.ts)). Mismatch → `401`, same JSON shape as today.
- Export **both** `GET` (cron) and `POST` (manual); both run the auth check then
  the shared pipeline. **Remove** the `x-cron-secret` branch.
- Keep `runtime` / `maxDuration` / `dynamic` exports unchanged.

### Transient retry (new `lib/retry.ts`, reused by Nebius + Tavily)
A small `fetchWithRetry(url, init, opts)` helper — **one** retry on *transient*
failure only, each attempt wrapped in its own `AbortController` timeout:
- **Retry on:** network/`fetch` rejection (that is NOT our own timeout abort),
  HTTP **5xx**, **429**. Short backoff (~500ms–1s).
- **Do NOT retry:** our own timeout abort (a slow endpoint stays slow → wastes
  budget), 4xx (deterministic), and everything downstream of the fetch (JSON
  parse + hallucination/shape checks) — those fail identically on a retry.
- **Nebius** ([lib/nebius.ts:56](lib/nebius.ts)): route the single `fetch`
  through the helper. Latency-dominant call — **likely single attempt + a
  generous timeout** (see OQ4); a retry may not fit 60s. The non-OK throw at
  [lib/nebius.ts:74](lib/nebius.ts) stays for non-retryable statuses.
- **Tavily** ([lib/tavily.ts:40](lib/tavily.ts), `queryOutlet`): route through
  the helper. `crawlSources` already tolerates partial failure via `allSettled`
  ([lib/tavily.ts:77,94](lib/tavily.ts)); per-outlet retries run in parallel.
- Adds an explicit per-fetch timeout where there is none today.

### `vercel.json` (new, permanent)
```json
{ "crons": [ { "path": "/api/refresh", "schedule": "0 18 * * *" } ] }
```
With `CRON_SECRET` set on the project, Vercel auto-attaches
`Authorization: Bearer <CRON_SECRET>` to the cron GET — no extra config.

### `app/MetaLine.tsx`
- `STALE_THRESHOLD_MIN` `210` → `1560`; update the adjacent doc comment.
- **Copy note (no change now):** the notice reads `last updated {N} minutes ago`;
  under daily cadence a stale entry shows a large minute count. Keeping minutes
  matches RFC wording; converting to hours/days is an optional Step 9 polish.

---

## PR 8b — Documentation sweep

Every place asserting the 3h cadence, the 210-min rule, or `x-cron-secret`:

- **CLAUDE.md** — line 7 & 12 (intro + architecture "every 3 hours / `0 */3`"),
  line 37 (210 min → ~26h), line 38 ("Refresh cadence. Every 3 hours"). Reframe
  as: live schedule is **daily at 18:00 UTC / 19:00 BST on Hobby**; 3h is the Pro target.
- **README.md** — line 3 & 17 ("every 3h"). Add a short **"Manual refresh"**
  subsection after Local dev with the Bearer curl:
  `curl -X POST https://<deployment>/api/refresh -H "Authorization: Bearer $CRON_SECRET"`
  and a line stating the cron runs daily at 18:00 UTC / 19:00 BST (Hobby), 3h on Pro.
- **RFC.md** — update the operative references: cadence lines (5, 18, 32, 71),
  the **Mermaid sequence diagram** (line 45 `Note over C,KV: Refresh every 3 hours`
  → "daily"; optionally tweak line 46 `scheduled GET + secret` → "GET + Bearer
  secret"), success criteria (24, 462, 466 — keep "7 consecutive days" but
  `0 */3` → daily), stale 210-min refs (26, 135, 322, 331, 370, 465 → ~26h),
  layout description (377 "refreshed every 3 hours"), and the **Step 8 section
  itself** (339, 341, 348, 352–354, 358 → daily schedule, Bearer-only, the
  prod-only/Hobby smoke-test reality). **Also:** the open **Tavily quota**
  question (139) is *resolved* by this change — daily × 8 sources ≈ 8 queries/day
  (~240/mo), comfortably within the free tier.
- **TEST.md** — replace the `x-cron-secret` curls (51, 78, 90) with
  `-H "Authorization: Bearer $SECRET"`; add a brief cron-trigger check
  (dashboard "Run" → logs → KV updates); fix the stale step-numbering in the
  header (line 3 says "Step 7 cron" — cron is Step 8).
- **DESIGN.md** — line 89 (210 min → ~26h).
- **.env.example** — add `NEBIUS_MODEL` note if the swap lands; `CRON_SECRET`
  unchanged.

Also refresh `memory/project_progress.md` after the work lands.

---

## Risk to verify (not a code change)

**Hobby 60s function ceiling.** `app/api/refresh/route.ts` sets
`maxDuration = 60`, which is exactly the Hobby cap (Pro allows 300s). The refresh
crawls 8 Tavily sources + runs a Nebius LLM synthesis; if a run exceeds 60s the
cron invocation **times out silently** → KV isn't updated → the page goes stale
(now surfaced only after the 26h warning). Before trusting the cron, confirm a
real production run completes well under 60s (the route logs total duration).
This is **OQ1** — currently unresolved.

## Verification

1. `npm run build` + `npm run lint` clean.
2. Local (`npm run dev`):
   - `POST /api/refresh` no auth → **401**; with `-H "Authorization: Bearer $CRON_SECRET"` → 200 + `NewsEntry`; KV updated; reload shows new content. *(Overwrites live `news:latest`.)*
   - `GET /api/refresh` no auth → **401**; with Bearer → 200.
3. Stale notice: a `generatedAt` older than 26h triggers the yellow line; a fresh
   one does not.
4. Transient retry: stub a 5xx → confirm exactly one retry; confirm a 4xx /
   validation error does **not** retry; confirm a happy run completes well < 60s.
5. Production (after 8a deploy): dashboard → Cron Jobs shows the daily job;
   **Run** it → function log shows a successful refresh, Redis updates, page
   reflects it on reload.

## Out of scope
- FE polishing (deferred to after cron, per user).
- Step 9 (SEO/OG/favicon, duplicate-headline policy, cold-start live test).
- Converting the stale copy from minutes to hours/days (optional Step 9 polish).
- Display-time re-fetch of source titles (OQ2 cause #2).
