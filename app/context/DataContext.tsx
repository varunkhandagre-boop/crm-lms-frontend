import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchCompanyProfile } from '../../services/api/companies';
import { fetchPermissions } from '../../services/api/permissions';


// 🔥 FIREBASE IMPORTS
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    query,
    setDoc,
    where
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { bridgeLogin, bridgeLogout, getStoredPostgresUser } from '../../services/api/authBridge';
import { clearAllListCaches } from '../../utils/listCache';
import { registerForPushNotificationsAsync, sendExpoPushNotification } from '../../utils/notificationHelper';

// --- DATA TYPES (🔥 SaaS Variables Added) ---
type User = { 
    id: string; 
    name: string; 
    email: string; 
    role: string; 
    empId: string; 
    mobile: string; 
    profileImage?: string | null; 
    companyId?: string;       // 🔥 SAAS FIELD
    isCompanyActive?: boolean; // 🔥 KILL SWITCH
};

const DataContext = createContext<any>(null);

// ---------------------------------------------------------------------------
// 🔥 CLEANUP (this session): this file used to be ~1400 lines — a giant
// "God Context" holding ~25 Firestore-backed lists (leadsList, orderList,
// orgList, taskList, ...) and ~35 matching addXxx/updateXxx/deleteXxx CRUD
// functions, plus a big real-time onSnapshot "Data Listeners" effect and a
// fetchStaticData() Firestore read (products/organizations/holidays) that
// ran on every login. All of that is now confirmed dead: every screen that
// needs any of that data fetches it itself via the Postgres REST API into
// its own local (often cache-first) state — the pattern used throughout
// this migration — and a full-project search for `useData()` destructuring
// each of those names came back empty. Removing it cuts real, continuous
// Firestore read/write cost and a lot of maintenance surface.
//
// What's left here is only what's still genuinely read from Context
// somewhere: auth (currentUser/login/logout), companyProfile,
// isSubscriptionExpired, appPermissions (both Postgres-backed),
// activeSection/shouldOpenSidebar (sidebar UI state), and addNotification
// (still called from ~28 screens — its in-app Firestore "notifications" doc
// is redundant now that the backend creates that doc itself server-side on
// these same actions, but addNotification is ALSO the only thing that
// dispatches Expo push notifications for them, and the backend doesn't
// send push itself — so this one function is deliberately left exactly as
// it was, not trimmed, since getting that wrong would silently break push
// notifications across ~28 screens).
// ---------------------------------------------------------------------------

