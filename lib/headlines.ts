import { fetchWithRetry } from './fetchWithRetry';
import type { NewsSource } from './types';

/**
 * Tavily returns the page's HTML `<title>`, which is the SEO/social title — it
 * carries the outlet brand suffix (`… - BBC`) and often differs from the visible
 * article headline. This module re-resolves each chosen source's headline from
 * the source's own `og:title` (a plain HTTP GET, no Tavily quota), de-branded.
 *
 * Best-effort throughout: a fetch/parse failure must never abort an otherwise
 * good refresh, so every path falls back to the suffix-stripped crawl title and
 * nothing here throws.
 */

// Outlet -> brand tokens that may appear as a trailing " - BRAND" suffix.
// Keyed by the `outlet` strings in lib/tavily.ts SOURCES.
const OUTLET_ALIASES: Record<string, string[]> = {
  'BBC News': ['BBC News', 'BBC'],
  Reuters: ['Reuters'],
  'Associated Press': ['Associated Press', 'AP News', 'AP'],
  'The Guardian': ['The Guardian', 'Guardian'],
  'New York Times': ['The New York Times', 'New York Times', 'NYT'],
  'Al Jazeera English': ['Al Jazeera English', 'Al Jazeera'],
  Bloomberg: ['Bloomberg'],
  'The Wall Street Journal': ['The Wall Street Journal', 'WSJ'],
};

// A browser-like UA avoids trivial bot blocks; paywalled outlets still serve
// og:title in <head> for social cards even when the body is gated.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 10_000;
// Headlines live in <head>; cap the slice we parse so a huge article body
// doesn't turn into a huge regex target.
const HEAD_SLICE_LEN = 50_000;

export async function resolveHeadlines(
  sources: NewsSource[],
): Promise<NewsSource[]> {
  const settled = await Promise.allSettled(sources.map(resolveOne));
  let upgraded = 0;
  const resolved = sources.map((s, i) => {
    const r = settled[i];
    if (r?.status === 'fulfilled' && r.value) {
      upgraded++;
      return { ...s, title: r.value };
    }
    // Fallback: at least de-brand the Tavily title (fixes the " - BBC" suffix).
    return { ...s, title: stripOutletSuffix(s.title, s.outlet) };
  });
  console.log(
    `[headlines] resolved ${upgraded}/${sources.length} via og:title, ` +
      `${sources.length - upgraded} fell back to crawl title`,
  );
  return resolved;
}

async function resolveOne(source: NewsSource): Promise<string | null> {
  try {
    const res = await fetchWithRetry(
      source.url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } },
      { timeoutMs: FETCH_TIMEOUT_MS },
    );
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, HEAD_SLICE_LEN);
    const raw = extractHeadline(html);
    if (!raw) return null;
    const cleaned = stripOutletSuffix(decodeEntities(raw).trim(), source.outlet);
    return cleaned || null;
  } catch {
    // Timeout, network reject, non-HTML — fall back. Never throw.
    return null;
  }
}

/**
 * Try og:title, then twitter:title. Returns the raw value, or null.
 *
 * We deliberately do NOT fall back to the page's `<title>`: it's the same kind
 * of SEO/branded string we already get from Tavily, and a bot-block stub served
 * with HTTP 200 can carry a junk `<title>` (e.g. `nytimes.com`). When neither
 * OG/Twitter tag is present, returning null lets the caller fall back to the
 * de-branded Tavily title — strictly safer.
 */
export function extractHeadline(html: string): string | null {
  return metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
}

/**
 * Find a `<meta>` tag whose property/name is `key` and return its `content`.
 * Attribute-order tolerant: locate the tag, then read `content` from within it.
 */
function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(
    new RegExp(`<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["']${esc}["'][^>]*>`, 'i'),
  );
  if (!tag) return null;
  const content = tag[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i);
  const value = content?.[1]?.trim();
  return value ? value : null;
}

/**
 * Remove a single trailing `" <sep> BRAND"` where BRAND is a known alias of the
 * outlet. Brand-anchored so a legit headline that merely contains " - " is left
 * intact. Separators: hyphen, pipe, en/em dash.
 */
export function stripOutletSuffix(title: string, outlet: string): string {
  const aliases = OUTLET_ALIASES[outlet];
  if (!aliases) return title;
  for (const brand of aliases) {
    const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s+[-|–—]\\s+${esc}\\s*$`, 'i');
    if (re.test(title)) return title.replace(re, '').trim();
  }
  return title;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the common named + numeric HTML entities seen in title tags. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}
