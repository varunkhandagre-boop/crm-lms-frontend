import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Cache-first list loading.
//
// Problem this solves: after the Firestore→Postgres migration, list screens
// go blank/spinner on every open because there's no local cache the way
// Firestore's SDK gave us for free. This hook restores that "feels instant"
// experience on top of plain REST:
//
//   1. On mount, synchronously show whatever was cached last time (if any)
//      — no spinner, no blank screen.
//   2. In the background, fetch fresh data from the API and replace it —
//      the user sees a near-instant screen that then quietly updates.
//   3. Pull-to-refresh and any other manual refresh reuse the same fetch
//      path and keep the cache in sync.
//
// This is a per-screen client-side convenience only — it is NOT a
// replacement for the server being the source of truth, and it does NOT
// affect company-scoping (the fetcher you pass in is responsible for that,
// same as it is today). See utils/listCache.ts for the multi-tenant safety
// note on why every cache key must be scoped by companyId and cleared on
// logout.
// ---------------------------------------------------------------------------

interface UseCachedListOptions<T> {
  /** Unique per screen + tenant, e.g. `leads:${companyId}`. Build this with
   *  buildCacheKey() from utils/listCache.ts so every screen follows the
   *  same convention and logout can find + clear them all. */
  cacheKey: string | null;
  /** Fetches the fresh list from the API. Whatever company/role scoping the
   *  existing API call already does is unchanged — this hook only decides
   *  when to call it and where to cache the result. */
  fetcher: () => Promise<T[]>;
  /** Skip loading entirely until this is true (e.g. companyId not known yet). */
  enabled?: boolean;
}

interface UseCachedListResult<T> {
  data: T[];
  /** True only until the *first* data (cache or network) has been shown.
   *  Once cache hydrates instantly this is usually true for a single frame. */
  loading: boolean;
  /** True while a pull-to-refresh (or manual refresh()) is in flight. */
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCachedList<T>({
  cacheKey,
  fetcher,
  enabled = true,
}: UseCachedListOptions<T>): UseCachedListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchFresh = useCallback(async (isManualRefresh: boolean) => {
    if (!cacheKey) return;
    try {
      if (isManualRefresh) setRefreshing(true);
      const fresh = await fetcherRef.current();
      setData(fresh);
      setError(null);
      // Best-effort write — a failed cache write shouldn't surface as a
      // screen-level error, the user already has the fresh data on screen.
      AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(String(e)));
      // Deliberately don't clear `data` here — a stale cached list beats a
      // blank screen on a transient network error (same principle used
      // elsewhere in this app for badge counts).
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled || !cacheKey) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw && !cancelled) {
          setData(JSON.parse(raw));
          setLoading(false); // instant display from cache
        }
      } catch (e) {
        // Corrupt/unreadable cache entry — ignore and fall through to a
        // normal network load below.
      }
      if (!cancelled) await fetchFresh(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey]);

  const refresh = useCallback(() => fetchFresh(true), [fetchFresh]);

  return { data, loading, refreshing, error, refresh };
}
