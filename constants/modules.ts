// Company-level feature buckets — mirrors backend/src/constants/modules.ts
// exactly. Keep the two in sync; the backend is the source of truth for
// what's actually enforced (this file just needs to hide the same menu
// items the backend would reject calls for, so the UI doesn't show a
// button that 403s).
export type ModuleKey = 'sales' | 'service' | 'hr';

export const MODULE_LABELS: Record<ModuleKey, string> = {
    sales: 'Sales & CRM',
    service: 'Service',
    hr: 'HR & Payroll',
};

// A menu-item `module` tag not listed here is always visible regardless of
// which buckets a company has — account/company-management screens every
// business needs (users, company_profile, common, dashboard,
// superadmin_only), not CRM/ops features tied to a particular kind of work.
export const MENU_TAG_BUCKET: Record<string, ModuleKey> = {
    // Sales
    asset_history: 'sales',
    catalogs: 'sales',
    sales_team_report: 'sales',
    visits: 'sales',
    demos: 'sales',
    orders: 'sales',
    sales_analysis: 'sales',
    payment_coll: 'sales',
    payment_due: 'sales',
    // Service
    spares: 'service',
    installation: 'service',
    tickets: 'service',
    pms: 'service',
    service_reports: 'service',
    // HR & Payroll (also the "every business needs this" catch-all —
    // quotations and courier are used by non-CRM businesses too)
    attendance: 'hr',
    leave: 'hr',
    advance: 'hr',
    expenses: 'hr',
    payroll: 'hr',
    travel: 'hr',
    courier: 'hr',
    quotations: 'hr',
    personal_notes: 'hr',
};

/** Bottom-bar modules that are ON for every role until an admin switches them off in Permissions. */
export const DEFAULT_ON_TABS: string[] = ['activity', 'tasks'];
