import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// @ts-ignore
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🔥 FIX: TypeScript Error Bypass
// @ts-ignore: Firebase types me kabhi-kabhi ye function list nahi hota, but exist karta hai
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAF_6ZhDv1V5kRMuy82mo0mFOi3fFskKsE",
  authDomain: "lms-crm-e79ec.firebaseapp.com",
  projectId: "lms-crm-e79ec",
  storageBucket: "lms-crm-e79ec.firebasestorage.app",
  messagingSenderId: "825295836304",
  appId: "1:825295836304:web:1d61a9c6182118d05c7415"
};

// 1. App Initialize (Hot Reload Fix)
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// 2. 🔥 Auth Initialize with Persistence
let auth: any;

try {
  // @ts-ignore: Persistence type error fix
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  // console.log("⚠️ Auth Persistence Error:", e);
  auth = getAuth(app);
}

// 3. Database Initialize
const db = getFirestore(app);
const storage = getStorage(app);
export { auth, db, firebaseConfig, storage };

