import { DEFAULT_ON_TABS, MENU_TAG_BUCKET } from '../constants/modules';
import { DEFAULT_ROLE_PERMISSIONS, MenuItemDef } from '../constants/menuItems';

export type MenuAccessCtx = {
    currentUser: { id?: string; email?: string; role?: string } | null | undefined;
    companyProfile: { enabledModules?: string[] } | null | undefined;
    appPermissions: Record<string, any> | null | undefined;
};

/** Company has the module's bucket (HR / Sales / Service). SuperAdmin is not tied to a plan. */
function companyHas(moduleKey: string, ctx: MenuAccessCtx): boolean {
    const bucket = MENU_TAG_BUCKET[moduleKey];
    const myRole = (ctx.currentUser?.role || '').toLowerCase().trim();
    return !bucket || myRole === 'superadmin' || (ctx.companyProfile?.enabledModules || []).includes(bucket);
}

/** Maps any stored role / designation to the key used in Team & Settings → Permissions. */
export function permissionRoleKey(role: string): string {
    const r = role.toLowerCase().trim();
    if (r.includes('sales')) return 'Sales Executive';
    if (r.includes('engineer') || r.includes('service')) return 'Service Engineer';
    if (r.includes('account')) return 'Accountant';
    if (r.includes('store') || r.includes('back office')) return 'Store Keeper';
    if (r.includes('hr')) return 'Hr';
    if (r.includes('manager')) return 'Manager';
    return role;
}

/** Per-user switch, then the role's saved switches, then the role's starting defaults. */
function permitted(moduleKey: string, ctx: MenuAccessCtx, defaultOn: boolean): boolean {
    const { currentUser, appPermissions } = ctx;
    const roleKey = permissionRoleKey(currentUser?.role || '');
    const userPerms = appPermissions?.[currentUser?.id || ''] || appPermissions?.[currentUser?.email || ''] || {};
    if (userPerms[moduleKey] !== undefined) return userPerms[moduleKey] === true;
    const rolePerms = appPermissions?.[roleKey];
    if (rolePerms === undefined) return defaultOn || (DEFAULT_ROLE_PERMISSIONS[roleKey] || []).includes(moduleKey);
    if (defaultOn) return rolePerms[moduleKey] !== false;
    return rolePerms[moduleKey] === true;
}

const isAdminRole = (role?: string) => ['admin', 'superadmin'].includes((role || '').toLowerCase().trim());

/** Home grid / sidebar items. */
export function canSeeModule(moduleKey: string, ctx: MenuAccessCtx): boolean {
    const { currentUser } = ctx;
    if (!currentUser?.role) return false;
    if (moduleKey === 'common') return true;
    if (moduleKey === 'superadmin_only') return currentUser.role === 'SuperAdmin';
    if (!companyHas(moduleKey, ctx)) return false;
    // Personal Notes: every employee, as long as the company has HR at all.
    if (moduleKey === 'personal_notes') return true;
    if (isAdminRole(currentUser.role)) return true;
    return permitted(moduleKey, ctx, false);
}

/**
 * Bottom-bar tabs. Same rules as the home grid; Activity Plan and Tasks are on
 * for everyone until switched off in Permissions.
 */
export function canSeeTab(moduleKey: string, ctx: MenuAccessCtx): boolean {
    if (moduleKey === 'common') return true;
    if (!ctx.currentUser?.role) return false;
    if (!companyHas(moduleKey, ctx)) return false;
    if (isAdminRole(ctx.currentUser.role)) return true;
    return permitted(moduleKey, ctx, DEFAULT_ON_TABS.includes(moduleKey));
}

/** Modules the company's plan does not include are hidden from Permissions too. */
export function planIncludes(moduleKey: string, ctx: MenuAccessCtx): boolean {
    return companyHas(moduleKey, ctx);
}

const bucketOk = (item: MenuItemDef, ctx: MenuAccessCtx) =>
    !item.bucket || (ctx.currentUser?.role || '').toLowerCase().trim() === 'superadmin' || (ctx.companyProfile?.enabledModules || []).includes(item.bucket);

// 'plan_renewal' has no permission switch, so only Admin passes canSeeModule.
export const visibleItems = (items: MenuItemDef[], ctx: MenuAccessCtx) =>
    items.filter((i) => bucketOk(i, ctx) && canSeeModule(i.module, ctx));
