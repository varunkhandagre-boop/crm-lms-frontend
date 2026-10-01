// Mirrors the backend's src/constants/leadStatus.ts — the backend validates
// lostReason against the same list, so keep the two in sync.
export const LOST_STATUSES = ['Lost', 'Not Interested', 'Plan Drop'];

export const LOST_REASONS = [
    'Price Too High',
    'Went With Competitor',
    'Budget Not Available',
    'No Requirement Now',
    'Product Not Suitable',
    'Tender Lost',
    'No Response',
    'Other',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export function isLostState(status?: string | null, stage?: string | null): boolean {
    return LOST_STATUSES.includes(status ?? '') || stage === 'Lost';
}

// Kanban board columns — mirrors PIPELINE_COLUMNS on the backend.
export const PIPELINE_STAGES = ['New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation'] as const;
export const PIPELINE_COLUMNS = [...PIPELINE_STAGES, 'Other'] as const;
export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number];

export const STAGE_COLORS: Record<string, string> = {
    'New': '#2196f3',
    'Introduction': '#03a9f4',
    'Technical Review': '#9c27b0',
    'Quotation': '#673ab7',
    'Negotiation': '#ff9800',
    'Order Closed': '#4caf50',
    'Lost': '#f44336',
    'Other': '#607d8b',
};
