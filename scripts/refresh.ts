import { runRefresh } from '../lib/refresh';

/**
 * Scheduled refresh entrypoint, run by `.github/workflows/refresh.yml` on a
 * cron. Reads secrets from the environment (GitHub Actions `env:` in CI; a
 * local `.env.local` via `npm run refresh:local`). Exits non-zero on any
 * failure so the GitHub Actions job goes red — that red X is the alert.
 */
async function main(): Promise<void> {
  const result = await runRefresh();
  if (!result.ok) {
    console.error(`[refresh] failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    `[refresh] ok in ${result.durationMs}ms: ${result.entry.news.headline}`,
  );
}

main().catch((err) => {
  console.error('[refresh] unexpected error', err);
  process.exit(1);
});
