// Picks the serial number (and model) out of the text read from a machine label.
// Labels differ a lot: "SN: X", "S/N X", or "SN" in a box with the number
// beside or below it. A serial almost always mixes letters and digits, so words
// such as "MONOPHASIC" are never taken, nor voltages, phone numbers or PIN codes.

const SN_LABEL = /^(?:s\s*\/?\s*n|s\.n\.?|sr\.?\s*no\.?|ser\.?\s*no\.?|serial(?:\s*(?:no\.?|number|#))?)$/i;
const SN_INLINE = /(?:\bS\s*\/\s*N|\bS\.N\.?|\bSN|\bSr\.?\s*No\.?|\bSer\.?\s*No\.?|\bSerial\s*(?:No\.?|Number|#)?)\s*[:\-#.]?\s*([A-Z0-9][A-Z0-9\-\/]{4,24})/i;
const MODEL_INLINE = /(?:\bModel(?:\s*No\.?)?|\bREF|\bM\s*\/\s*N|\bP\s*\/\s*N|\bPart\s*No\.?|\bType)\s*[:\-#.]?\s*([A-Z0-9][A-Z0-9\-\/]{2,19})/i;

const clean = (t: string) => t.replace(/[^A-Za-z0-9\-\/]/g, '').toUpperCase();

/** Looks like a serial: 5–25 chars, has at least one letter AND one digit (or is a long digit run), not a unit / phone / pin. */
export function looksLikeSerial(raw: string): boolean {
    const t = clean(raw);
    if (t.length < 5 || t.length > 25) return false;
    if (/^\d{3}-?\d{3,4}(-?\d{3,4})?$/.test(t)) return false;            // phone numbers, toll-free
    if (/^\d{6}$/.test(t)) return false;                                   // PIN code
    if (/^\d+(-\d+)?(V|VA|HZ|W|KW|MA|A|MM|KG|C)$/.test(t)) return false;   // 100-230V, 100VA, 50HZ
    if (/^\d+\/\d+(HZ)?$/.test(t)) return false;                           // 50/60
    const letters = /[A-Z]/.test(t);
    const digits = (t.match(/\d/g) || []).length;
    return (letters && digits >= 2) || (!letters && digits >= 8);
}

export function extractModel(text: string): string | null {
    const m = text.match(MODEL_INLINE);
    return m && m[1] && /\d/.test(m[1]) ? clean(m[1]) : null;
}

export function extractSerial(text: string, model?: string | null): string | null {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const notModel = (t: string) => !model || clean(t) !== clean(model);

    // 1. "SN: X" on one line.
    for (const line of lines) {
        const m = line.match(SN_INLINE);
        if (m && m[1] && looksLikeSerial(m[1]) && notModel(m[1])) return clean(m[1]);
    }
    // 2. "SN" alone (a boxed label): the value is on one of the next / previous lines.
    for (let i = 0; i < lines.length; i++) {
        if (!SN_LABEL.test(lines[i].replace(/[:\-#]/g, '').trim())) continue;
        for (const j of [i + 1, i + 2, i - 1]) {
            const cand = lines[j]?.split(/\s+/).find((w) => looksLikeSerial(w) && notModel(w));
            if (cand) return clean(cand);
        }
    }
    // 3. Best-looking code anywhere: most digits + letters mixed, longest first.
    const words = lines.flatMap((l) => l.split(/\s+/)).filter((w) => looksLikeSerial(w) && notModel(w));
    if (!words.length) return null;
    const score = (w: string) => {
        const t = clean(w);
        const d = (t.match(/\d/g) || []).length;
        return (/[A-Z]/.test(t) && d ? 100 : 0) + d * 2 + t.length;
    };
    return clean(words.sort((a, b) => score(b) - score(a))[0]);
}
