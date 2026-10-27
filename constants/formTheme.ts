// Gives every "Add …" form the same look: header in the screen's own colour
// (same as its Home tile), a plain light page, section titles on a light band
// in that colour, bold blue labels, white inputs with a light grey border, and
// a coloured Save button — colour marks where you are, the page stays calm.
// Only style keys a screen already defines are touched.

type Styles = Record<string, any>;

const PAGE_BG = '#f5f6f8';
const LABEL = '#2c4f8f'; // one blue for every label, like Order Details
const FIELD_BORDER = '#d5d9de';

export function themedForm<T extends Styles>(base: T, accent: string): T {
    const out: Styles = { ...base };
    const merge = (key: string, extra: Styles) => {
        if (out[key]) out[key] = { ...out[key], ...extra };
    };

    merge('container', { backgroundColor: PAGE_BG });
    merge('header', { backgroundColor: accent, borderBottomWidth: 0, elevation: 4 });
    merge('headerTitle', { color: 'white' });

    ['label'].forEach((k) => merge(k, { color: LABEL, fontWeight: '700' }));
    ['sectionHeader', 'sectionTitle'].forEach((k) => merge(k, { color: accent, fontWeight: '800', backgroundColor: accent + '17', borderLeftWidth: 4, borderLeftColor: accent, paddingLeft: 10, paddingVertical: 8, borderRadius: 8, overflow: 'hidden' }));

    const field = { backgroundColor: 'white', borderWidth: 1, borderColor: FIELD_BORDER };
    ['input', 'inputGray', 'dropdown', 'dropdownBtn', 'selector', 'textArea', 'pickerBox'].forEach((k) => merge(k, field));

    ['formCard'].forEach((k) => merge(k, { borderTopWidth: 4, borderTopColor: accent }));
    ['saveBtn', 'saveButton', 'submitBtn', 'submitButton'].forEach((k) => merge(k, { backgroundColor: accent, elevation: 3 }));
    ['modalTitle'].forEach((k) => merge(k, { color: accent }));
    ['activeMode', 'activeTypeBtn', 'activeType'].forEach((k) => merge(k, { backgroundColor: accent, borderColor: accent }));

    return out as T;
}

/** Each Add screen uses the colour of its Home tile so the user knows where they are. */
export const FORM_ACCENT = {
    activity: '#7b1fa2',
    advance: '#9c27b0',
    courier: '#e67e22',
    demo: '#00acc1',
    expense: '#e53935',
    installation: '#00897b',
    lead: '#f57c00',
    leave: '#1e88e5',
    order: '#ef6c00',
    organization: '#3949ab',
    payment: '#2e7d32',
    paymentDue: '#c0392b',
    pms: '#43a047',
    project: '#546e7a',
    quotation: '#1565c0',
    sales: '#3b5998',
    serviceCall: '#6a1b9a',
    sparePart: '#5e35b1',
    task: '#e91e63',
    travel: '#fb8c00',
    visitingCard: '#8d6e63',
} as const;
