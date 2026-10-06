import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Injects the Android Google Maps key at build time so it is not committed to git.
 * The key still ends up inside the APK (Google requires it in AndroidManifest), so it
 * must also be restricted in Google Cloud to package com.crm.lms + our SHA-1s.
 *
 * Where the value comes from:
 *  - EAS builds: EAS environment variable GOOGLE_MAPS_ANDROID_KEY (preview + production)
 *  - local native builds (npx expo run:android): .env.local (git-ignored)
 *  - Expo Go: not needed
 */
export default ({ config }: ConfigContext): ExpoConfig => {
    const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY ?? '';
    const profile = process.env.EAS_BUILD_PROFILE;

    if (!mapsKey && (profile === 'production' || profile === 'preview')) {
        console.warn(`⚠️  GOOGLE_MAPS_ANDROID_KEY is not set for the "${profile}" build — maps will be blank.`);
    }

    const plugins = (config.plugins ?? []).map((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        if (name !== 'react-native-maps') return plugin;
        const options = Array.isArray(plugin) && plugin[1] ? plugin[1] : {};
        return ['react-native-maps', { ...options, androidGoogleMapsApiKey: mapsKey }] as [string, unknown];
    });

    return { ...config, plugins } as ExpoConfig;
};
