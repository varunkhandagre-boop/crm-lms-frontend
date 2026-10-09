import * as XLSX from 'xlsx';
import { readFileBase64 } from './readFileBase64';
import { saveAndShareFile } from './saveFile';

/** First sheet of an .xlsx / .xls file as rows keyed by the header text (headers trimmed). */
export async function readExcelRows(fileUri: string): Promise<Record<string, any>[]> {
    const base64 = await readFileBase64(fileUri);
    const wb = XLSX.read(base64, { type: 'base64' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    // " Email " and "Email" should both work.
    return rows.map((r) => {
        const out: Record<string, any> = {};
        Object.keys(r).forEach((k) => { out[k.trim()] = r[k]; });
        return out;
    });
}

/** Writes rows to an .xlsx in the cache folder and opens the share sheet. */
export async function shareExcel(rows: Record<string, any>[], columns: string[], sheetName: string, fileName: string) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
    ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareFile({
        content: wbout, base64: true, fileName, dialogTitle: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/** Cell → trimmed text, or undefined when empty. Numbers keep all digits (mobile, Aadhaar, account no). */
export function cellText(v: any): string | undefined {
    if (v === null || v === undefined) return undefined;
    const s = typeof v === 'number' ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v);
    const t = s.trim();
    return t ? t : undefined;
}

/** Cell → number ("₹1,20,000" and "18%" work), or undefined when empty / not a number. */
export function cellNumber(v: any): number | undefined {
    if (v === null || v === undefined || v === '') return undefined;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    const n = Number(String(v).replace(/[₹,%\s]/g, ''));
    return Number.isFinite(n) && String(v).trim() !== '' ? n : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Cell → YYYY-MM-DD. Handles Excel date numbers (e.g. 46023), 2026-01-15,
 * 15/01/2026, 15-01-2026, 15.01.2026 and "15 Jan 2026". Undefined when it
 * cannot be read.
 */
export function cellDate(v: any): string | undefined {
    if (v === null || v === undefined || v === '') return undefined;
    if (v instanceof Date && !isNaN(v.getTime())) {
        return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    }
    if (typeof v === 'number') {
        // Excel serial day (1900 system): day 25569 = 1970-01-01.
        if (v < 1 || v > 80000) return undefined;
        const d = new Date(Math.round((v - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // Indian order: day first
    if (m) return valid(+m[3], +m[2], +m[1]);
    if (/^\d+(\.\d+)?$/.test(s)) return cellDate(Number(s));
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? undefined : cellDate(parsed);
}

function valid(y: number, m: number, d: number): string | undefined {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
    return `${y}-${pad(m)}-${pad(d)}`;
}
