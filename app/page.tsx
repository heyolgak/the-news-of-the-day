import { getLatestNews } from "@/lib/kv";
import ClientDate from "./ClientDate";
import MetaLine from "./MetaLine";

export const dynamic = "force-dynamic";

function Hairline() {
  return <div className="h-px bg-zinc-gray" />;
}

export default async function Home() {
  const entry = await getLatestNews();

  // Cold start: no entry yet (KV empty until the first refresh runs).
  if (entry === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-center font-serif text-heading text-printers-black">
          First refresh pending — check back shortly
        </p>
      </main>
    );
  }

  const { date, news, sources } = entry;
  const year = new Date().getFullYear();

  return (
    <main className="mx-auto w-full max-w-[1296px] px-6 py-12">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 lg:max-w-none">
        {/* 1. Masthead */}
        <header>
          <p className="text-center font-serif text-[26px] font-bold tracking-[-0.02em] text-printers-black">
            The News of the Day
          </p>
          <div className="mt-4">
            <Hairline />
          </div>
        </header>

        {/* 2. Date block */}
        <section>
          <Hairline />
          <h1 className="py-4 text-center font-serif text-heading font-bold text-printers-black">
            <ClientDate iso={date.date} />
          </h1>
          <Hairline />
        </section>

        {/* 3–6. Lead story — image left / text right on desktop, stacked on mobile */}
        <section className="flex flex-col gap-8 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-x-12">
          {/* Lead image (optional) — not a link; synthesized from many sources.
              Square, edge-to-edge (WSJ style). */}
          {news.imageUrl && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={news.imageUrl} alt={news.headline} className="w-full" />
              {/* Image-credit overlay — TBD: no credit field in the data contract */}
            </figure>
          )}

          {/* Headline + dek + meta */}
          <div className="flex flex-col gap-4">
            {/* Headline — not a link */}
            <h2 className="font-serif text-display font-bold leading-display tracking-display text-printers-black">
              {news.headline}
            </h2>

            {/* Dek */}
            <p className="font-sans text-[19px] leading-[1.35] text-printers-black">
              {news.dek}
            </p>

            {/* Meta line + stale notice */}
            <MetaLine generatedAt={news.generatedAt} />
          </div>
        </section>

        {/* 7 + 8. Sources */}
        <section>
          <h3 className="font-sans text-caption font-bold uppercase tracking-[0.05em] text-printers-black">
            Sources
          </h3>
          <ul className="mt-4 lg:grid lg:grid-cols-4 lg:gap-x-8 lg:gap-y-8 lg:border-t lg:border-zinc-gray lg:pt-6">
            {sources.map((source, i) => (
              <li
                key={`${source.url}-${i}`}
                className="border-t border-zinc-gray py-4 lg:border-t-0 lg:py-0"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-serif text-subheading font-bold leading-subheading tracking-subheading text-printers-black hover:underline lg:text-[28px]"
                >
                  {source.title}
                </a>
                <p className="mt-1 font-sans text-caption text-sterling-gray">
                  By{" "}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-printers-black hover:underline"
                  >
                    {source.outlet}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* 9. Footer */}
        <footer className="text-center font-sans text-caption text-sterling-gray">
          © {year} The News of the Day
        </footer>
      </div>
    </main>
  );
}
