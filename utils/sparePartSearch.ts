// Shared by both spare-part pickers (New Service Call, and closing a call).
// Order: parts the engineer is carrying first, then parts made for this
// machine's model, then everything else — each group A→Z. The search box
// matches part name, part number or compatible model.

export function myQtyOf(part: any, userId?: string): number {
    return (userId && Number(part?.stockHolders?.[userId])) || 0;
}

export function sortAndFilterParts(parts: any[], query: string, userId?: string, model?: string): any[] {
    const q = query.trim().toLowerCase();
    const m = (model || '').trim().toLowerCase();
    const fitsModel = (p: any) => !!m && String(p.compatibleModels || '').toLowerCase().includes(m);
    const rank = (p: any) => (myQtyOf(p, userId) > 0 ? 0 : fitsModel(p) ? 1 : 2);

    return parts
        .filter((p) => !q || `${p.partName} ${p.partNo} ${p.compatibleModels || ''}`.toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b) || String(a.partName).localeCompare(String(b.partName)));
}
