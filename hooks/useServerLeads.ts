import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LeadPageParams, listLeadsPage } from '../services/api/leads';

export type LeadFilters = Omit<LeadPageParams, 'page' | 'limit'>;

interface Options {
    filters: LeadFilters;
    enabled: boolean;
    /** When set, page 1 for these filters is cached so the screen opens
     *  instantly next time. Pass it only for the default view — caching
     *  every filter combination would just fill up storage. */
    cacheKey?: string | null;
    pageSize?: number;
}

/**
 * Server-side filtered, paginated leads — replaces downloading every lead
 * and filtering on the phone. Changing `filters` resets to page 1; older
 * responses that arrive after a newer request are ignored, so fast typing
 * in search can't show results for an old search term.
 */
export function useServerLeads({ filters, enabled, cacheKey, pageSize = 20 }: Options) {
    const [items, setItems] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const requestId = useRef(0);
    const filterKey = JSON.stringify(filters);

    const fetchFirstPage = useCallback(async (isRefresh: boolean) => {
        const id = ++requestId.current;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const res = await listLeadsPage({ ...filters, page: 1, limit: pageSize });
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey, cacheKey, pageSize]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            if (cacheKey) {
                try {
                    const raw = await AsyncStorage.getItem(cacheKey);
                    if (raw && !cancelled) {
                        const cached = JSON.parse(raw);
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
            // Without a cache the previous results stay on screen until the
            // new page arrives — less flicker than blanking on every filter tap.
            if (!cancelled) await fetchFirstPage(false);
        })();
        return () => { cancelled = true; };
    }, [enabled, fetchFirstPage, cacheKey]);

    const loadMore = useCallback(async () => {
        if (loadingMore || loading || page >= totalPages) return;
        const id = requestId.current;
        setLoadingMore(true);
        try {
            const res = await listLeadsPage({ ...filters, page: page + 1, limit: pageSize });
            if (id !== requestId.current) return; // filters changed meanwhile
            setItems(prev => {
                const seen = new Set(prev.map(l => l.id));
                return [...prev, ...res.items.filter(l => !seen.has(l.id))];
            });
            setTotal(res.total);
            setTotalPages(res.totalPages);
            setPage(page + 1);
        } catch (e: any) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setLoadingMore(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey, page, totalPages, loading, loadingMore, pageSize]);

    /** Pull-to-refresh: shows the refresh spinner. */
    const refresh = useCallback(() => fetchFirstPage(true), [fetchFirstPage]);
    /** Quiet re-fetch (e.g. returning to the screen) — no pull-to-refresh spinner. */
    const reload = useCallback(() => fetchFirstPage(false), [fetchFirstPage]);

    return { items, setItems, total, loading, loadingMore, refreshing, error, hasMore: page < totalPages, loadMore, refresh, reload };
}

// ---------------------------------------------------------------------------
// Leads screen UI state → API filters
// ---------------------------------------------------------------------------

export type ViewMode = 'Day' | 'Month' | 'FY' | 'All';

export interface LeadsScreenState {
    quickFilter: '' | 'overdue' | 'today' | 'hot';
    status: string;      // 'All' or a status label
    stage: string;       // 'All' or a stage label
    search: string;      // already debounced
    viewMode: ViewMode;
    currentDate: Date;
    employeeId?: string; // only for roles that may filter by employee
    websiteOnly?: boolean; // only leads that came from the company website form
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dateWindow(viewMode: ViewMode, d: Date): { from?: string; to?: string } {
    if (viewMode === 'Day') return { from: ymd(d), to: ymd(d) };
    if (viewMode === 'Month') {
        return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    if (viewMode === 'FY') {
        const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Indian FY: 1 Apr – 31 Mar
        return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
    }
    return {};
}

/** Same rules the screen used to apply on the phone, expressed as API params. */
export function buildLeadFilters(s: LeadsScreenState): LeadFilters {
    const filters: LeadFilters = { assignedToId: s.employeeId };
    if (s.websiteOnly) filters.sourceGroup = 'website';
    if (s.quickFilter) {
        filters.quick = s.quickFilter;
    } else {
        if (s.status === 'All') filters.outcome = s.stage === 'Order Closed' ? 'won' : 'open';
        else if (s.status === 'Converted (Win)') filters.outcome = 'won';
        else if (s.status === 'Lost') filters.outcome = 'lost';
        else filters.status = s.status;
        if (s.stage !== 'All') filters.stage = s.stage;
    }
    if (s.search.trim()) {
        filters.search = s.search.trim();
    } else if (!s.quickFilter) {
        Object.assign(filters, dateWindow(s.viewMode, s.currentDate));
    }
    return filters;
}
