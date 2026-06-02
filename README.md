# The News of the Day

The News of the Day is a one-page website that surfaces a single, LLM-synthesized "news of the day" with links to the sources it was built from, refreshed every 3 hours.

## Problem & goal

Following the daily news through dozens of outlets is noisy and time-consuming, yet most days have one story that actually matters. 

The goal is a calm, glanceable replacement for doomscrolling a feed — open the page, get one well-sourced story, close the tab.

A secondary goal is hands-on practice with Vercel Cron, Tavily, Nebius, and Upstash Redis.

## Architecture (at a glance)

- **Next.js** (TypeScript + Tailwind, App Router) deployed on **Vercel**.
- **Vercel Cron** (every 3 hours, `0 */3 * * *`) → `/api/refresh` (secret-validated) → **Tavily** (crawl 8 sources) → **Nebius** (LLM synthesis) → **Upstash Redis** (key `news:latest`).
- The page is a server component that reads Redis directly; **`/api/latest`** is an auxiliary JSON endpoint exposing the same data.
- Browser never touches Redis directly.

## Docs

- [RFC.md](RFC.md) — problem, scope, data contract, prompt
- [DESIGN.md](DESIGN.md) — visual system

## Local dev

```bash
npm install
npm run dev
```

Create a `.env.local` with the required secrets before running — see [RFC.md](RFC.md) → Step 2 for the authoritative list of env vars.

Open [http://localhost:3000](http://localhost:3000).

## Disclaimer

A personal, educational project. Not affiliated with or endorsed by any of the news outlets it draws from; every story links back to its original sources.

## License

MIT — see [LICENSE](LICENSE).
