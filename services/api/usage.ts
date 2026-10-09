import { apiClient } from './client';

/** Counts one app open for the company (SuperAdmin usage stats). Never throws. */
export async function trackAppOpen(): Promise<void> {
  try {
    await apiClient.post('/track/app-open');
  } catch {
    // usage counting must never affect the app
  }
}
