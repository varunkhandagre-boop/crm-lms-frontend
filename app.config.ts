import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time additions on top of app.json:
 *
 * 1. Android Google Maps key, injected so it is never committed to git.
 *    The key still ends up inside the APK (Google requires it in AndroidManifest),
 *    so it must also be restricted in Google Cloud to com.crm.lms + our SHA-1s.
 *    - EAS builds: EAS environment variable GOOGLE_MAPS_ANDROID_KEY (preview + production)
 *    - local native builds (npx expo run:android): .env.local (git-ignored)
 *    - Expo Go: not needed
 *
 * 2. Day In → Day Out tracking (utils/backgroundLocation.ts) runs as a location
 *    foreground service started while the app is open. That only needs "while using
 *    the app" location — NOT ACCESS_BACKGROUND_LOCATION, which would need a separate
 *    Play Console declaration + review. FOREGROUND_SERVICE_LOCATION is already declared
 *    in Play Console. ACCESS_BACKGROUND_LOCATION is blocked so no library can add it.
 */
const FOREGROUND_SERVICE_PERMISSIONS = [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
];

export default ({ config }: ConfigContext): ExpoConfig => {
    const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY ?? '';
    const profile = process.env.EAS_BUILD_PROFILE;

    if (!mapsKey && (profile === 'production' || profile === 'preview')) {
        console.warn(`⚠️  GOOGLE_MAPS_ANDROID_KEY is not set for the "${profile}" build — maps will be blank.`);
    }

    const plugins = (config.plugins ?? []).map((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        const options = Array.isArray(plugin) && plugin[1] ? plugin[1] : {};
        if (name === 'react-native-maps') {
            return ['react-native-maps', { ...options, androidGoogleMapsApiKey: mapsKey }] as [string, unknown];
        }
        if (name === 'expo-location') {
            return [
                'expo-location',
                {
                    ...options,
                    isAndroidBackgroundLocationEnabled: false,
                    isAndroidForegroundServiceEnabled: true,
                },
            ] as [string, unknown];
        }
        return plugin;
    });

    const permissions = Array.from(new Set([...(config.android?.permissions ?? []), ...FOREGROUND_SERVICE_PERMISSIONS]))
        .filter((p) => p !== 'android.permission.ACCESS_BACKGROUND_LOCATION');
    const blockedPermissions = Array.from(new Set([...(config.android?.blockedPermissions ?? []), 'android.permission.ACCESS_BACKGROUND_LOCATION']));

    return { ...config, plugins, android: { ...config.android, permissions, blockedPermissions } } as ExpoConfig;
};
