"use client";

import { useHydrated } from "./useHydrated";

/**
 * Formats a date-only ISO string (e.g. "2026-06-02") in the user's locale.
 * Builds the Date from its parts (local midnight) so the displayed calendar
 * day never shifts across time zones. The server can't know the user's
 * locale/TZ, so it renders the raw ISO until hydration.
 */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

export default function ClientDate({ iso }: { iso: string }) {
  const hydrated = useHydrated();
  return (
    <span suppressHydrationWarning>{hydrated ? formatIsoDate(iso) : iso}</span>
  );
}
