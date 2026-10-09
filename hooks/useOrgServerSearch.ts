import { useEffect, useRef } from 'react';
import { fetchOrganizations, LegacyOrganization } from '../services/api/organizations';

/**
 * Organization pickers keep only the first 500 organizations on the phone.
 * While the picker is open and 2+ letters are typed, this also searches the
 * server (name / city / state / mobile) and hands the matches to `onResults`,
 * so organizations beyond the first 500 can still be picked.
 */
export function useOrgServerSearch(active: boolean, text: string, onResults: (list: LegacyOrganization[]) => void) {
    const latest = useRef(text);
    const onResultsRef = useRef(onResults);
    useEffect(() => {
        latest.current = text;
        onResultsRef.current = onResults;
    });

    useEffect(() => {
        const q = text.trim();
        if (!active || q.length < 2) return;
        const t = setTimeout(() => {
            fetchOrganizations({ search: q, limit: 50 })
                .then((list) => {
                    if (latest.current.trim() === q) onResultsRef.current(list);
                })
                .catch(() => {}); // keep the local matches already shown
        }, 350);
        return () => clearTimeout(t);
    }, [active, text]);
}

/** Organization by exact name: from the loaded list, else one server search. */
export async function findOrgByName(name: string, loaded: any[]): Promise<any | null> {
    const n = (name || '').trim().toLowerCase();
    if (!n) return null;
    const local = loaded.find((o: any) => (o.orgName || o.name || '').trim().toLowerCase() === n);
    if (local) return local;
    try {
        const list = await fetchOrganizations({ search: name.trim(), limit: 10 });
        return list.find((o: any) => (o.orgName || o.name || '').trim().toLowerCase() === n) || null;
    } catch {
        return null;
    }
}

/** Local matches first, then server matches not already shown (by id). */
export function mergeOrgs(local: any[], server: any[]): any[] {
    if (!server.length) return local;
    const seen = new Set(local.map((o: any) => o.id));
    return [...local, ...server.filter((o: any) => !seen.has(o.id))];
}
