# The News of the Day

The News of the Day is a one-page website that surfaces a single, LLM-synthesized "news of the day" with links to the sources it was built from, refreshed every 3 hours.

## Problem & goal

Following the daily news through dozens of outlets is noisy and time-consuming, yet most days have one story that actually matters. 

The goal is a calm, glanceable replacement for doomscrolling a feed — open the page, get one well-sourced story, close the tab.

A secondary goal is hands-on practice with Vercel Cron, Tavily, Nebius, and Upstash Redis.

## Architecture (at a glance)

**Next.js** (App Router, TypeScript + Tailwind) on **Vercel**.

Every 3h: **Vercel Cron** → `/api/refresh` → **Tavily** (crawl 8 sources) → **Nebius** (LLM synthesis) → **Upstash Redis** (`news:latest`). The page reads Redis server-side and renders it; `/api/latest` serves the same JSON.

Full sequence diagram + data contract: [RFC.md](RFC.md).

## Docs

- [RFC.md](RFC.md) — problem, scope, data contract, prompt
- [DESIGN.md](DESIGN.md) — visual system

## Local dev

```bash
cp .env.example .env.local   # then fill in your API keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Disclaimer

A personal, educational project. Not affiliated with or endorsed by any of the news outlets it draws from; every story links back to its original sources.

## License

MIT — see [LICENSE](LICENSE).
