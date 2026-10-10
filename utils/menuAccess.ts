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

/** Home grid / sidebar items (was canSee() in index.tsx). */
export function canSeeModule(moduleKey: string, ctx: MenuAccessCtx): boolean {
    const { currentUser, appPermissions } = ctx;
    if (!currentUser?.role) return false;
    if (moduleKey === 'common') return true;
    if (moduleKey === 'superadmin_only') return currentUser.role === 'SuperAdmin';
    if (!companyHas(moduleKey, ctx)) return false;
    // Personal Notes: every employee, as long as the company has HR at all.
    if (moduleKey === 'personal_notes') return true;

    const myRole = currentUser.role.toLowerCase().trim();
    if (myRole === 'admin' || myRole === 'superadmin') return true;

    let userRoleKey = currentUser.role;
    if (myRole.includes('sales')) userRoleKey = 'Sales Executive';
    else if (myRole.includes('engineer') || myRole.includes('service')) userRoleKey = 'Service Engineer';
    else if (myRole.includes('account')) userRoleKey = 'Accountant';
    else if (myRole.includes('store') || myRole.includes('back office')) userRoleKey = 'Store Keeper';
    else if (myRole.includes('hr')) userRoleKey = 'Hr';
    else if (myRole.includes('manager')) userRoleKey = 'Manager';

    const rolePerms = appPermissions?.[userRoleKey];
    const userPerms = appPermissions?.[currentUser.id || ''] || appPermissions?.[currentUser.email || ''] || {};
    if (userPerms[moduleKey] !== undefined) return userPerms[moduleKey] === true;
    // Role never configured by Admin → starting defaults.
    if (rolePerms === undefined) return (DEFAULT_ROLE_PERMISSIONS[userRoleKey] || []).includes(moduleKey);
    return rolePerms[moduleKey] === true;
}

/** Bottom-bar tabs (was canSeeTab() in _layout.tsx). */
export function canSeeTab(moduleKey: string, ctx: MenuAccessCtx): boolean {
    if (moduleKey === 'common') return true;
    const userRole = ctx.currentUser?.role || 'Service Engineer';
    if (!companyHas(moduleKey, { ...ctx, currentUser: { ...ctx.currentUser, role: userRole } })) return false;
    if (userRole === 'Admin' || userRole === 'SuperAdmin') return true;
    // A per-user switch in Admin Control → Permissions wins over the role switch.
    const userPerms = ctx.appPermissions?.[ctx.currentUser?.id || ''] || ctx.appPermissions?.[ctx.currentUser?.email || ''];
    if (userPerms?.[moduleKey] !== undefined) return userPerms[moduleKey] === true;
    const myPerms = ctx.appPermissions?.[userRole];
    if (!myPerms) return true;
    // Activity Plan and Tasks are on for everyone unless an admin switched them off.
    if (DEFAULT_ON_TABS.includes(moduleKey)) return myPerms[moduleKey] !== false;
    return myPerms[moduleKey] === true;
}

export const visibleItems = (items: MenuItemDef[], ctx: MenuAccessCtx) => items.filter((i) => canSeeModule(i.module, ctx));