export const DataProvider = ({ children }: any) => {
  const [activeSection, setActiveSection] = useState('HR'); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shouldOpenSidebar, setShouldOpenSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);
  // 🔥 isFirebaseSynced used to flip true only once the (now-removed)
  // Firestore userList onSnapshot listener fired for the first time — that
  // listener is gone, so this now just tracks "auth resolution has
  // happened" instead, which is what _layout.tsx's "Syncing..." pill
  // actually needs to stop showing.
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false); 

    // --- REFS FOR READ OPTIMIZATION ---
  const isPostgresSession = useRef(false); // true when currentUser came from bridgeLogin(), not Firebase — guards onAuthStateChanged from overwriting it
  const currentUserRef = useRef<User | null>(null);

  const [appPermissions, setAppPermissions] = useState<Record<string, any>>({});
  const [companyProfile, setCompanyProfile] = useState({
      companyName: 'Loading...',
      shortName: 'LMS',
      address: '',
      phone: '',
      email: '',
      gstNumber: '',
      bankDetails1: {},
      bankDetails2: {},
      logoUrl: '',
      signatureUrl: ''
  });

  // =========================================================
  // 📊 USAGE TRACKING - login aur app-open ka lightweight counter
  // =========================================================
  const trackUsage = async (userDocId: string, compId: string) => {
      try {
          // ── User ki last login ──────────────────────────
          const userRef = doc(db, "users", userDocId);
          await setDoc(userRef, {
              lastLogin: new Date().toISOString(),
              loginCount: increment(1),
          }, { merge: true });

          // ── ✅ FIX: companyId field se query karo ───────
          // Bug: pehle doc(db, "companies", compId) likhte the
          // compId ek field hai, direct document ID nahi hota
          const compQuery = query(
              collection(db, "companies"),
              where("companyId", "==", compId)
          );
          const compSnap = await getDocs(compQuery);

          if (!compSnap.empty) {
              const compDocRef = compSnap.docs[0].ref; // ✅ actual doc reference

              // Current month key — "2026-07" format
              const now = new Date();
              const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

              await setDoc(compDocRef, {
                  lastActiveAt: now.toISOString(),
                  appOpenCount: increment(1),
                  [`monthlyUsage.${monthKey}`]: increment(1),
              }, { merge: true });

              console.log(`📊 Usage tracked: ${compId} | ${monthKey}`);
          } else {
              console.log(`⚠️ trackUsage: No company found for companyId: ${compId}`);
          }
      } catch (e) {
          console.log("Usage tracking error (non-critical):", e);
      }
  };
  
    const fetchCompanySettings = async (companyId: string) => {
    if (!companyId) return;

    try {
        // AsyncStorage cache check — shows something instantly while the
        // network call below completes.
        const localProfile = await AsyncStorage.getItem('companyProfileLocal');
        if (localProfile) {
            const parsed = JSON.parse(localProfile);
            if (parsed.companyId === companyId) {
                setCompanyProfile(parsed);
            } else {
                await AsyncStorage.removeItem('companyProfileLocal');
            }
        }

        // 🔥 Now Postgres-backed — was previously querying Firestore
        // "company_profile"/"companies" collections directly, which never
        // reflected Storage-uploaded logo/signature URLs (those are written
        // to Postgres only, via the Company Profile edit screen).
        const data = await fetchCompanyProfile();

        const profileData = {
            companyId: companyId,
            ...data,
        };

        setCompanyProfile(profileData as any);
        await AsyncStorage.setItem('companyProfileLocal', JSON.stringify(profileData));

        // Expiry check
        if (data.expiryDate) {
            const today = new Date();
            const expiry = new Date(data.expiryDate);
            if (today > expiry) setIsSubscriptionExpired(true);
        }
    } catch (error) {
        console.log("Error fetching company settings:", error);
    }
};

  // =========================================================
  // 1. AUTH LISTENER & PUSH TOKEN SYNC
  // =========================================================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let finalRole = 'Service Engineer'; 
        let name = user.email?.split('@')[0] || "User";
        let mobile = "7030223345";
        const emailKey = user.email?.trim().toLowerCase() || ""; 

        let companyId = "";
        let isCompanyActive = true; 
        let userDocId = user.uid;

        try {
            const usersRef = collection(db, "users");
            let userData: any = null;

            const q = query(usersRef, where("email", "==", emailKey));
            const querySnap = await getDocs(q);

            if (!querySnap.empty) {
                userData = querySnap.docs[0].data();
                userDocId = querySnap.docs[0].id; 
            } else {
                let userDocSnap = await getDoc(doc(db, "users", user.uid));
                if (userDocSnap.exists()) {
                    userData = userDocSnap.data();
                    userDocId = user.uid; 
                }
            }

            if (userData) {
                companyId = userData.companyId || "";

                let dbRoleRaw = userData.role || '';
                let dbRole = dbRoleRaw.toLowerCase().trim();
                
                name = userData.name || name;
                if (userData.mobile) mobile = userData.mobile;

                if (dbRole === 'admin' || dbRole === 'superadmin') finalRole = 'Admin';
                else if (dbRole === 'engineer' || dbRole === 'service' || dbRole === '') finalRole = 'Service Engineer';
                else if (dbRole === 'sales' || dbRole === 'sales man') finalRole = 'Sales Executive';
                else if (dbRole === 'account' || dbRole === 'accountant') finalRole = 'Accountant';
                else if (dbRole === 'back office' || dbRole === 'store') finalRole = 'Store Keeper';
                else if (dbRole === 'hr') finalRole = 'Hr';
                else finalRole = userData.role; 

                const superAdmins = ["varunkhandagre@gmail.com", "admin@lms.com", "admin@mycrm.com"];
                if(superAdmins.includes(emailKey)) {
                    finalRole = "SuperAdmin";
                }

                if (companyId && finalRole !== "SuperAdmin") {
                    // 🔥 Now Postgres-backed — was previously querying
                    // Firestore "company_profile" directly for isActive/
                    // expiryDate. fetchCompanyProfile() already computes
                    // isActive from subscriptionStatus and returns expiryDate,
                    // so this reuses that instead of a separate Firestore read.
                    try {
                        const profile = await fetchCompanyProfile();
                        let active = profile.isActive !== false;

                        if (active && profile.expiryDate) {
                            const today = new Date().getTime();
                            const expiry = new Date(profile.expiryDate).getTime();
                            if (today > expiry) active = false;
                        }
                        isCompanyActive = active;
                        if (!active) setIsSubscriptionExpired(true);
                        else setIsSubscriptionExpired(false);
                    } catch (e) {
                        console.log("Subscription check failed:", e);
                    }
                }

            } else {
                if(emailKey === "varunkhandagre@gmail.com" || emailKey === "admin@mycrm.com") {
                    finalRole = "SuperAdmin";
                }
            }
            
            try {
                const token = await registerForPushNotificationsAsync();
                if (token) {
                    const userRefToUpdate = doc(db, "users", userDocId);
                    await setDoc(userRefToUpdate, { 
                        expoPushToken: token,
                        lastActive: new Date().toISOString() 
                    }, { merge: true });
                }
            } catch (tokenErr) {
                console.log("⚠️ Could not fetch/save push token:", tokenErr);
            }

        } catch (e) { console.log("⚠️ Auth Error:", e); }
        
        const newUser = {
            id: user.uid,
            name: name,
            email: user.email || "",
            role: finalRole, 
            empId: "EMP-" + user.uid.slice(0,4).toUpperCase(),
            profileImage: null,
            mobile: mobile,
            companyId: companyId,             
            isCompanyActive: isCompanyActive  
        };
        
        // Don't let a real Firebase session overwrite an active
        // Postgres-first session (e.g. a new employee who also happens to
        // have an old Firebase account from before).
        if (!isPostgresSession.current) {
            currentUserRef.current = newUser;
            setCurrentUser(newUser);
            console.log("🆔 companyId from userData:", companyId);
        }

        if (companyId) {
            console.log("✅ Calling fetchCompanySettings with:", companyId);
            fetchCompanySettings(companyId);
            trackUsage(userDocId, companyId);
        }

      } else {
        // No active Firebase session — before giving up, check for a
        // Postgres-only session (new employees created via the migrated
        // Users tab have no Firebase account, so this will always be null
        // for them; their session lives in AsyncStorage instead, written
        // by bridgeLogin()). Doing this HERE (inside the same async
        // callback, sequentially) instead of a separate timed effect
        // avoids a race with index.tsx's own login-redirect check.
        const stored = await getStoredPostgresUser();
        if (stored) {
            const restoredUser = {
                id: stored.id,
                name: stored.name,
                email: stored.email,
                role: stored.legacyRole || stored.role,
                empId: stored.empId || ("EMP-" + stored.id.slice(0, 4).toUpperCase()),
                profileImage: stored.profileImage || null,
                mobile: stored.mobile || '',
                companyId: stored.companyId,
                isCompanyActive: true,
            };
            currentUserRef.current = restoredUser;
            isPostgresSession.current = true;
            setCurrentUser(restoredUser);
        } else if (!isPostgresSession.current) {
            console.log("❌ companyId is EMPTY — fetchCompanySettings NOT called!");
            setCurrentUser(null);
            currentUserRef.current = null;
        }
      }
      setIsFirebaseSynced(true);
      setLoading(false);
    });
    return () => unsub();
  }, []);

    // =========================================================
  // 1B. BOOTSTRAP RESTORE — for Postgres-only sessions (new
  // employees created via the migrated Users tab, who have no
  // Firebase account for onAuthStateChanged to restore automatically).
  // Waits briefly for Firebase's own persisted-session check (above) to
  // finish first, so a real Firebase session always wins if one exists.
  // =========================================================
  useEffect(() => {
      const restoreTimer = setTimeout(async () => {
          if (currentUserRef.current) return; // Firebase already restored a session — nothing to do

          const stored = await getStoredPostgresUser();
          if (!stored) { setLoading(false); return; }

          const newUser = {
              id: stored.id,
              name: stored.name,
              email: stored.email,
              role: stored.legacyRole || stored.role,
              empId: stored.empId || ("EMP-" + stored.id.slice(0, 4).toUpperCase()),
              profileImage: stored.profileImage || null,
              mobile: stored.mobile || '',
              companyId: stored.companyId,
              isCompanyActive: true,
          };
          currentUserRef.current = newUser;
          isPostgresSession.current = true;
          setCurrentUser(newUser);
          setLoading(false);
      }, 600);

      return () => clearTimeout(restoreTimer);
  }, []);

  // =========================================================
  // 2. PERMISSIONS
  // =========================================================
  useEffect(() => {
      if (!currentUser) return;

      // 🔥 Now Postgres-backed — was previously a Firestore onSnapshot
      // listener on "settings_permissions", which never reflected changes
      // made via the (already-migrated) Permissions tab, since that writes
      // to Postgres only. A real-time listener isn't replicated here (REST
      // has no push) — permissions refresh on login and app-restart, which
      // matches how infrequently they change in practice.
      fetchPermissions()
          .then((perms) => setAppPermissions(perms || {}))
          .catch((e) => { console.log("fetchPermissions failed:", e); setAppPermissions({}); });
  }, [currentUser]);

  // ✅ Har 1 ghante mein plan expiry check
  useEffect(() => {
      if (!currentUser || currentUser.role === 'SuperAdmin') return;
      
      const interval = setInterval(() => {
          if (currentUser?.companyId) {
              fetchCompanySettings(currentUser.companyId);
          }
      }, 60 * 60 * 1000); // 1 ghanta = 3600000ms
      
      return () => clearInterval(interval);
  }, [currentUser]);

  // =========================================================
  // 🔔 NOTIFICATIONS — still Firestore for now. The in-app notification
  // list/badge itself is Postgres-backed (see app/notifications.tsx and
  // index.tsx's own unreadCount) and the backend already creates these
  // notification docs server-side for the actions that matter — but
  // addNotification is ALSO the only thing that looks up the target
  // user's Expo push token (from Firestore "users") and dispatches the
  // actual push notification, which the backend does not do itself. Left
  // exactly as it was; ~28 screens still call this specifically for that
  // push-dispatch side effect.
  // =========================================================
  const addNotification = async (notifData: any) => {
    try {
        // Firestore rejects any field with value `undefined` outright — strip
        // them before writing, since callers across the app don't always
        // guarantee every field is defined (e.g. `to`/`userId` when no
        // assignee was picked).
        const cleanNotifData = Object.fromEntries(
            Object.entries(notifData).filter(([, v]) => v !== undefined)
        );
        const docRef = await addDoc(collection(db, "notifications"), {
            ...cleanNotifData,
            companyId: currentUser?.companyId || '', 
            createdAt: new Date().toISOString(),
            read: false,
            senderId: currentUser?.id || 'app',
            senderName: currentUser?.name || 'App User'
        });
          await setDoc(docRef, { id: docRef.id }, { merge: true });

          if (notifData.userId) {
              const userDoc = await getDoc(doc(db, "users", notifData.userId));
              if (userDoc.exists()) {
                  const targetUser = userDoc.data();
                  if (targetUser.expoPushToken) {
                      await sendExpoPushNotification(
                          targetUser.expoPushToken, 
                          notifData.title, 
                          notifData.message, 
                          { route: notifData.route || '/' }
                      );
                  }
              }
          } else if (notifData.to) {
              const roleQuery = query(collection(db, "users"), where("role", "==", notifData.to), where("companyId", "==", currentUser?.companyId || ''));
              const roleSnap = await getDocs(roleQuery);
              
              roleSnap.forEach((userDoc: any) => {
                  const targetUser = userDoc.data();
                  if (targetUser.expoPushToken) {
                      sendExpoPushNotification(
                          targetUser.expoPushToken, 
                          notifData.title, 
                          notifData.message, 
                          { route: notifData.route || '/' }
                      );
                  }
              });
          }
          console.log("🔔 Notification Process Completed!");

      } catch (e) {
          console.error("❌ Add Notification Error:", e);
      }
  };

    const login = async (email: string, pass: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // 🔥 Postgres-first: try the new backend first. This is the ONLY
      // path that works for employees created via the already-migrated
      // Users tab — they have no Firebase account at all.
      try {
          const pgUser = await bridgeLogin(normalizedEmail, pass);

          if (pgUser) {
              await AsyncStorage.removeItem('companyProfileLocal');

              const newUser = {
                  id: pgUser.id,
                  name: pgUser.name,
                  email: pgUser.email,
                  role: pgUser.legacyRole || pgUser.role,
                  empId: pgUser.empId || ("EMP-" + pgUser.id.slice(0, 4).toUpperCase()),
                  profileImage: pgUser.profileImage || null,
                  mobile: pgUser.mobile || '',
                  companyId: pgUser.companyId,
                  isCompanyActive: true, // company active/expiry is enforced server-side on every API call now, no separate Firestore check needed here
              };

              currentUserRef.current = newUser;
              isPostgresSession.current = true;
              setCurrentUser(newUser);

              // Best-effort: also sign into Firebase with the same
              // credentials, so any not-yet-migrated Firestore-backed
              // screens keep working for staff who still have an old
              // Firebase account. A brand-new Postgres-only employee
              // simply has none — this silently no-ops for them.
              try {
                  await signInWithEmailAndPassword(auth, normalizedEmail, pass);
              } catch (fbErr) {
                  console.log("No legacy Firebase account for this user (expected for new employees):", fbErr);
              }

              return true;
          }
      } catch (pgErr) {
          console.log("Postgres login attempt failed, falling back to Firebase flow:", pgErr);
      }

      // 🔥 Fallback: original Firebase-first flow, for accounts where the
      // Postgres attempt above didn't succeed (e.g. a password that hasn't
      // been synced between the two systems yet, or genuinely Firebase-only
      // legacy accounts).
      try {
          const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, pass);
          const fbUser = userCredential.user;

          await AsyncStorage.removeItem('companyProfileLocal');
          await AsyncStorage.removeItem('user');

          const userQuery = query(collection(db, 'users'), where('email', '==', fbUser.email!.toLowerCase()));
          const userDocSnap = await getDocs(userQuery);
          
          if (userDocSnap.empty) {
              await auth.signOut();
              Alert.alert("Error", "User data not found in database.");
              return false;
          }

          const userData = { ...userDocSnap.docs[0].data(), id: userDocSnap.docs[0].id } as any;

          if (userData.role !== 'SuperAdmin') {
              let companyData = null;

              const compQuery1 = query(collection(db, 'companies'), where('companyId', '==', userData.companyId));
              const snap1 = await getDocs(compQuery1);
              if (!snap1.empty) companyData = snap1.docs[0].data();

              if (!companyData) {
                  const compQuery2 = query(collection(db, 'companies'), where('id', '==', userData.companyId));
                  const snap2 = await getDocs(compQuery2);
                  if (!snap2.empty) companyData = snap2.docs[0].data();
              }

              if (!companyData && userData.companyId) {
                  const compDocRef = doc(db, 'companies', userData.companyId);
                  const compDocSnap = await getDoc(compDocRef);
                  if (compDocSnap.exists()) companyData = compDocSnap.data();
              }

              if (companyData) {
                  if (companyData.isActive === false) {
                      await auth.signOut(); 
                      Alert.alert("Approval Pending 🚫", "Your company is not approved yet. Please wait for Super Admin approval.");
                      return false; 
                  }

                  if (companyData.expiryDate) {
                      const today = new Date();
                      const expiry = new Date(companyData.expiryDate);
                      
                      if (today > expiry) {
                          await auth.signOut(); 
                          Alert.alert(
                              "Plan Expired ⏳", 
                              "Your trial or subscription has expired. Please contact Super Admin to renew your plan."
                          );
                          return false; 
                      }
                  }
              } else {
                  console.log("Legacy Admin login allowed.");
              }
          }

          currentUserRef.current = userData;
          isPostgresSession.current = false;
          setCurrentUser(userData);
          await AsyncStorage.setItem('user', JSON.stringify(userData));

          // Best-effort retry — in case the earlier Postgres attempt failed
          // for a transient reason, not because the account doesn't exist.
          await bridgeLogin(normalizedEmail, pass);

          return true;
      } catch (error: any) {
          Alert.alert("Login Failed", "Invalid Email or Password");
          return false;
      }
  };

  // 🔥 Logout Ref Reset
    const logout = async () => { 
      try {
          await signOut(auth); 
      } catch (e) {
          // Postgres-only sessions were never signed into Firebase — signOut
          // on no active session is harmless, but guard anyway just in case.
          console.log("Firebase signOut skipped:", e);
      }
      setCurrentUser(null); 
      currentUserRef.current = null;
      isPostgresSession.current = false;
      await bridgeLogout();
      // Wipe cached list screens (see utils/listCache.ts) so a different
      // company logging in on this same device never briefly sees this
      // company's cached data before the network refresh replaces it.
      await clearAllListCaches();
  };

  const contextValue = useMemo(() => ({
      currentUser, loading, login, logout, activeSection, setActiveSection, shouldOpenSidebar, setShouldOpenSidebar, user: currentUser,
      isFirebaseSynced, isSubscriptionExpired,
      companyProfile,
      appPermissions,
      addNotification,
  }), [
      currentUser, loading, activeSection, shouldOpenSidebar, isFirebaseSynced, isSubscriptionExpired,
      companyProfile, appPermissions
  ]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};
export default DataProvider; 
export const useData = () => useContext(DataContext);
