import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { fetchWorkSchedules } from '../services/api/attendance';
import { DEFAULT_SCHEDULE, MY_SCHEDULE_KEY, WorkSchedule } from '../utils/workSchedule';

// Weekly off / shift for the attendance screens; cache-first.
export function useWorkSchedules(companyId?: string, myUserId?: string) {
    const cacheKey = companyId ? `work_schedules_${companyId}` : null;
    const [company, setCompany] = useState<WorkSchedule>(DEFAULT_SCHEDULE);
    const [byUser, setByUser] = useState<Record<string, WorkSchedule>>({});

    useEffect(() => {
        if (!cacheKey) return;
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(cacheKey);
                if (raw && !cancelled) {
                    const c = JSON.parse(raw);
                    setCompany(c.company || DEFAULT_SCHEDULE);
                    setByUser(c.byUser || {});
                }
            } catch {
                // unreadable cache — the network load below fixes it
            }
            try {
                const fresh = await fetchWorkSchedules();
                if (cancelled) return;
                setCompany(fresh.company || DEFAULT_SCHEDULE);
                setByUser(fresh.byUser || {});
                AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => {});
                // Own schedule also feeds the local Day In / Day Out reminders.
                const mine = myUserId ? fresh.byUser?.[myUserId] : null;
                if (mine) AsyncStorage.setItem(MY_SCHEDULE_KEY, JSON.stringify(mine)).catch(() => {});
            } catch {
                // offline — keep cached / default
            }
        })();
        return () => { cancelled = true; };
    }, [cacheKey, myUserId]);

    const forUser = useCallback((userId?: string | null) => (userId && byUser[userId]) || company, [byUser, company]);
    return { company, byUser, forUser };
}
