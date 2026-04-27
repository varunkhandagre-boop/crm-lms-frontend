import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

// 🔥 FIX: @ts-ignore is required because standard Firebase types default to Web environment
// @ts-ignore
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCGFct3YQpDM20ghkHPtqHyVvpC7ykgq0U",
  authDomain: "crm-lms-1.firebaseapp.com",
  projectId: "crm-lms-1",
  storageBucket: "crm-lms-1.firebasestorage.app",
  messagingSenderId: "93091272283",
  appId: "1:93091272283:web:9ef6df2ff1740d7293117e"
};

// 1. App Initialize (Safe Mode with Type)
let app: FirebaseApp;

if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

// 2. 🔥 Auth Initialize (With Explicit Type)
let auth: Auth;

try {
  // @ts-ignore: Persistence type workaround
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  // Agar App reload hua hai aur Auth pehle se hai
  auth = getAuth(app);
}

// 3. Database Initialize (With Types)
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// 4. Exports
export { auth, db, firebaseConfig, storage };
