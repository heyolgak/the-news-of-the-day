import { requireEnv } from './env';
import type { TavilyArticle } from './tavily';
import type { NewsEntry, NewsSource } from './types';

const DEFAULT_MODEL = 'Qwen/Qwen3.5-397B-A17B-fast';
const MODEL = process.env.NEBIUS_MODEL ?? DEFAULT_MODEL;
const NEBIUS_ENDPOINT = 'https://api.studio.nebius.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are a wire-service editor. Given the articles below, identify the single most important story of the day and write one headline (≤12 words) and one dek (≤30 words, one sentence).

Use only facts present in the provided articles — do not infer, speculate, or add context not in the sources. If sources disagree on a fact, omit it. Paraphrase rather than quote — no verbatim passages over ~15 words from any single source. Pick a tone that is calm and neutral (Reuters/AP style), not opinionated.

Choose between 3 and 6 sources for the \`sources\` array, preferring ones that independently confirm the story. Use the exact \`outlet\`, \`title\`, and \`url\` strings as they appear in the input — do not paraphrase URLs or invent new ones.

If a usable image URL appears in the source articles you chose, include it as \`imageUrl\` — and it must be one of the imageUrls present in the input.

Return a JSON object with this exact shape, and nothing else:

{
  "news": {
    "headline": "string, ≤12 words",
    "dek": "string, ≤30 words, one sentence",
    "imageUrl": "string URL (optional)"
  },
  "sources": [
    { "title": "string", "outlet": "string", "url": "string" }
  ]
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

  const res = await fetch(NEBIUS_ENDPOINT, {
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
  });

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

  const crawledUrls = new Set(articles.map((a) => a.url));
  const crawledImages = new Set(
    articles.flatMap((a) => (a.imageUrl ? [a.imageUrl] : [])),
  );

  const validatedSources: NewsSource[] = sources.map((s, i) => {
    if (typeof s !== 'object' || s === null) {
      throw new Error(`Nebius: source[${i}] is not an object`);
    }
    const src = s as Record<string, unknown>;
    if (
      !isNonEmptyString(src.title) ||
      !isNonEmptyString(src.outlet) ||
      !isNonEmptyString(src.url)
    ) {
      throw new Error(`Nebius: source[${i}] missing required fields`);
    }
    if (!crawledUrls.has(src.url)) {
      throw new Error(`Nebius: source[${i}] url hallucinated: ${src.url}`);
    }
    return { title: src.title, outlet: src.outlet, url: src.url };
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
