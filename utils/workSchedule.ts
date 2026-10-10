// Weekly off + shift — same rules as the backend (src/lib/workSchedule.ts).
// The company default is set in Payroll → Salary Rules; an employee can have
// their own in Team & Settings. Screens get them from GET /attendance/schedules.

export interface WorkSchedule {
    weeklyOffDays: number[];  // 0 = Sunday … 6 = Saturday
    offSaturdays: number[];   // [2, 4] = 2nd & 4th Saturday off
    shiftStart: string | null; // "09:30"
    shiftEnd: string | null;
    graceMinutes: number;
}

export const DEFAULT_SCHEDULE: WorkSchedule = { weeklyOffDays: [0], offSaturdays: [], shiftStart: null, shiftEnd: null, graceMinutes: 0 };

// Own schedule cache (written by hooks/useWorkSchedules, read by the local reminders).
export const MY_SCHEDULE_KEY = 'my_work_schedule';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NTH = ['1st', '2nd', '3rd', '4th', '5th'];

// ymd = "YYYY-MM-DD"
export function isOffDay(ymd: string, s: WorkSchedule | null | undefined): boolean {
    const sch = s || DEFAULT_SCHEDULE;
    const d = new Date(`${ymd}T00:00:00.000Z`);
    const dow = d.getUTCDay();
    if (sch.weeklyOffDays.includes(dow)) return true;
    return dow === 6 && sch.offSaturdays.includes(Math.ceil(d.getUTCDate() / 7));
}

// Phone-local date → "YYYY-MM-DD"
export const localYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Label shown on an off day: "Sunday Off", "Monday Off", "2nd Saturday Off"
export function offDayLabel(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    const dow = d.getUTCDay();
    const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
    return dow === 6 ? `${NTH[Math.ceil(d.getUTCDate() / 7) - 1]} Saturday Off` : `${name} Off`;
}

// "Off: Sun, 2nd & 4th Sat • Shift 09:30–18:30"
export function describeSchedule(s: WorkSchedule | null | undefined): string {
    const sch = s || DEFAULT_SCHEDULE;
    const parts: string[] = [];
    const days = sch.weeklyOffDays.slice().sort().map((d) => DAY_SHORT[d]);
    if (sch.offSaturdays.length && !sch.weeklyOffDays.includes(6)) {
        days.push(`${sch.offSaturdays.slice().sort().map((n) => NTH[n - 1]).join(' & ')} Sat`);
    }
    parts.push(days.length ? `Off: ${days.join(', ')}` : 'No weekly off');
    if (sch.shiftStart || sch.shiftEnd) parts.push(`Shift ${sch.shiftStart || '?'}–${sch.shiftEnd || '?'}`);
    return parts.join(' • ');
}

export const isValidHhmm = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
