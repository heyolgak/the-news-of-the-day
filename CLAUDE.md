# CLAUDE.md — The News of the Day

Context for future Claude sessions working on this repo. Full spec lives in [RFC.md](RFC.md); this file calls out the working conventions and decisions that aren't obvious from the code.

## What this is

A one-page website that shows a single LLM-synthesized "news of the day" with the sources it was built from, refreshed every 6 hours. Personal project, partly a vehicle for learning GitHub Actions scheduling, Tavily, Nebius, and Upstash Redis (via Vercel Marketplace).

## Architecture (at a glance)

- **Next.js** (TypeScript + Tailwind, App Router) deployed on **Vercel** — but Vercel hosts only the **read side** (the page + `/api/latest`).
- **The refresh is offloaded to GitHub Actions.** A scheduled workflow (`.github/workflows/refresh.yml`, every 6h) runs `scripts/refresh.ts` → `lib/refresh.ts#runRefresh()` → **Tavily** (crawl 8 sources) → **Nebius** (LLM synthesis) → **Upstash Redis** (key `news:latest`). This sidesteps the Vercel-Hobby walls (daily-only cron + 60s function ceiling) entirely — synthesis with the default reasoning model measured ~85s (a non-reasoning model like Kimi ~27s), so it never fit the 60s ceiling regardless of the cron tier.
- **`/api/refresh`** runs the same `runRefresh()` pipeline but is now a **manual/backup** trigger only (Bearer-auth, `maxDuration = 60`); it's no longer the scheduled path.
- The page (`app/page.tsx`) is a **server component** that reads KV directly via `lib/kv.ts` (`getLatestNews()`) — it does **not** call `/api/latest`.
- **`/api/latest`** is an auxiliary public JSON endpoint that also reads KV; it's not consumed by the page.
- Browser never touches KV directly (all KV reads happen server-side).
- **Dead-man's-switch:** every run records its outcome to `news:lastRun` (`{ at, status, error? }`); a failing scheduled run also exits non-zero → the GitHub Actions job goes red.

Sequence diagram is in `RFC.md` → Proposed solution.

## Data contract

The value at the Upstash Redis key `news:latest` is a `NewsEntry`:

```ts
type NewsEntry = {
  date: NewsDate;        // ISO date string, formatted client-side in user's TZ
  news: NewsBody;        // imageUrl?, headline, dek, generatedAt
  sources: NewsSource[]; // title, outlet, url
};
```

Type naming convention: all data types use the `News*` prefix.

## Conventions and preferences

- **Terminology.** Use **"dek"** (journalism term) for the line under the headline — never "subhead". Don't call the image "hero image"; just "image".
- **Date.** Stored as ISO; the frontend formats it in the user's local TZ via `Intl.DateTimeFormat`. The display string is never stored server-side.
- **Stale warning.** If `generatedAt` is older than 390 min (6h cadence + 30 min slack), the page shows a red "last updated X minutes ago" line under the dek. (`STALE_THRESHOLD_MIN` in `app/MetaLine.tsx`.)
- **Refresh cadence.** Every 6 hours, via GitHub Actions (`0 */6 * * *`). 6h — not 3h — because at 8 sources × 4 runs/day the Tavily free tier (~1,000 searches/mo) comfortably fits (~960/mo); 3h would be ~1,920/mo and overrun it.
- **Image selection.** The LLM picks `imageUrl` inline from the Tavily-returned article images. No separate image-selection step.
- **LLM rules** (encoded in the prompt): wire-service editor tone, ≤12-word headline, ≤30-word dek, paraphrase don't quote (no verbatim passages >~15 words), 3–6 sources, JSON output matching `NewsEntry`. Abort the refresh if Tavily returns <3 articles or the LLM returns invalid JSON — keep the previous `news:latest`.

## Configuration

- **`NEBIUS_MODEL`** (optional env var) — Nebius model ID used for synthesis. Default in code: `Qwen/Qwen3.5-397B-A17B-fast` (a reasoning model — viable since the refresh runs off the 60s Vercel ceiling). Override in `.env.local` (local), the GitHub Actions secrets (scheduled refresh), or Vercel → Settings → Environment Variables (the manual/backup route). Available IDs: <https://tokenfactory.nebius.com/models>.
- **Secrets live in two places.** The scheduled refresh reads `TAVILY_API_KEY`, `NEBIUS_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (+ optional `NEBIUS_MODEL`) from **GitHub Actions secrets**; the Vercel app reads the same KV vars (+ `CRON_SECRET` for the backup route) from **Vercel env vars**.

## Out of scope (v1)

No user accounts, no archive page, no comments, no multi-story feed, no mobile app, no real-time push, no human-in-the-loop editorial step.

## Known limitations

- **Source title drift.** `source.title`/`outlet` are snapshotted from our own crawl by URL (the model only picks URLs), so they can't mismatch *our* data — but if an outlet re-headlines the article at that live URL after we crawl it, the stored title goes stale. Fixing that would need a display-time re-fetch (out of scope).
- **Occasional non-JSON from the model.** The synthesis model has been observed returning non-JSON; the pipeline aborts that run and keeps the previous `news:latest` (per the LLM-rules above). We deliberately did **not** add JSON-parse hardening or a parse-level re-call — an aborted run is acceptable at a 6h cadence.

## Repo / paths

- Local: `~/Desktop/Vibecoding/the-news-of-the-day/`
- Sibling design mockups: `~/Desktop/Vibecoding/the-news-of-the-day-screens/` (the `news-app-tools.md` there is the original tooling brief)
- GitHub: `heyolgak/the-news-of-the-day` (public)

## Capacity note

**Tavily quota.** The plan limit is **confirmed at 1,000 searches/mo**, so the 6h cadence (8 sources × 4 runs/day ≈ 960/mo) is the ceiling — 3h (~1,920/mo) would overrun it. If the plan ever changes, adjust the cron interval in `.github/workflows/refresh.yml` and `STALE_THRESHOLD_MIN` in `app/MetaLine.tsx` together.

## Working style

- This RFC was built section-by-section with the user confirming each section before it was written. Apply the same approach for future docs/specs — propose first, write after sign-off.
