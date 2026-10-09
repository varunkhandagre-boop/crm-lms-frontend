import { apiClient } from './client';

export interface OfficeMachine {
  id: string;
  name: string;
  quantity: number;
  addedBy: string;
  createdAt: string;
}

interface ApiOfficeMachine {
  id: string;
  name: string;
  quantity: number;
  createdAt: string;
  createdBy?: { name: string } | null;
}

const toMachine = (m: ApiOfficeMachine): OfficeMachine => ({
  id: m.id,
  name: m.name,
  quantity: m.quantity,
  addedBy: m.createdBy?.name || '',
  createdAt: m.createdAt,
});

/** Office Stock list (a short list — sorted by name on the server). */
export async function listOfficeMachines(): Promise<OfficeMachine[]> {
  const res = await apiClient.get<{ data: ApiOfficeMachine[] }>('/office-machines?limit=500');
  return res.data.map(toMachine);
}

export async function createOfficeMachine(name: string, quantity: number): Promise<OfficeMachine> {
  const res = await apiClient.post<{ data: ApiOfficeMachine }>('/office-machines', { name, quantity });
  return toMachine(res.data);
}

export async function deleteOfficeMachine(id: string): Promise<void> {
  await apiClient.delete(`/office-machines/${id}`);
}
