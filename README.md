# The News of the Day

A one-page website that shows a single LLM-synthesized "news of the day" with the sources it was built from, refreshed every 3 hours. Built on Next.js + Vercel Cron + Tavily + Nebius + Vercel KV.

## Docs

- [RFC.md](RFC.md) — problem, scope, data contract, prompt sketch.
- [DESIGN.md](DESIGN.md) — visual system (Monocle/WSJ-style typography + tokens).
- [CLAUDE.md](CLAUDE.md) — conventions and decisions for future Claude sessions.

## Local dev

```bash
cp .env.example .env.local   # then fill in real values
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
