# CLAUDE.md — The News of the Day

Context for future Claude sessions working on this repo. Full spec lives in [RFC.md](RFC.md); this file calls out the working conventions and decisions that aren't obvious from the code.

## What this is

A one-page website that shows a single LLM-synthesized "news of the day" with the sources it was built from, refreshed every 3 hours. Personal project, partly a vehicle for learning Vercel Cron, Tavily, Nebius, and Upstash Redis (via Vercel Marketplace).

## Architecture (at a glance)

- **Next.js** (TypeScript + Tailwind, App Router) deployed on **Vercel**.
- **Vercel Cron** (every 3 hours, `0 */3 * * *`) → `/api/refresh` (secret-validated) → **Tavily** (crawl 8 sources) → **Nebius** (LLM synthesis) → **Upstash Redis** (key `news:latest`).
- The page (`app/page.tsx`) is a **server component** that reads KV directly via `lib/kv.ts` (`getLatestNews()`) — it does **not** call `/api/latest`.
- **`/api/latest`** is an auxiliary public JSON endpoint that also reads KV; it's not consumed by the page.
- Browser never touches KV directly (all KV reads happen server-side).

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
- **Stale warning.** If `generatedAt` is older than 210 min, the page shows a red "last updated X minutes ago" line under the dek.
- **Refresh cadence.** Every 3 hours, not hourly.
- **Image selection.** The LLM picks `imageUrl` inline from the Tavily-returned article images. No separate image-selection step.
- **LLM rules** (encoded in the prompt): wire-service editor tone, ≤12-word headline, ≤30-word dek, paraphrase don't quote (no verbatim passages >~15 words), 3–6 sources, JSON output matching `NewsEntry`. Abort the refresh if Tavily returns <3 articles or the LLM returns invalid JSON — keep the previous `news:latest`.

## Configuration

- **`NEBIUS_MODEL`** (optional env var) — Nebius model ID used for synthesis. Default in code: `Qwen/Qwen3.5-397B-A17B-fast`. Override in `.env.local` (local) or Vercel → Settings → Environment Variables (Production + Preview) without code changes. Available IDs: <https://tokenfactory.nebius.com/models>.

## Out of scope (v1)

No user accounts, no archive page, no comments, no multi-story feed, no mobile app, no real-time push, no human-in-the-loop editorial step.

## Repo / paths

- Local: `~/Desktop/Vibecoding/the-news-of-the-day/`
- Sibling design mockups: `~/Desktop/Vibecoding/the-news-of-the-day-screens/` (the `news-app-tools.md` there is the original tooling brief)
- GitHub: `heyolgak/the-news-of-the-day` (private)

## Still open

See `RFC.md` → Open questions. The only genuinely open item is **Tavily quota fit** (operational check before going live).

## Working style

- This RFC was built section-by-section with the user confirming each section before it was written. Apply the same approach for future docs/specs — propose first, write after sign-off.
