import { apiClient } from './client';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  performedBy: {
    name: string;
    email: string;
  };
}

interface ListResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchAuditLogs(page: number = 1): Promise<{ data: AuditLogEntry[]; meta: any }> {
  const res = await apiClient.get<ListResponse<AuditLogEntry>>(`/audit-logs?page=${page}&limit=50`);
  return { data: res.data, meta: res.meta };
}
