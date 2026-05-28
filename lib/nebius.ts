import type { TavilyArticle } from './tavily';
import type { NewsEntry } from './types';

// TODO Step 5b: replace this stub with a real Nebius synthesis call
// (system prompt per RFC §LLM prompt sketch, response_format json_object,
// validate sources length 3-6, etc.). For now we fake a NewsEntry from
// the first crawled article so the rest of the pipeline can be exercised.
export async function synthesizeNews(
  articles: TavilyArticle[],
  todayIso: string,
): Promise<NewsEntry> {
  const head = articles[0];
  if (!head) {
    throw new Error('synthesizeNews: no articles');
  }

  const dekSrc = head.body.replace(/\s+/g, ' ').trim();
  const dek = dekSrc.length > 200 ? dekSrc.slice(0, 197) + '…' : dekSrc;

  return {
    date: { date: todayIso },
    news: {
      headline: head.title,
      dek,
      imageUrl: head.imageUrl,
      generatedAt: new Date().toISOString(),
    },
    sources: articles.slice(0, 3).map((a) => ({
      title: a.title,
      outlet: a.outlet,
      url: a.url,
    })),
  };
}
