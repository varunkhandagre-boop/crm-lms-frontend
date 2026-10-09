import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';
import { recordLocationLog } from '../services/api/locationLogs';

/**
 * Work-hours location tracking that keeps going when the app is in the
 * background or closed, as an Android location foreground service with a
 * notification. Started while the app is open (Day In / app start), so it only
 * needs "while using the app" permission — no "Allow all the time", no
 * ACCESS_BACKGROUND_LOCATION. Starts at Day In, stops at Day Out / logout / next day.
 *
 * Both this task and the in-app watcher in _layout.tsx go through
 * recordThrottledLocation(), so there is at most one log per 30 minutes.
 */

export const BACKGROUND_LOCATION_TASK = 'lms-background-location';

const LAST_LOG_KEY = 'bg_location_last_log';
const ACTIVE_DAY_KEY = 'bg_location_active_day';
const DISCLOSURE_KEY = 'bg_location_disclosure_ok';
const LOG_EVERY_MS = 30 * 60 * 1000;

// Expo Go can't run background location; real builds can.
const isExpoGo = Constants.appOwnership === 'expo';

function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Posts a location log unless one was posted in the last 30 minutes. Never throws. */
export async function recordThrottledLocation(coords: { latitude: number; longitude: number }, source: 'App' | 'Background'): Promise<void> {
    try {
        const last = Number(await AsyncStorage.getItem(LAST_LOG_KEY)) || 0;
        const now = Date.now();
        if (last && now - last < LOG_EVERY_MS) return;
        await AsyncStorage.setItem(LAST_LOG_KEY, String(now));
        await recordLocationLog({
            latitude: coords.latitude,
            longitude: coords.longitude,
            type: 'Auto-Track (30 min)',
            device: source === 'Background' ? 'App (background)' : 'App',
        });
    } catch (e: any) {
        // 401 = logged out; anything else is retried on the next fix.
        if (e?.status !== 401) console.log('Location log failed:', e?.message);
    }
}

// Must be defined at module load (imported from app/_layout.tsx), so Android
// can run it when the app was closed.
if (!isExpoGo && Platform.OS !== 'web') {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
        if (error) return;
        const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
        const latest = locations?.[locations.length - 1];
        if (!latest) return;

        // Day changed without a Day Out: stop until the next Day In.
        const activeDay = await AsyncStorage.getItem(ACTIVE_DAY_KEY);
        if (activeDay !== todayYmd()) {
            await stopBackgroundTracking();
            return;
        }
        await recordThrottledLocation(latest.coords, 'Background');
    });
}

/** Prominent disclosure before tracking starts. Shown once; returns false if the user says no. */
async function confirmDisclosure(): Promise<boolean> {
    if ((await AsyncStorage.getItem(DISCLOSURE_KEY)) === 'yes') return true;
    const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
            'Location during work hours',
            'LMS records your location every 30 minutes between Day In and Day Out, also while the app is in the background, so your manager can see field visits on the Live Map. ' +
                'A notification is shown while it is on, and tracking stops automatically at Day Out.',
            [
                { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Continue', onPress: () => resolve(true) },
            ],
            { cancelable: false },
        );
    });
    if (ok) await AsyncStorage.setItem(DISCLOSURE_KEY, 'yes');
    return ok;
}

/**
 * Call after a successful Day In, while the app is on screen (Android only lets a
 * location foreground service start from the foreground). Falls back to the in-app
 * watcher if the user says no.
 */
export async function startBackgroundTracking(): Promise<boolean> {
    if (isExpoGo || Platform.OS !== 'android') return false;
    try {
        await AsyncStorage.setItem(ACTIVE_DAY_KEY, todayYmd());

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return false;
        if (!(await confirmDisclosure())) return false;

        if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return true;
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10 * 60 * 1000,
            distanceInterval: 100,
            pausesUpdatesAutomatically: false,
            foregroundService: {
                notificationTitle: 'LMS — on duty',
                notificationBody: 'Location is shared until Day Out.',
                notificationColor: '#3b5998',
                killServiceOnDestroy: false,
            },
        });
        return true;
    } catch (e: any) {
        console.log('Background tracking not started:', e?.message);
        return false;
    }
}

/** Call at Day Out and logout. Safe to call when not running. */
export async function stopBackgroundTracking(): Promise<void> {
    await AsyncStorage.removeItem(ACTIVE_DAY_KEY).catch(() => undefined);
    if (isExpoGo || Platform.OS === 'web') return;
    try {
        if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
    } catch (e: any) {
        console.log('Stop background tracking failed:', e?.message);
    }
}

/**
 * On app start: keep tracking only if Day In was today and not yet Day Out
 * (re-starts the service if Android stopped it, e.g. after a reboot).
 */
export async function syncBackgroundTracking(): Promise<void> {
    if (isExpoGo || Platform.OS !== 'android') return;
    const activeDay = await AsyncStorage.getItem(ACTIVE_DAY_KEY).catch(() => null);
    if (activeDay === todayYmd()) {
        // Only after the user already agreed — never pops the disclosure on app start.
        if ((await AsyncStorage.getItem(DISCLOSURE_KEY)) === 'yes') await startBackgroundTracking();
    } else {
        await stopBackgroundTracking();
    }
}
