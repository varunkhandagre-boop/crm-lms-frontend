import { useEffect, useState } from 'react';
import { searchMachines } from '../services/api/installations';

/**
 * Machines (installations) of one hospital, plus the machine with `serial`
 * when one is given — searched on the server for the whole company, so an
 * engineer also sees machines someone else installed. Replaces downloading
 * every installation of the company.
 */
export function useOrgMachines(orgName: string, serial?: string): any[] {
    const [list, setList] = useState<any[]>([]);
    const org = (orgName || '').trim();
    const sn = (serial || '').trim();
    useEffect(() => {
        if (!org && !sn) { setList([]); return; }
        let alive = true;
        Promise.all([
            org.length >= 2 ? searchMachines(org, 200).catch(() => []) : Promise.resolve([]),
            sn ? searchMachines(sn, 10).catch(() => []) : Promise.resolve([]),
        ]).then(([byOrg, bySerial]) => {
            if (!alive) return;
            const seen = new Set<string>();
            setList([...byOrg, ...bySerial].filter((m: any) => (seen.has(m.id) ? false : (seen.add(m.id), true))));
        });
        return () => { alive = false; };
    }, [org, sn]);
    return list;
}
