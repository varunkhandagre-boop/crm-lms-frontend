// Shifts + Shift Roster (backend: src/routes/shifts.routes.ts).
// A date's shift: roster entry → employee's default shift → shift times in
// the weekly schedule. A shift whose end is before its start ends next day.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "./client";
import { localYmd, MY_ROSTER_KEY, MyRosterDay } from "../../utils/workSchedule";

export interface Shift {
  id: string;
  name: string;
  startTime: string; // "HH:MM"
  endTime: string;
  graceMinutes: number;
  isActive: boolean;
}

export interface RosterDay {
  shiftId: string | null;
  name: string | null;
  start: string | null;
  end: string | null;
  overnight: boolean;
  off: boolean; // roster Off, or a weekly off with no roster entry
  source: "roster" | "default" | "schedule" | "none";
}

export interface RosterUser {
  id: string;
  name: string;
  role: string;
  jobTitle: string | null;
  defaultShiftId: string | null;
  days: Record<string, RosterDay>; // "YYYY-MM-DD" → day
}

export interface Roster {
  fromDate: string;
  toDate: string;
  holidays: { date: string; name: string }[];
  users: RosterUser[];
}

// shift: a shift id, "off", or "default" (remove the roster entry)
export interface RosterChange {
  userIds: string[];
  fromDate: string;
  toDate: string;
  shift: string;
}

interface OneResponse<T> {
  data: T;
}

export async function fetchShifts(includeInactive = false): Promise<Shift[]> {
  const res = await apiClient.get<OneResponse<Shift[]>>(`/shifts${includeInactive ? "?includeInactive=true" : ""}`);
  return res.data ?? [];
}

export async function createShift(input: { name: string; startTime: string; endTime: string; graceMinutes: number }): Promise<Shift> {
  return (await apiClient.post<OneResponse<Shift>>(`/shifts`, input)).data;
}

export async function updateShift(id: string, input: Partial<{ name: string; startTime: string; endTime: string; graceMinutes: number }>): Promise<Shift> {
  return (await apiClient.patch<OneResponse<Shift>>(`/shifts/${id}`, input)).data;
}

export async function deleteShift(id: string): Promise<void> {
  await apiClient.delete(`/shifts/${id}`);
}

// userId omitted = own roster; "all" = everyone (office roles)
export async function fetchRoster(fromDate: string, toDate: string, userId?: string): Promise<Roster> {
  const qs = `fromDate=${fromDate}&toDate=${toDate}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;
  return (await apiClient.get<OneResponse<Roster>>(`/shifts/roster?${qs}`)).data;
}

export async function saveRoster(changes: RosterChange[]): Promise<{ changed: number }> {
  return (await apiClient.put<OneResponse<{ changed: number }>>(`/shifts/roster`, { changes })).data;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Ends on the next day (22:00–06:00).
export const isOvernightShift = (start?: string | null, end?: string | null) => !!start && !!end && toMin(end) <= toMin(start);

// "22:00–06:00 (next day)"
export const shiftTimeLabel = (start?: string | null, end?: string | null) =>
  start && end ? `${start}–${end}${isOvernightShift(start, end) ? " (next day)" : ""}` : "";

// Own roster from yesterday to a week ahead, cached for the local Day In /
// Day Out reminders (utils/notificationHelper.ts). Returns the days.
export async function cacheMyRoster(): Promise<Record<string, MyRosterDay>> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const roster = await fetchRoster(localYmd(from), localYmd(to));
  const days: Record<string, MyRosterDay> = {};
  for (const [ymd, d] of Object.entries(roster.users[0]?.days ?? {})) days[ymd] = { start: d.start, end: d.end, off: d.off };
  await AsyncStorage.setItem(MY_ROSTER_KEY, JSON.stringify(days)).catch(() => {});
  return days;
}
