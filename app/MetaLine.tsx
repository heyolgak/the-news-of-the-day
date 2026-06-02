"use client";

import { useState } from "react";
import { useHydrated } from "./useHydrated";

const STALE_THRESHOLD_MIN = 210;

/**
 * Renders "Generated at {local timestamp}" plus, when the entry is older than
 * 210 minutes, a stale notice in Editorial Yellow. Both depend on the user's
 * clock/TZ, so the raw timestamp is shown until hydration, then reformatted.
 */
export default function MetaLine({ generatedAt }: { generatedAt: string }) {
  const hydrated = useHydrated();
  // Capture mount time once (lazy init) — reading the clock during render is impure.
  const [now] = useState(() => Date.now());

  let label = generatedAt;
  let staleMinutes: number | null = null;

  if (hydrated) {
    const ts = Date.parse(generatedAt);
    if (!Number.isNaN(ts)) {
      label = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(ts);
      const ageMin = (now - ts) / 60000;
      if (ageMin > STALE_THRESHOLD_MIN) staleMinutes = Math.round(ageMin);
    }
  }

  return (
    <p
      suppressHydrationWarning
      className="font-sans text-caption text-sterling-gray"
    >
      Generated at {label}
      {staleMinutes !== null && (
        <span className="ml-2 font-bold text-editorial-yellow">
          last updated {staleMinutes} minutes ago
        </span>
      )}
    </p>
  );
}
