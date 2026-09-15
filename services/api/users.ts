// 🔥 Users API adapter (Postgres) — real backend user ids, unlike
// fetchSaaSData("users") which still reads Firestore (whose doc ids are
// NOT valid Postgres uuids). fetchUsers() (minimal) powers Assign-To /
// employee-filter pickers everywhere; the full-profile functions power
// the Manage Team → Users screen (office roles only, enforced server-side).
import { apiClient } from "./client";

export interface PickerUser {
  id: string;
  name: string;
  role: string;
}

export interface LegacyTeamMember {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  status: 'Active' | 'Disabled'; // mapped from isActive for the existing UI
  empId: string;
  joiningDate: string; // YYYY-MM-DD
  monthlyTarget: string;
  baseSalary: string;
  yearlyLeaves: string;
  personalEmail: string;
  personalMobile: string;
  bloodGroup: string;
  address: string;
  city: string;
  state: string;
  permanentAddress: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  bankDetails: string; // "{bankName} - {accountNo} ({ifscCode})", matches old display string
  aadhar: string;
  pan: string;
  assetNotes: string;
  profileImage: string | null;
}

interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }
interface OneResponse<T> { data: T; }

function toLegacyTeamMember(u: any): LegacyTeamMember {
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? '',
    mobile: u.mobile ?? '',
    role: u.role,
    status: u.isActive === false ? 'Disabled' : 'Active',
    empId: u.empId ?? '',
    joiningDate: (u.joiningDate || '').slice(0, 10),
    monthlyTarget: u.monthlyTarget != null ? String(u.monthlyTarget) : '0',
    baseSalary: u.baseSalary != null ? String(u.baseSalary) : '0',
    yearlyLeaves: u.yearlyLeaves != null ? String(u.yearlyLeaves) : '18',
    personalEmail: u.personalEmail ?? '',
    personalMobile: u.personalMobile ?? '',
    bloodGroup: u.bloodGroup ?? '',
    address: u.address ?? '',
    city: u.city ?? '',
    state: u.state ?? '',
    permanentAddress: u.permanentAddress ?? '',
    bankName: u.bankName ?? '',
    accountNo: u.bankAccountNo ?? '',
    ifscCode: u.bankIfsc ?? '',
    bankDetails: `${u.bankName ?? ''} - ${u.bankAccountNo ?? ''} (${u.bankIfsc ?? ''})`,
    aadhar: u.aadhar ?? '',
    pan: u.pan ?? '',
    assetNotes: u.assetNotes ?? '',
    profileImage: u.profileImage ?? null,
  };
}

// Minimal list (active only, id/name/role) — Assign-To / employee-filter pickers.
export async function fetchUsers(): Promise<PickerUser[]> {
  const res = await apiClient.get<ListResponse<PickerUser>>(`/users`);
  return res.data ?? [];
}

// Self profile (any role, no gate) — powers profile.tsx.
export async function fetchSelf(): Promise<LegacyTeamMember> {
  const res = await apiClient.get<OneResponse<any>>(`/users/me`);
  return toLegacyTeamMember(res.data);
}

// Full HR profile list, including disabled users — Manage Team screen (office roles only).
export async function fetchTeamMembers(): Promise<LegacyTeamMember[]> {
  try {
    const res = await apiClient.get<ListResponse<any>>(`/users?full=true`);
    return (res.data ?? []).map(toLegacyTeamMember);
  } catch (err: any) {
    // FIELD_USER roles don't have permission for full=true (office-roles
    // only, enforced server-side) — this is expected for them, not a bug.
    // Fall back to the basic (non-full) user list instead of crashing the
    // 25+ screens that call this for dropdowns/assignment-pickers.
    if (err?.response?.status === 403 || err?.status === 403) {
      try {
        const fallback = await apiClient.get<ListResponse<any>>(`/users`);
        return (fallback.data ?? []).map(toLegacyTeamMember);
      } catch {
        return [];
      }
    }
    console.log('fetchTeamMembers failed:', err);
    return [];
  }
}

export async function createTeamMember(payload: {
  name: string; email: string; password: string; mobile?: string; role: string;
  empId?: string; joiningDate?: string; monthlyTarget?: number; baseSalary?: number; yearlyLeaves?: number;
  personalEmail?: string; personalMobile?: string; bloodGroup?: string;
  address?: string; city?: string; state?: string; permanentAddress?: string;
  bankName?: string; bankAccountNo?: string; bankIfsc?: string;
  aadhar?: string; pan?: string; assetNotes?: string;
}) {
  const res = await apiClient.post<OneResponse<any>>(`/users`, payload);
  return { success: true, id: res.data?.id, record: toLegacyTeamMember(res.data) };
}

export async function updateTeamMember(id: string, payload: Partial<{
  name: string; mobile: string; empId: string; joiningDate: string; monthlyTarget: number; baseSalary: number; yearlyLeaves: number;
  personalEmail: string; personalMobile: string; bloodGroup: string;
  address: string; city: string; state: string; permanentAddress: string;
  bankName: string; bankAccountNo: string; bankIfsc: string;
  aadhar: string; pan: string; assetNotes: string; password: string; profileImage: string;
}>) {
  const res = await apiClient.patch<OneResponse<any>>(`/users/${id}`, payload);
  return { success: true, record: toLegacyTeamMember(res.data) };
}

export async function setTeamMemberStatus(id: string, isActive: boolean) {
  const res = await apiClient.patch<OneResponse<any>>(`/users/${id}/status`, { isActive });
  return { success: true, record: toLegacyTeamMember(res.data) };
}

export async function bulkSetTeamMemberStatus(userIds: string[], isActive: boolean): Promise<{ updatedCount: number }> {
  const res = await apiClient.patch<OneResponse<{ updatedCount: number }>>('/users/bulk-status', { userIds, isActive });
  return res.data;
}

export async function savePushTokenToBackend(pushToken: string): Promise<void> {
  await apiClient.patch<OneResponse<any>>(`/users/me/push-token`, { pushToken });
}

export interface BulkUserRow {
  name: string;
  email: string;
  mobile?: string;
  roleText: string;
  empId?: string;
  joiningDate?: string;
  monthlyTarget?: number;
  baseSalary?: number;
}

export interface BulkUserPreviewItem {
  row: BulkUserRow;
  status: 'new' | 'existing' | 'invalid';
  existingId?: string;
  error?: string;
}

export async function previewBulkUserImport(rows: BulkUserRow[]): Promise<BulkUserPreviewItem[]> {
  const res = await apiClient.post<{ data: BulkUserPreviewItem[] }>('/users/bulk-import/preview', { rows });
  return res.data;
}

export async function commitBulkUserImport(rows: BulkUserRow[]): Promise<{ created: number; skipped: number; defaultPassword: string; errors: string[] }> {
  const res = await apiClient.post<{ data: { created: number; skipped: number; defaultPassword: string; errors: string[] } }>('/users/bulk-import/commit', { rows });
  return res.data;
}