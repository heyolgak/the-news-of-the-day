# Manual test guide

How to verify the app locally end-to-end. This file is the canonical manual-test runbook — keep it up to date as the project grows (Step 6 frontend will add browser-based checks; Step 7 cron will add a cron-trigger check).

> Sections marked **(Step X)** are specific to that step. Steps 0–2, 5, 7 are stable across all backend PRs.

Three things to verify on any backend change: (1) the refresh runs and writes a real synthesized story, (2) the data sticks in KV, and (3) the JSON shape matches the contract.

---

## 0. Open a terminal in the project folder

```bash
cd ~/Desktop/Vibecoding/the-news-of-the-day
```

Confirm you're on the branch you intend to test:

```bash
git branch --show-current
```

---

## 1. Start the dev server

```bash
npm run dev
```

Wait for `✓ Ready in …ms` and `Local: http://localhost:3000`. **Leave this terminal running.** Open a second terminal for the curl commands below.

---

## 2. (Optional) Eyeball the current KV state before refresh

In the second terminal:

```bash
curl -s http://localhost:3000/api/latest | jq .
```

Shows whatever's currently stored. Note the `news.headline` so you can confirm it changes after the refresh.

---

## 3. Trigger a refresh

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "x-cron-secret: $SECRET" http://localhost:3000/api/refresh | jq .
```

**Expect:**
- ~30–60 seconds of waiting (Tavily ~10s + Nebius synthesis ~20–50s).
- A `NewsEntry` JSON response.

**Sanity-check the response:**
- `news.headline` — short (≤12 words), reads like a wire-service lede.
- `news.dek` — one sentence, ≤30 words.
- `news.imageUrl` — a real https URL.
- `news.generatedAt` — current ISO timestamp.
- `sources` — array of **3–6** entries, ideally from **different outlets** (BBC / Reuters / AP / NYT / WSJ etc.), all with `title` / `outlet` / `url`.

---

## 4. Confirm the entry was written to KV

```bash
curl -s http://localhost:3000/api/latest | jq .
```

Response should be **identical** to step 3 and reflect the new headline.

To be paranoid:

```bash
curl -s -X POST -H "x-cron-secret: $SECRET" http://localhost:3000/api/refresh | jq . > /tmp/refresh.json
curl -s http://localhost:3000/api/latest | jq . > /tmp/latest.json
diff /tmp/refresh.json /tmp/latest.json && echo IDENTICAL
```

Expected: `IDENTICAL`.

---

## 5. Confirm auth still rejects requests without the secret

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/refresh
```

Expected: `401`.

---

## 6. (Optional) Try a different model — *(Step 5b)*

In `.env.local` add a line:

```
NEBIUS_MODEL=moonshotai/Kimi-K2.6
```

Stop dev (Ctrl-C in terminal 1), restart with `npm run dev`. Re-run step 3. The synthesis should run against Kimi instead of Qwen — headline will differ in tone but the response shape stays the same.

Remove the line and restart to return to the default.

---

## 7. Stop dev when done

Ctrl-C in terminal 1.

---

If any step doesn't match the expected result, paste the output and I'll diagnose.
