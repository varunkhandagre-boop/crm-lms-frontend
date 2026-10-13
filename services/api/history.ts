import { apiClient } from './client';
import { toLegacyCourier } from './couriers';
import { toLegacyInstallation } from './installations';
import { toLegacyOrder } from './orders';
import { toLegacyPayment } from './paymentCollections';
import { toLegacyDue } from './paymentDues';
import { toLegacyPmsReport } from './pmsReports';
import { toLegacySalesVisit } from './salesVisits';
import { toLegacyServiceCall } from './serviceCalls';

// Serial Number / Hospital history: the server finds the matching records
// (by serial number, or by organization id / name) instead of the phone
// downloading every list. Each row keeps the old screen's shape.

const withService = (s: any) => ({ ...toLegacyServiceCall(s), senderName: s.assignedEngineer?.name || s.createdBy?.name });

export async function fetchMachineHistory(serialNo: string): Promise<{ services: any[]; pms: any[] }> {
  const res = await apiClient.get<{ data: { serviceCalls: any[]; pmsReports: any[] } }>(
    `/installations/machine-history?serialNo=${encodeURIComponent(serialNo)}`,
  );
  return { services: res.data.serviceCalls.map(withService), pms: res.data.pmsReports.map(toLegacyPmsReport) };
}

export interface OrgHistory {
  installs: any[]; services: any[]; pms: any[]; visits: any[]; couriers: any[];
  orders: any[]; payments: any[]; dues: any[]; // empty for non-finance roles
  summary: { installs: number; services: number; pms: number; visits: number; orders: number; payments: number; couriers: number; dues: number };
  finance: { totalValue: number; totalReceived: number; totalDues: number };
}

export async function fetchOrgHistory(orgId: string | undefined, orgName: string): Promise<OrgHistory> {
  const q = new URLSearchParams({ orgName });
  if (orgId) q.set('orgId', orgId);
  const res = await apiClient.get<{ data: any }>(`/installations/org-history?${q.toString()}`);
  const d = res.data;
  return {
    installs: d.installations.map(toLegacyInstallation),
    services: d.serviceCalls.map(withService),
    pms: d.pmsReports.map(toLegacyPmsReport),
    visits: d.salesVisits.map(toLegacySalesVisit),
    couriers: d.couriers.map(toLegacyCourier),
    orders: d.orders.map(toLegacyOrder),
    payments: d.payments.map(toLegacyPayment),
    dues: d.dues.map(toLegacyDue),
    summary: d.summary,
    finance: d.finance,
  };
}
