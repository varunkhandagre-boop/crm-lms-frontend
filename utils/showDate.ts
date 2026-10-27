// Dates arrive as "2026-10-12" or ISO timestamps ("2026-04-26T06:30:00.000Z").
// Show them the Indian way, DD/MM/YYYY in India time. Anything else (already
// formatted text, empty) is shown as it is.
export function showDate(v?: string | Date | null): string {
    if (v === undefined || v === null || v === '') return '-';
    if (typeof v === 'string') {
        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
        if (!/^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
    }
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(ist.getUTCDate())}/${pad(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()}`;
}
