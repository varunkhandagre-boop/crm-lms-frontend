import { apiClient } from './client';

export interface AlertSettingItem {
  key: string;
  module: 'sales' | 'service' | 'hr';
  label: string;
  description: string;
  recipients: string;
  defaultTime: string; // "HH:MM" IST
  enabled: boolean;
  time: string;        // "HH:MM" IST
}

export async function fetchAlertSettings(): Promise<AlertSettingItem[]> {
  const res = await apiClient.get<{ data: AlertSettingItem[] }>('/alert-settings');
  return res.data;
}

export async function saveAlertSetting(key: string, change: { enabled?: boolean; time?: string }): Promise<AlertSettingItem[]> {
  const res = await apiClient.put<{ data: AlertSettingItem[] }>(`/alert-settings/${key}`, change);
  return res.data;
}
