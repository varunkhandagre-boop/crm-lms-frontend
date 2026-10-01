// From SDK 57, simply importing expo-notifications throws inside Expo Go on
// Android (remote push was removed from Expo Go). Load the real module only in
// real builds (APK / Play Store) and give Expo Go a no-op stand-in, so the app
// can still be tested in Expo Go. Always import Notifications from here.
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

export const notificationsAvailable = !(Platform.OS === 'android' && isRunningInExpoGo());

// Every call returns an object that works both as a listener subscription
// (.remove()) and as a permission/token result ({ status, data }).
const noopResult = () => ({ remove() {}, status: 'denied', data: undefined });
const expoGoStub = new Proxy({}, { get: () => noopResult }) as unknown as NotificationsModule;

export const Notifications: NotificationsModule = notificationsAvailable
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-notifications')
  : expoGoStub;
