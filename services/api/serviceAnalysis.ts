import { apiClient } from './client';
import { toLegacyDemo } from './demos';
import { toLegacyInstallation } from './installations';
import { toLegacyPmsReport } from './pmsReports';
import { toLegacyServiceCall } from './serviceCalls';

export type ServiceReportType = 'All' | 'PMS' | 'Installation' | 'Breakdown' | 'Demo';

export interface ServiceAnalysisFilters {
  type: ServiceReportType;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;
  userId?: string;
  search?: string;
}

const isDone = (s: string) => ['done', 'completed', 'resolved', 'closed'].includes((s || '').toLowerCase());

/** One API row → the card shape the Master Reports screen draws. */
function toRow(kind: string, r: any): any {
  const by = r.createdBy?.name || 'Admin';
  if (kind === 'installation') {
    const i = toLegacyInstallation(r);
    return {
      ...i, reportType: 'Installation', displayDate: i.dateIso || i.createdAt, hospital: i.hospital || i.orgName || 'Unknown Client',
      engineer: i.engineer || by, engineerId: i.senderId, details: `Model: ${i.model || '-'} (${i.product || '-'})`,
      machineDisplay: i.productName || i.product || i.model || '-', serialDisplay: i.serialNo || '-', status: i.status || 'Installed',
    };
  }
  if (kind === 'pms') {
    const p = toLegacyPmsReport(r);
    return {
      ...p, reportType: 'PMS', displayDate: isDone(p.status) ? p.dateIso : p.dueDate, hospital: p.hospitalName || 'Unknown',
      engineer: by, engineerId: p.senderId, details: `Type: ${p.type || '-'}`,
      machineDisplay: p.machineName || '-', serialDisplay: p.serialNo || '-', status: p.status || 'Pending',
    };
  }
  if (kind === 'service') {
    const s = toLegacyServiceCall(r);
    return {
      ...s, reportType: 'Breakdown', displayDate: s.dateIso || s.createdAt, hospital: s.hospitalName || 'Unknown',
      engineer: r.assignedEngineer?.name || r.createdBy?.name || 'Admin', engineerId: s.assignedToId || s.senderId,
      details: s.remark || 'No Issue Listed', status: s.status || 'Pending', machineDisplay: s.machine || '-', serialDisplay: s.serialNo || '-',
    };
  }
  const d = toLegacyDemo(r);
  return {
    ...d, reportType: 'Demo', displayDate: d.dateIso || d.createdAt, hospital: d.hospital || 'Unknown',
    engineer: by, engineerId: d.senderId, details: `Result: ${d.result || 'Pending'}`,
    machineDisplay: d.product || '-', serialDisplay: '-', status: d.status || 'Pending',
  };
}

/** One page of installations + PMS + breakdowns + demos, newest first — merged and filtered on the server. */
export async function listServiceAnalysisPage(
  params: ServiceAnalysisFilters & { page: number; limit: number },
): Promise<{ items: any[]; total: number; totalPages: number }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
  const res = await apiClient.get<{ data: { kind: string; record: any }[]; meta: { total: number; totalPages: number } }>(
    `/service-calls/analysis-feed?${q.toString()}`,
  );
  // Keys must be unique across kinds (two tables can't share a uuid, but be safe).
  const items = res.data.map((x) => ({ ...toRow(x.kind, x.record), id: x.record.id, rowKey: `${x.kind}:${x.record.id}` }));
  return { items, total: res.meta.total, totalPages: res.meta.totalPages };
}
