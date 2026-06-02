"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns false during SSR and the first client render, then true once
 * hydrated. Lets a component render a server-safe fallback and swap in
 * locale/clock-dependent output after hydration without a hydration mismatch
 * (and without setState-in-effect).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
