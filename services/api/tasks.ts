// 🔥 Phase 8: Task API adapter (Postgres) — replaces Firestore "tasks" collection.
// `to`/`from` are now always populated (from the assignedTo/createdBy relations) —
// the old Firestore version never actually wrote a "from" field on create, so
// this closes a pre-existing gap rather than just mirroring it.
import { apiClient } from "./client";

export interface LegacyTask {
  id: string;
  task: string;     // title
  to: string;        // assignee name
  toUid: string;      // assignee id
  from: string;       // assigner name
  fromUid: string;
  priority: string;
  department: string;
  dueDate: string;    // DD/MM/YYYY
  dateIso: string;     // YYYY-MM-DD (createdAt date)
  createdAt: string;
  status: "Pending" | "Completed";
  remark: string;
  completionNote: string;
  completionRemarks: string; // alias some screens read
  completedAt: string;
  completedBy: string;       // name
}

interface ListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number }; }
interface OneResponse<T> { data: T; }

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function toDDMMYYYY(iso: string) {
  const [y, m, d] = (iso || "").slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function toLegacyTask(t: any): LegacyTask {
  return {
    id: t.id,
    task: t.title,
    to: t.assignedTo?.name ?? "",
    toUid: t.assignedToId,
    from: t.createdBy?.name ?? "",
    fromUid: t.createdById,
    priority: t.priority,
    department: t.department ?? "",
    dueDate: toDDMMYYYY((t.dueDate || "").slice(0, 10)),
    dateIso: (t.createdAt || "").slice(0, 10),
    createdAt: t.createdAt,
    status: t.status,
    remark: t.remark ?? "",
    completionNote: t.completionNote ?? "",
    completionRemarks: t.completionNote ?? "",
    completedAt: t.completedAt ?? "",
    completedBy: t.completedBy?.name ?? "",
  };
}

export async function fetchTasks(opts: {
  direction: "received" | "given";
  userId?: string; // omit = self; 'all' = every employee (office roles only)
  status?: "Pending" | "Completed";
  priority?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
}): Promise<LegacyTask[]> {
  const qs = buildQuery({
    direction: opts.direction,
    userId: opts.userId,
    status: opts.status,
    priority: opts.priority,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    search: opts.search,
    limit: opts.limit ?? 500,
  });
  const res = await apiClient.get<ListResponse<any>>(`/tasks${qs}`);
  return (res.data ?? []).map(toLegacyTask);
}

export async function createTask(payload: {
  title: string;
  assignedToId: string;
  priority: string;
  department?: string;
  dueDate?: string; // YYYY-MM-DD
  remark?: string;
}) {
  const res = await apiClient.post<OneResponse<any>>(`/tasks`, payload);
  return { success: true, id: res.data?.id, record: toLegacyTask(res.data) };
}

export async function completeTask(id: string, completionNote: string) {
  const res = await apiClient.patch<OneResponse<any>>(`/tasks/${id}/complete`, { completionNote });
  return { success: true, record: toLegacyTask(res.data) };
}
