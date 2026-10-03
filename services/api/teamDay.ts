import { apiClient } from './client';

export interface TeamDayPerson {
  userId: string;
  name: string;
  visits: number;
  newLeads: number;
  websiteLeads: number;
  quotations: number;
  quotationValue: number;
  orders: number;
  orderValue: number;
}

export interface TeamDay {
  date: string;
  totals: Omit<TeamDayPerson, 'userId' | 'name'>;
  people: TeamDayPerson[];
}

/** One day's sales activity per person (Admin / Manager). date = YYYY-MM-DD, default today. */
export async function getTeamDay(date?: string): Promise<TeamDay> {
  const res = await apiClient.get<{ data: TeamDay }>(`/team-today${date ? `?date=${date}` : ''}`);
  return res.data;
}
