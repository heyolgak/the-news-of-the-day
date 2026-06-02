# The News of the Day

A one-page website that shows a single LLM-synthesized "news of the day" with the sources it was built from, refreshed every 3 hours. Built on Next.js + Vercel Cron + Tavily + Nebius + Upstash Redis.

## Docs

- [RFC.md](RFC.md) — problem, scope, data contract, prompt sketch.
- [DESIGN.md](DESIGN.md) — visual system (Monocle/WSJ-style typography + tokens).
- [CLAUDE.md](CLAUDE.md) — conventions and decisions for future Claude sessions.

## Local dev

```bash
npm install
npm run dev
```

Create a `.env.local` with the required secrets before running — see [RFC.md](RFC.md) → Step 2 for the authoritative list of env vars.

Open [http://localhost:3000](http://localhost:3000).
