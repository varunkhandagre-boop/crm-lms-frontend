import { useEffect, useState } from 'react';

export type PeriodMode = 'Day' | 'Month' | 'FY' | 'All';

/** Local calendar day as YYYY-MM-DD (never toISOString — that shifts the day after midnight IST). */
export const localYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date range for the Day / Month / FY tabs (FY = 1 Apr – 31 Mar); "All" = no range. */
export function periodRange(mode: PeriodMode, d: Date): { fromDate?: string; toDate?: string } {
    if (mode === 'Day') return { fromDate: localYmd(d), toDate: localYmd(d) };
    if (mode === 'Month') {
        return { fromDate: localYmd(new Date(d.getFullYear(), d.getMonth(), 1)), toDate: localYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    if (mode === 'FY') {
        const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
        return { fromDate: `${start}-04-01`, toDate: `${start + 1}-03-31` };
    }
    return {};
}

/** True when the screen shows this financial year — the default view that gets a page-1 cache. */
export const isCurrentFy = (mode: PeriodMode, d: Date) =>
    mode === 'FY' && periodRange('FY', d).fromDate === periodRange('FY', new Date()).fromDate;

/** Search text after the user stops typing for 400 ms. */
export function useDebounced<T>(value: T, ms = 400): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}
