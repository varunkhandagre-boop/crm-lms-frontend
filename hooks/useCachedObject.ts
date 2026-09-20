import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Cache-first loading for a SINGLE OBJECT (not a list).
//
// Same "instant from cache, then background refresh" idea as
// useCachedList.ts, but for screens whose primary data is one object —
// a dashboard summary, a settings blob, a company profile — rather than
// an array. See useCachedList.ts for the fuller design rationale; this is
// deliberately a near-identical sibling so the two stay easy to reason
// about side by side, rather than trying to force a single hook to cover
// both shapes with awkward generics.
// ---------------------------------------------------------------------------

interface UseCachedObjectOptions<T> {
  /** Unique per screen + tenant, e.g. buildCacheKey('home_summary', companyId). */
  cacheKey: string | null;
  fetcher: () => Promise<T>;
  enabled?: boolean;
}

interface UseCachedObjectResult<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCachedObject<T>({
  cacheKey,
  fetcher,
  enabled = true,
}: UseCachedObjectOptions<T>): UseCachedObjectResult<T> {
  const [data, setData] = useState<T | null>(null);
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
      AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(String(e)));
      // Stale cached value stays on screen on a transient error, same
      // principle as useCachedList.
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
          setLoading(false);
        }
      } catch (e) {
        // Corrupt/unreadable cache entry — fall through to a normal load.
      }
      if (!cancelled) await fetchFresh(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cacheKey]);

  const refresh = useCallback(() => fetchFresh(true), [fetchFresh]);

  return { data, loading, refreshing, error, refresh };
}
