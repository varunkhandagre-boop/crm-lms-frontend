import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The installed app's own version ("3.2.2" from app.json). Phone builds send
// it with every API call so the server can ask old builds to update; the web
// app is always current and sends nothing.
export const APP_PLATFORM: 'android' | 'ios' | null =
    Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;

export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export function appVersionHeaders(): Record<string, string> {
    return APP_PLATFORM ? { 'X-App-Platform': APP_PLATFORM, 'X-App-Version': APP_VERSION } : {};
}
