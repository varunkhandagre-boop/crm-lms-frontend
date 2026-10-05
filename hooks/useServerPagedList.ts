import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResult<T> { items: T[]; total: number; totalPages: number }

interface Options<F, T> {
    /** Fetches one page; must apply every filter on the server. */
    fetchPage: (params: F & { page: number; limit: number }) => Promise<PagedResult<T>>;
    filters: F;
    enabled: boolean;
    /** Cache page 1 of the default view only, so the screen opens instantly. */
    cacheKey?: string | null;
    pageSize?: number;
}

/**
 * Generic server-paged list (20 per page + Load more) — same behaviour as
 * useServerLeads: changing `filters` restarts at page 1, and a response that
 * arrives after a newer request is ignored.
 */
export function useServerPagedList<F extends object, T extends { id: string }>({
    fetchPage, filters, enabled, cacheKey, pageSize = 20,
}: Options<F, T>) {
    const [items, setItems] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const requestId = useRef(0);
    const filterKey = JSON.stringify(filters);
    const fetchRef = useRef(fetchPage);
    fetchRef.current = fetchPage;

    const fetchFirstPage = useCallback(async (isRefresh: boolean) => {
        const id = ++requestId.current;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const res = await fetchRef.current({ ...(JSON.parse(filterKey) as F), page: 1, limit: pageSize });
            if (id !== requestId.current) return;
            setItems(res.items);
            setTotal(res.total);
            setTotalPages(res.totalPages);
            setPage(1);
            setError(null);
            if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(res)).catch(() => {});
        } catch (e: any) {
            if (id === requestId.current) setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            if (id === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [filterKey, cacheKey, pageSize]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            if (cacheKey) {
                try {
                    const raw = await AsyncStorage.getItem(cacheKey);
                    if (raw && !cancelled) {
                        const cached = JSON.parse(raw) as PagedResult<T>;
                        setItems(cached.items || []);
                        setTotal(cached.total || 0);
                        setTotalPages(cached.totalPages || 1);
                        setPage(1);
                        setLoading(false);
                    }
                } catch {
                    // unreadable cache — just load from the network
                }
            }
            if (!cancelled) await fetchFirstPage(false);
        })();
        return () => { cancelled = true; };
    }, [enabled, fetchFirstPage, cacheKey]);

    const loadMore = useCallback(async () => {
        if (loadingMore || loading || page >= totalPages) return;
        const id = requestId.current;
        setLoadingMore(true);
        try {
            const res = await fetchRef.current({ ...(JSON.parse(filterKey) as F), page: page + 1, limit: pageSize });
            if (id !== requestId.current) return; // filters changed meanwhile
            setItems(prev => {
                const seen = new Set(prev.map(x => x.id));
                return [...prev, ...res.items.filter(x => !seen.has(x.id))];
            });
            setTotal(res.total);
            setTotalPages(res.totalPages);
            setPage(page + 1);
        } catch (e: any) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoadingMore(false);
        }
    }, [filterKey, page, totalPages, loading, loadingMore, pageSize]);

    const refresh = useCallback(() => fetchFirstPage(true), [fetchFirstPage]);
    const reload = useCallback(() => fetchFirstPage(false), [fetchFirstPage]);

    return { items, setItems, total, loading, loadingMore, refreshing, error, hasMore: page < totalPages, loadMore, refresh, reload };
}
