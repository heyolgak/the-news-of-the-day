# The News of the Day

The News of the Day is a one-page website that surfaces a single, LLM-synthesized "news of the day" with links to the sources it was built from, refreshed every 6 hours.

**Live:** [the-news-of-the-day.vercel.app](https://the-news-of-the-day.vercel.app/)

<p align="center">
  <img src="screenshots/screenshot-headline-1.png" alt="The headline and image view" width="320">
  &nbsp;&nbsp;
  <img src="screenshots/screenshot-sources-2.png" alt="The sources list view" width="320">
</p>

## Problem & goal

Following the daily news through dozens of outlets is noisy and time-consuming, yet most days have one story that actually matters. 

The goal is a calm, glanceable replacement for doomscrolling a feed — open the page, get one well-sourced story, close the tab.

A secondary goal is hands-on practice with Vercel, Tavily, Nebius, and Upstash Redis.

## Architecture (at a glance)

**Next.js** (App Router, TypeScript + Tailwind) on **Vercel** for the read side.

Every 6h a scheduled **GitHub Actions** workflow runs the refresh pipeline 
→ **Tavily** (crawl 8 sources)
→ **Nebius** (LLM synthesis)
→ **Headline resolution** (re-read each reachable source's `og:title` so titles match the live headline, not Tavily's SEO `<title>`) 
→ **Upstash Redis** (`news:latest`). The Vercel page reads Redis server-side and renders it. `/api/refresh` is a manual/backup trigger running the same pipeline.

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

## Refresh

The refresh runs automatically every 6h via GitHub Actions (`.github/workflows/refresh.yml`). To run it on demand:

- **GitHub** — Actions tab → **Refresh news** → **Run workflow** (`workflow_dispatch`).
- **Locally** — `npm run refresh:local` (runs `scripts/refresh.ts` against the keys in `.env.local`; writes the live `news:latest`).
- **Backup HTTP route** — `curl -X POST https://<deployment>/api/refresh -H "Authorization: Bearer $CRON_SECRET"`.

Every run records its outcome to the `news:lastRun` key; a failed scheduled run also turns the GitHub Actions job red.

## Disclaimer

A personal, educational project. Not affiliated with or endorsed by any of the news outlets it draws from; every story links back to its original sources.

## License

MIT — see [LICENSE](LICENSE).
