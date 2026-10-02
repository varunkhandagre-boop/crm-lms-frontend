import { apiClient } from './client';

// Leads from the company website form are created by the backend as normal
// CRM leads (source "Website - …"). These calls cover the extra bits: who
// they get assigned to, and the website/ads summary.

export interface WebsiteLeadSettings {
  /** Chosen owner for new website leads; null = default (company's first Admin). */
  assigneeId: string | null;
  /** Who will actually get the next website lead. */
  effectiveAssignee: { id: string; name: string } | null;
}

export async function getWebsiteLeadSettings(): Promise<WebsiteLeadSettings> {
  const res = await apiClient.get<{ data: WebsiteLeadSettings }>('/website-leads/settings');
  return res.data;
}

export async function updateWebsiteLeadSettings(assigneeId: string | null): Promise<WebsiteLeadSettings> {
  const res = await apiClient.put<{ data: WebsiteLeadSettings }>('/website-leads/settings', { assigneeId });
  return res.data;
}

export const isWebsiteLead = (source?: string | null) => !!source && source.toLowerCase().startsWith('website');
