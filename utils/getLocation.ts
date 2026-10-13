import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * One place for "where is the phone right now".
 *
 * The old screens called getCurrentPositionAsync({ accuracy: High/Highest })
 * with no timeout: indoors, or with "Google Location Accuracy" off, it can
 * wait forever or fail, and reverse-geocoding (the address) can throw on some
 * phones — either one failed the whole Day In / Day Out. Here every step has a
 * timeout and a fallback, and the error says what the user should do.
 */

export type LocationErrorCode = 'PERMISSION' | 'SERVICES_OFF' | 'NO_FIX';

export class LocationError extends Error {
    code: LocationErrorCode;
    constructor(code: LocationErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

const MESSAGES: Record<LocationErrorCode, string> = {
    PERMISSION: 'Location permission is off. Open phone Settings → Apps → LMS → Permissions → Location → "Allow".',
    SERVICES_OFF: 'Phone location (GPS) is off. Turn on Location from the quick settings and try again.',
    NO_FIX: 'Could not get your location. Turn on "Google Location Accuracy" (Settings → Location), step near a window or outside, and try again.',
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            () => { clearTimeout(timer); resolve(null); },
        );
    });
}

/** Permission + location services. Throws LocationError with a readable message. */
export async function ensureLocationReady(): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new LocationError('PERMISSION', MESSAGES.PERMISSION);

    let enabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!enabled && Platform.OS === 'android') {
        // Shows Android's "Turn on location?" dialog.
        await Location.enableNetworkProviderAsync().catch(() => undefined);
        enabled = await Location.hasServicesEnabledAsync().catch(() => false);
    }
    if (!enabled) throw new LocationError('SERVICES_OFF', MESSAGES.SERVICES_OFF);
}

/**
 * Current position: precise (15 s) → normal (10 s) → last known fix up to 5 min old.
 * Throws LocationError when nothing works.
 */
export async function getCurrentLocation(): Promise<Location.LocationObject> {
    await ensureLocationReady();

    const precise = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 15_000);
    if (precise) return precise;

    const normal = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 10_000);
    if (normal) return normal;

    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 }).catch(() => null);
    if (last) return last;

    throw new LocationError('NO_FIX', MESSAGES.NO_FIX);
}

/** Same as getCurrentLocation but never throws — for screens where location is optional. */
export async function tryGetCurrentLocation(): Promise<Location.LocationObject | null> {
    try {
        return await getCurrentLocation();
    } catch {
        return null;
    }
}

/**
 * Short address for a point ("Building, Street, Area, City"), or "" when the
 * phone's geocoder is unavailable or slow. Never throws.
 */
export async function getAddressFromCoords(coords: { latitude: number; longitude: number }): Promise<string> {
    const res = await withTimeout(Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude }), 8_000);
    const obj = res?.[0];
    if (!obj) return '';

    let building = obj.name || '';
    if (building.includes(',')) building = '';
    let street = obj.street || '';
    if (street === building) street = '';
    const city = obj.city || '';
    let area = obj.district || obj.subregion || '';
    if (area === city) area = '';
    return [building, street, area, city].filter(Boolean).join(', ');
}

/** "21.14560, 79.08820" — shown when there is no address. */
export function coordsText(coords: { latitude: number; longitude: number }): string {
    return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

/** Message for an Alert: the LocationError text, else a generic one. */
export function locationErrorMessage(error: unknown, fallback = 'Check GPS / internet and try again.'): string {
    return error instanceof LocationError ? error.message : (error as any)?.message || fallback;
}
