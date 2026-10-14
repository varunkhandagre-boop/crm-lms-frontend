import * as XLSX from 'xlsx';
import { fetchRoster, Roster } from '../services/api/shifts';
import { saveAndShareFile } from './saveFile';

// Shift Roster → Excel, used by the Roster screen and Activity Timeline → Export.
// Two sheets:
//   "Roster"      — one row per employee, one column per date (like the screen)
//   "Roster List" — one row per employee per date (easy to filter / pivot)

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_DAYS_PER_CALL = 62; // the server's limit for one roster request

const addDays = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
const colLabel = (ymd: string) => `${DAY_SHORT[dowOf(ymd)]} ${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
const isNight = (start: string | null, end: string | null) => !!start && !!end && end <= start;

// Every employee's roster for any date range (fetched in ≤62-day pieces).
export async function fetchRosterRange(fromDate: string, toDate: string): Promise<Roster> {
    const merged: Roster = { fromDate, toDate, holidays: [], users: [] };
    const byId = new Map<string, Roster['users'][number]>();
    for (let start = fromDate; start <= toDate; start = addDays(start, MAX_DAYS_PER_CALL)) {
        const end = addDays(start, MAX_DAYS_PER_CALL - 1) < toDate ? addDays(start, MAX_DAYS_PER_CALL - 1) : toDate;
        const part = await fetchRoster(start, end, 'all');
        merged.holidays.push(...part.holidays);
        for (const u of part.users) {
            const had = byId.get(u.id);
            if (had) Object.assign(had.days, u.days);
            else byId.set(u.id, { ...u, days: { ...u.days } });
        }
    }
    merged.users = [...byId.values()];
    return merged;
}

// Adds the two roster sheets to a workbook. `onlyUser` = one employee's name.
// Returns false when there's nobody to list.
export function addRosterSheets(wb: XLSX.WorkBook, roster: Roster, onlyUser?: string): boolean {
    const users = roster.users.filter((u) => !onlyUser || onlyUser === 'All' || u.name === onlyUser);
    if (users.length === 0) return false;
    const holidays = new Map(roster.holidays.map((h) => [h.date, h.name]));
    const dates: string[] = [];
    for (let d = roster.fromDate; d <= roster.toDate; d = addDays(d, 1)) dates.push(d);

    const cell = (u: (typeof users)[number], d: string) => {
        const day = u.days[d];
        if (holidays.has(d)) return `Holiday: ${holidays.get(d)}`;
        if (!day) return '';
        if (day.off) return 'Off';
        if (!day.start) return '';
        return `${isNight(day.start, day.end) ? '🌙 ' : ''}${day.name ?? 'Shift'} ${day.start}-${day.end}`;
    };

    const grid = users.map((u) => {
        const row: Record<string, string> = { Employee: u.name };
        for (const d of dates) row[colLabel(d)] = cell(u, d);
        return row;
    });
    const gridSheet = XLSX.utils.json_to_sheet(grid, { header: ['Employee', ...dates.map(colLabel)] });
    gridSheet['!cols'] = [{ wch: 22 }, ...dates.map(() => ({ wch: 18 }))];
    XLSX.utils.book_append_sheet(wb, gridSheet, 'Roster');

    const list = users.flatMap((u) => dates.map((d) => {
        const day = u.days[d];
        const holiday = holidays.get(d);
        const working = !holiday && !!day && !day.off && !!day.start;
        return {
            Employee: u.name,
            Date: d,
            Day: DAY_SHORT[dowOf(d)],
            Status: holiday ? 'Holiday' : day?.off ? 'Off' : working ? 'Working' : 'No shift',
            Shift: working ? day!.name ?? 'Shift' : holiday ?? '',
            Start: working ? day!.start : '',
            End: working ? day!.end : '',
            'Night shift (ends next day)': working && isNight(day!.start, day!.end) ? 'Yes' : '',
            'Set by': day?.source === 'roster' ? 'Roster' : day?.source === 'default' ? 'Default shift' : day?.source === 'schedule' ? 'Weekly schedule' : '',
        };
    }));
    const listSheet = XLSX.utils.json_to_sheet(list);
    listSheet['!cols'] = [{ wch: 22 }, { wch: 11 }, { wch: 5 }, { wch: 9 }, { wch: 16 }, { wch: 7 }, { wch: 7 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, listSheet, 'Roster List');
    return true;
}

// Roster screen → "Download": the range on screen, every employee.
export async function downloadRosterExcel(fromDate: string, toDate: string): Promise<boolean> {
    const roster = await fetchRosterRange(fromDate, toDate);
    const wb = XLSX.utils.book_new();
    if (!addRosterSheets(wb, roster)) return false;
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareFile({
        content: wbout,
        base64: true,
        fileName: `Shift_Roster_${fromDate}_to_${toDate}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Download Shift Roster',
    });
    return true;
}
