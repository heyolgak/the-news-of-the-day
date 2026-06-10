import { requireEnv } from './env';
import { fetchWithRetry } from './fetchWithRetry';
import type { TavilyArticle } from './tavily';
import type { NewsEntry, NewsSource } from './types';

const DEFAULT_MODEL = 'Qwen/Qwen3.5-397B-A17B-fast';
// `||` not `??`: GitHub Actions injects an unset secret as an empty string,
// and "" should fall back to the default (which `??` would not do).
// Exported so the refresh pipeline can log which model actually ran.
export const MODEL = process.env.NEBIUS_MODEL || DEFAULT_MODEL;
const NEBIUS_ENDPOINT = 'https://api.studio.nebius.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are a wire-service editor. Given the articles below, identify the single most important story of the day and write one headline (≤12 words) and one dek (≤30 words, one sentence).

Use only facts present in the provided articles — do not infer, speculate, or add context not in the sources. If sources disagree on a fact, omit it. Paraphrase rather than quote — no verbatim passages over ~15 words from any single source. Pick a tone that is calm and neutral (Reuters/AP style), not opinionated.

Choose between 3 and 6 source URLs for the \`sources\` array, preferring ones that independently confirm the story. Each must be one of the exact \`url\` strings as it appears in the input — do not modify a URL or invent a new one. (Titles and outlets are looked up from the input by URL, so return URLs only.)

If a usable image URL appears in the source articles you chose, include it as \`imageUrl\` — and it must be one of the imageUrls present in the input.

Return a JSON object with this exact shape, and nothing else:

{
  "news": {
    "headline": "string, ≤12 words",
    "dek": "string, ≤30 words, one sentence",
    "imageUrl": "string URL (optional)"
  },
  "sources": ["url string from the input", "url string from the input"]
}`;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

export async function synthesizeNews(
  articles: TavilyArticle[],
  todayIso: string,
): Promise<NewsEntry> {
  if (articles.length === 0) {
    throw new Error('synthesizeNews: no articles');
  }

  const apiKey = requireEnv('NEBIUS_API_KEY');

  const userPayload = {
    today: todayIso,
    articles: articles.map((a) => ({
      outlet: a.outlet,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      snippet: a.snippet,
      imageUrl: a.imageUrl,
    })),
  };

  const res = await fetchWithRetry(
    NEBIUS_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    },
    { timeoutMs: 90_000 },
  );

  if (!res.ok) {
    throw new Error(`Nebius HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!isNonEmptyString(content)) {
    throw new Error('Nebius: missing message content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Nebius: response is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Nebius: response is not an object');
  }
  const root = parsed as Record<string, unknown>;
  const news = root.news as Record<string, unknown> | undefined;
  const sources = root.sources;

  if (!news || typeof news !== 'object') {
    throw new Error('Nebius: missing news object');
  }
  if (!isNonEmptyString(news.headline)) {
    throw new Error('Nebius: news.headline missing or empty');
  }
  if (!isNonEmptyString(news.dek)) {
    throw new Error('Nebius: news.dek missing or empty');
  }
  if (!Array.isArray(sources) || sources.length < 3 || sources.length > 6) {
    const got = Array.isArray(sources) ? `length ${sources.length}` : 'non-array';
    throw new Error(`Nebius: sources must be array of 3-6, got ${got}`);
  }

  // Map URL -> crawled article so source title/outlet are taken from our own
  // crawl data, never authored or chosen-as-text by the model (OQ2).
  const crawledByUrl = new Map(articles.map((a) => [a.url, a]));
  const crawledImages = new Set(
    articles.flatMap((a) => (a.imageUrl ? [a.imageUrl] : [])),
  );

  const validatedSources: NewsSource[] = sources.map((s, i) => {
    if (!isNonEmptyString(s)) {
      throw new Error(`Nebius: source[${i}] is not a URL string`);
    }
    const article = crawledByUrl.get(s);
    if (!article) {
      throw new Error(`Nebius: source[${i}] url hallucinated: ${s}`);
    }
    return { title: article.title, outlet: article.outlet, url: article.url };
  });

  let imageUrl: string | undefined;
  if (news.imageUrl !== undefined && news.imageUrl !== null) {
    if (!isNonEmptyString(news.imageUrl)) {
      throw new Error('Nebius: news.imageUrl must be a non-empty string if provided');
    }
    if (!crawledImages.has(news.imageUrl)) {
      throw new Error(`Nebius: news.imageUrl hallucinated: ${news.imageUrl}`);
    }
    imageUrl = news.imageUrl;
  }

  return {
    date: { date: todayIso },
    news: {
      headline: news.headline,
      dek: news.dek,
      imageUrl,
      generatedAt: new Date().toISOString(),
    },
    sources: validatedSources,
  };
}
