import { requireEnv } from './env';

export type TavilyArticle = {
  outlet: string;
  title: string;
  url: string;
  publishedAt?: string;
  snippet: string;
  imageUrl?: string;
};

export const SOURCES = [
  { outlet: 'BBC News', domain: 'bbc.com' },
  { outlet: 'Reuters', domain: 'reuters.com' },
  { outlet: 'Associated Press', domain: 'apnews.com' },
  { outlet: 'The Guardian', domain: 'theguardian.com' },
  { outlet: 'New York Times', domain: 'nytimes.com' },
  { outlet: 'Al Jazeera English', domain: 'aljazeera.com' },
  { outlet: 'Bloomberg', domain: 'bloomberg.com' },
  { outlet: 'The Wall Street Journal', domain: 'wsj.com' },
] as const;

type TavilyResult = {
  url: string;
  title: string;
  content?: string;
  published_date?: string;
  images?: string[];
};

type TavilyResponse = {
  results?: TavilyResult[];
};

async function queryOutlet(
  outlet: string,
  domain: string,
  apiKey: string,
): Promise<TavilyArticle[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'top news today',
      topic: 'news',
      include_domains: [domain],
      include_images: true,
      max_results: 10,
      days: 1,
      search_depth: 'basic',
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily ${outlet}: HTTP ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as TavilyResponse;
  const results = data.results ?? [];

  return results
    .map<TavilyArticle>((r) => ({
      outlet,
      title: r.title,
      url: r.url,
      snippet: r.content ?? '',
      publishedAt: r.published_date,
      imageUrl: r.images?.[0],
    }))
    .filter((a) => a.snippet.trim() !== '');
}

export async function crawlSources(): Promise<TavilyArticle[]> {
  const apiKey = requireEnv('TAVILY_API_KEY');

  const settled = await Promise.allSettled(
    SOURCES.map(({ outlet, domain }) => queryOutlet(outlet, domain, apiKey)),
  );

  const articles: TavilyArticle[] = [];
  let anyFulfilled = false;
  for (const [i, r] of settled.entries()) {
    const outlet = SOURCES[i]?.outlet ?? 'unknown';
    if (r.status === 'fulfilled') {
      anyFulfilled = true;
      articles.push(...r.value);
    } else {
      console.warn(`[tavily] ${outlet} failed:`, r.reason);
    }
  }

  if (!anyFulfilled) {
    throw new Error('Tavily: all sources failed');
  }

  return articles;
}
