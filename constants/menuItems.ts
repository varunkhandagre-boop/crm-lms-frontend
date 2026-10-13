// The app's menu, in one place: Home grid sections, the sidebar list, the
// bottom bar and the desktop (web) sidebar all read these. `module` is the
// permission key checked by utils/menuAccess.ts.
// bucket: plan module the item needs when its permission key is shared with other screens (e.g. 'organizations').
export type MenuItemDef = { title: string; icon: string; color?: string; route: string; module: string; id?: string; bucket?: 'hr' | 'sales' | 'service' };

export const HR_ITEMS: MenuItemDef[] = [
    { title: 'Attendance', icon: 'finger-print', color: '#4caf50', route: '/dayin', module: 'attendance' },
    { title: 'Travel Log', icon: 'bicycle', color: '#ff9800', route: '/travel', module: 'travel' },
    { title: 'Advance', icon: 'wallet', color: '#9c27b0', route: '/advance', module: 'advance' },
    { title: 'Expenses', icon: 'receipt', color: '#f44336', route: '/expense', module: 'expenses' },
    { title: 'Leaves', icon: 'calendar', color: '#2196f3', route: '/leave', module: 'leave' },
    { title: 'Cards', icon: 'card', color: '#795548', route: '/visiting_card', module: 'common' },
    { title: 'Courier', icon: 'cube', color: '#e67e22', route: '/courier', module: 'courier' },
    { title: 'Task List', icon: 'checkbox', color: '#e91e63', route: '/tasks', module: 'dashboard' },
    { title: 'Payroll', icon: 'cash', color: '#009688', route: '/payroll', module: 'payroll' },
];

export const ACTIVITY_ITEMS: MenuItemDef[] = [
    { title: 'Visits DSR', icon: 'briefcase', color: '#3b5998', route: '/sales', module: 'visits' },
    { title: 'Installation', icon: 'construct', color: '#795548', route: '/installation', module: 'installation' },
    { title: 'Demo Report', icon: 'play-circle', color: '#00bcd4', route: '/demo', module: 'demos' },
    { title: 'PMS Report', icon: 'shield-checkmark', color: '#4caf50', route: '/pms_schedule', module: 'pms' },
    { title: 'Service Analysis', icon: 'pie-chart', color: '#673ab7', route: '/service_analysis', module: 'service_reports' },
    { title: 'Project Report', icon: 'business', color: '#607d8b', route: '/projects', module: 'organizations', bucket: 'sales' },
];

// Lead → quotation → order → payment → dues, then the two reports.
// Leads (and Service Call / Task) live in the bottom bar, so not repeated here.
export const SALES_ITEMS: MenuItemDef[] = [
    { title: 'Leads Board', icon: 'albums', color: '#00897b', route: '/leads_board', module: 'leads' },
    { title: 'Quotations', icon: 'document-text', color: '#1565c0', route: '/quotations', module: 'quotations' },
    { title: 'Order Booking', icon: 'cart', color: '#ff9800', route: '/orders', module: 'orders' },
    { title: 'Collect Payment', icon: 'cash', color: '#27ae60', route: '/payment_collection', module: 'payment_coll' },
    { title: 'Pending Dues', icon: 'time', color: '#c0392b', route: '/payment_duelist', module: 'payment_due' },
    { title: 'Sales Trends', icon: 'stats-chart', color: '#4caf50', route: '/sales_analysis', module: 'sales_analysis' },
    { title: 'Team Performance', icon: 'trophy', color: '#8e24aa', route: '/sales_team_report', module: 'sales_team_report' },
];

export const SIDEBAR_ITEMS: MenuItemDef[] = [
    { id: '999', title: 'Super Admin Panel', icon: 'globe', route: '/superadmin/super_admin', module: 'superadmin_only' },
    { id: '1', title: 'Serial Number', icon: 'pricetag', route: '/serial_number', module: 'asset_history' },
    { id: '7', title: 'Attendance Report', icon: 'person', route: '/attendance', module: 'attendance' },
    { id: '5', title: 'Spare Part Book', icon: 'book', route: '/spare_parts', module: 'spares' },
    { id: '100', title: 'Product Master', icon: 'cube', route: '/product_master', module: 'catalogs' },
    { id: '96', title: 'Personal Notes', icon: 'journal', route: '/personal_notes', module: 'personal_notes' },
    { id: '93', title: 'Activity Timeline', icon: 'time', route: '/employee_timeline', module: 'users' },
    { id: '103', title: 'WhatsApp & Email', icon: 'chatbubbles', route: '/messaging_center', module: 'company_profile' },
    { id: '92', title: 'Team & Settings', icon: 'settings', route: '/manage_team', module: 'users' },
    { id: '90', title: 'Company Profile', icon: 'business', route: '/company_profile', module: 'company_profile' },
    { id: '104', title: 'Plan & Renewal', icon: 'rocket', route: '/SubscriptionScreen', module: 'plan_renewal' },
    { id: '102', title: 'Help & Support', icon: 'help-circle', route: '/help_support', module: 'common' },
];

// Bottom bar (phone) — checked with canSeeTab(), not canSeeModule().
export const NAV_TABS: MenuItemDef[] = [
    { title: 'Home', icon: 'home', route: '/', module: 'common' },
    { title: 'Act Plan', icon: 'calendar', route: '/activity_plan', module: 'activity' },
    { title: 'Task', icon: 'checkbox', route: '/tasks', module: 'tasks' },
    { title: 'Leads', icon: 'funnel', route: '/leads', module: 'leads' },
    { title: 'Service', icon: 'settings', route: '/service_call', module: 'tickets' },
    { title: 'Org', icon: 'people', route: '/organization', module: 'organizations' },
];

// Sensible starting permissions per role, used ONLY for a role Admin has
// never touched in Team & Settings → Permissions (no key for it exists yet in
// the saved permissions blob). The moment Admin saves any change for a role,
// that role's saved settings take over completely.
const COMMON_DEFAULTS = ['dashboard', 'calendar', 'attendance', 'leave', 'travel', 'payroll', 'advance', 'expenses'];
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    'Sales Executive': [...COMMON_DEFAULTS, 'organizations', 'leads', 'quotations', 'orders', 'visits', 'demos', 'sales_analysis', 'catalogs', 'sales_team_report', 'map_view', 'courier', 'asset_history', 'payment_due', 'payment_coll'],
    'Service Engineer': [...COMMON_DEFAULTS, 'organizations', 'tickets', 'service_reports', 'pms', 'installation', 'amc_cmc', 'spares', 'map_view', 'courier', 'asset_history'],
    'Accountant': [...COMMON_DEFAULTS, 'organizations', 'payment_due', 'payment_coll', 'orders'],
    'Store Keeper': [...COMMON_DEFAULTS, 'organizations', 'spares', 'courier', 'asset_history', 'installation'],
    'Hr': [...COMMON_DEFAULTS],
    'Manager': [...COMMON_DEFAULTS, 'leads', 'quotations', 'orders', 'visits', 'demos', 'sales_analysis', 'catalogs', 'sales_team_report', 'map_view', 'tickets', 'service_reports', 'pms', 'installation', 'amc_cmc', 'spares', 'courier', 'organizations', 'asset_history', 'company_profile', 'payment_due', 'payment_coll'],
};
