import { requireEnv } from './env';
import { fetchWithRetry } from './fetchWithRetry';
import type { TavilyArticle } from './tavily';
import type { NewsEntry, NewsSource } from './types';

const DEFAULT_MODEL = 'Qwen/Qwen3.5-397B-A17B';
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

/**
 * Thrown only for a semantically-invalid model response (bad JSON or wrong
 * shape) — never for HTTP-level failures, which `fetchWithRetry` already
 * retries per-attempt. Lets `synthesizeNews` retry just this class of error.
 */
class SynthesisValidationError extends Error {}

const MAX_SYNTHESIS_ATTEMPTS = 2;

export async function synthesizeNews(
  articles: TavilyArticle[],
  todayIso: string,
): Promise<NewsEntry> {
  if (articles.length === 0) {
    throw new Error('synthesizeNews: no articles');
  }

  const apiKey = requireEnv('NEBIUS_API_KEY');

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    // The failure we retry is deterministic shape drift (the model returns valid
    // JSON with `sources` in the wrong shape), so a blind re-roll at temp 0.2
    // would likely reproduce it — the retry carries a corrective nudge instead.
    const retryHint =
      attempt > 1
        ? 'IMPORTANT: `sources` must be a raw JSON array of URL strings — not a stringified array, not an object.'
        : undefined;
    try {
      return await attemptSynthesis(articles, todayIso, apiKey, retryHint);
    } catch (err) {
      if (!(err instanceof SynthesisValidationError) || attempt === MAX_SYNTHESIS_ATTEMPTS) {
        throw err;
      }
      console.warn(
        `[nebius] attempt ${attempt} failed (${err.message}), retrying with corrective hint`,
      );
      lastErr = err;
    }
  }
  // Unreachable: the loop either returns or throws.
  throw lastErr;
}

async function attemptSynthesis(
  articles: TavilyArticle[],
  todayIso: string,
  apiKey: string,
  retryHint?: string,
): Promise<NewsEntry> {
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
        // Small structured output (headline + dek + ≤6 URLs). Not a fix for the
        // shape-drift failure, but caps cost/latency and guards the sibling
        // truncation failure family the enable_thinking note below describes.
        max_tokens: 1000,
        // Strict JSON schema (not bare json_object) so the model's output is
        // structurally constrained to `sources` = array of 3-6 URL strings.
        // `imageUrl` is nullable-required, not omitted, because strict mode
        // requires every property to appear in `required`. Code-level validation
        // below stays authoritative — we never trust the API's enforcement alone.
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'news_synthesis',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['news', 'sources'],
              properties: {
                news: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['headline', 'dek', 'imageUrl'],
                  properties: {
                    headline: { type: 'string' },
                    dek: { type: 'string' },
                    imageUrl: { type: ['string', 'null'] },
                  },
                },
                sources: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 3,
                  maxItems: 6,
                },
              },
            },
          },
        },
        // Qwen3.5-397B-A17B is a reasoning model: with thinking on it burns the
        // completion-token budget on hidden reasoning, so on the large (~28k-token)
        // article payload the JSON gets truncated mid-body or never written —
        // surfacing as "missing message content" / "response is not valid JSON".
        // We only need structured extraction, so disable thinking. (vLLM passes
        // this through to the chat template; harmless for non-thinking models.)
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
          ...(retryHint ? [{ role: 'user', content: retryHint }] : []),
        ],
      }),
    },
    { timeoutMs: 90_000 },
  );

  if (!res.ok) {
    throw new Error(`Nebius HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;

  // Log the raw output + finish_reason on any parse/shape failure, then throw a
  // retryable SynthesisValidationError. The old message collapsed the real shape
  // into "non-array"; the content preview shows exactly what the model returned.
  // A `function` declaration (not an arrow const) so its `never` return is
  // honored by control-flow narrowing at each call site, like a bare `throw`.
  function fail(msg: string, sourcesType?: string): never {
    console.error(
      `[nebius] synthesis validation failed (finish_reason=${finishReason ?? 'unknown'}` +
        (sourcesType ? `, sources type=${sourcesType}` : '') +
        `): ${(content ?? '<empty>').slice(0, 500)}`,
    );
    throw new SynthesisValidationError(msg);
  }

  if (!isNonEmptyString(content)) {
    fail('Nebius: missing message content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    fail('Nebius: response is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    fail('Nebius: response is not an object');
  }
  const root = parsed as Record<string, unknown>;
  const news = root.news as Record<string, unknown> | undefined;

  // The observed failure: valid JSON but `sources` arrives as a JSON-stringified
  // array rather than a native one. Coerce that shape before validating, so we
  // recover even if the model (or json_schema mode) doesn't return a raw array.
  let sources: unknown = root.sources;
  if (typeof sources === 'string') {
    try {
      const reparsed = JSON.parse(sources);
      if (Array.isArray(reparsed)) sources = reparsed;
    } catch {
      /* leave as-is; the array check below rejects it and the retry nudges. */
    }
  }

  if (!news || typeof news !== 'object') {
    fail('Nebius: missing news object');
  }
  if (!isNonEmptyString(news.headline)) {
    fail('Nebius: news.headline missing or empty');
  }
  if (!isNonEmptyString(news.dek)) {
    fail('Nebius: news.dek missing or empty');
  }
  if (!Array.isArray(sources) || sources.length < 3 || sources.length > 6) {
    const got = Array.isArray(sources) ? `length ${sources.length}` : 'non-array';
    fail(`Nebius: sources must be array of 3-6, got ${got}`, typeof sources);
  }

  // Map URL -> crawled article so source title/outlet are taken from our own
  // crawl data, never authored or chosen-as-text by the model (OQ2).
  const crawledByUrl = new Map(articles.map((a) => [a.url, a]));
  const crawledImages = new Set(
    articles.flatMap((a) => (a.imageUrl ? [a.imageUrl] : [])),
  );

  const validatedSources: NewsSource[] = sources.map((s, i) => {
    if (!isNonEmptyString(s)) {
      return fail(`Nebius: source[${i}] is not a URL string`);
    }
    const article = crawledByUrl.get(s);
    if (!article) {
      return fail(`Nebius: source[${i}] url hallucinated: ${s}`);
    }
    return { title: article.title, outlet: article.outlet, url: article.url };
  });

  let imageUrl: string | undefined;
  if (news.imageUrl !== undefined && news.imageUrl !== null) {
    if (!isNonEmptyString(news.imageUrl)) {
      fail('Nebius: news.imageUrl must be a non-empty string if provided');
    }
    if (!crawledImages.has(news.imageUrl)) {
      fail(`Nebius: news.imageUrl hallucinated: ${news.imageUrl}`);
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
