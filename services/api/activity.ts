import { toLegacyActivityPlan } from './activityPlans';
import { toLegacyAdvance } from './advances';
import { apiClient } from './client';
import { toLegacyCourier } from './couriers';
import { toLegacyDemo } from './demos';
import { toLegacyExpense } from './expenses';
import { toLegacyInstallation } from './installations';
import { toLegacyLead } from './leads';
import { toLegacyOrder } from './orders';
import { toLegacyPayment } from './paymentCollections';
import { toLegacyDue } from './paymentDues';
import { toLegacyPmsReport } from './pmsReports';
import { toLegacySalesVisit } from './salesVisits';
import { toLegacyServiceCall } from './serviceCalls';
import { toLegacyTask } from './tasks';
import { toLegacyTravelNote } from './travelNotes';

export type ActivityModule =
  | 'orders' | 'payments' | 'dues' | 'couriers' | 'serviceCalls' | 'demos' | 'installations' | 'pms'
  | 'salesVisits' | 'leads' | 'expenses' | 'advances' | 'travelNotes' | 'tasks' | 'activityPlans';

const MAPPERS: Record<ActivityModule, (r: any) => any> = {
  orders: toLegacyOrder,
  payments: toLegacyPayment,
  dues: toLegacyDue,
  couriers: toLegacyCourier,
  serviceCalls: toLegacyServiceCall,
  demos: toLegacyDemo,
  installations: toLegacyInstallation,
  pms: toLegacyPmsReport,
  salesVisits: toLegacySalesVisit,
  leads: toLegacyLead,
  expenses: toLegacyExpense,
  advances: toLegacyAdvance,
  travelNotes: toLegacyTravelNote,
  tasks: toLegacyTask,
  activityPlans: toLegacyActivityPlan,
};

export type ActivityLists = Record<ActivityModule, any[]>;

/**
 * Every module's records for a date range (and optionally one person), in the
 * same shape as each list screen — for the Employee Timeline and its export.
 * Orders / payments / dues come back empty for roles that may not see money.
 */
export async function fetchActivity(opts: {
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  userId?: string;
  modules?: ActivityModule[];
}): Promise<ActivityLists> {
  const q = new URLSearchParams({ fromDate: opts.fromDate, toDate: opts.toDate });
  if (opts.userId) q.set('userId', opts.userId);
  if (opts.modules?.length) q.set('modules', opts.modules.join(','));
  const res = await apiClient.get<{ data: Record<ActivityModule, any[]> }>(`/dashboard/activity?${q.toString()}`);
  const out = {} as ActivityLists;
  (Object.keys(MAPPERS) as ActivityModule[]).forEach((m) => {
    out[m] = (res.data[m] ?? []).map(MAPPERS[m]);
  });
  return out;
}
