import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchCompanyProfile } from '../../services/api/companies';
import { stopBackgroundTracking } from '../../utils/backgroundLocation';
import { fetchPermissions } from '../../services/api/permissions';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BridgeUser, bridgeLogin, bridgeLogout, getStoredPostgresUser } from '../../services/api/authBridge';
import { trackAppOpen } from '../../services/api/usage';
import { clearAllListCaches } from '../../utils/listCache';

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
// activeSection/shouldOpenSidebar (sidebar UI state). Notifications (in-app
// and push) are sent by the backend when a record is created or approved.
// ---------------------------------------------------------------------------

export const DataProvider = ({ children }: any) => {
  const [activeSection, setActiveSection] = useState('HR'); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shouldOpenSidebar, setShouldOpenSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);
  // True once the stored session has been checked (drives _layout's "Syncing..." pill).
  const [isSessionReady, setIsSessionReady] = useState(false);

  const currentUserRef = useRef<User | null>(null);
  // Bumped on every logout. Async work started for an earlier session
  // (session restore, company-settings retries) checks it and stops, so
  // nothing re-creates the session or calls the API without a token.
  const sessionGen = useRef(0);

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
      signatureUrl: '',
      // Optimistic default while this is still loading — shows everything
      // rather than flashing an empty menu before the real company data
      // arrives. fetchCompanySettings() below overwrites this with the
      // company's real enabledModules once it resolves.
      enabledModules: ['sales', 'service', 'hr'] as string[]
  });

    const fetchCompanySettings = async (companyId: string, attempt = 1, gen = sessionGen.current) => {
    if (!companyId || gen !== sessionGen.current) return;

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
        if (gen !== sessionGen.current) return; // logged out meanwhile

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
        if (gen !== sessionGen.current) return; // logged out — don't retry
        console.log("Error fetching company settings:", error);
        // Was: single attempt, silent fail. If this lost a race with the auth
        // token being ready (cold start / fresh install with no cached profile),
        // companyProfile stayed at its "Loading..." placeholder for the whole
        // session, so everything reading companyProfile.companyName (courier
        // sender/receiver auto-fill, challans, quotations, ...) came out blank
        // until the app was force-restarted. Retry a few times with backoff.
        if (attempt < 4) {
            setTimeout(() => fetchCompanySettings(companyId, attempt + 1, gen), 1500 * attempt);
        }
    }
};

  // =========================================================
  // 1. SESSION RESTORE — the stored backend user (written at login) is the
  // session; an expired token gets a 401 on the first API call.
  // =========================================================
  const toAppUser = (u: BridgeUser): User => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.legacyRole || u.role,
      empId: u.empId || ("EMP-" + u.id.slice(0, 4).toUpperCase()),
      profileImage: u.profileImage || null,
      mobile: u.mobile || '',
      companyId: u.companyId,
      isCompanyActive: true, // active / expiry is enforced by the server on every call
  });

  const startSession = (u: BridgeUser) => {
      const appUser = toAppUser(u);
      currentUserRef.current = appUser;
      setCurrentUser(appUser);
      fetchCompanySettings(u.companyId);
      trackAppOpen();
  };

  useEffect(() => {
      const gen = sessionGen.current;
      getStoredPostgresUser().then((stored) => {
          if (gen !== sessionGen.current) return; // logged in / out meanwhile
          if (stored) startSession(stored);
      }).finally(() => {
          setIsSessionReady(true);
          setLoading(false);
      });
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
      let cancelled = false;
      fetchPermissions()
          .then((perms) => { if (!cancelled) setAppPermissions(perms || {}); })
          .catch((e) => {
              if (cancelled) return;
              console.log("fetchPermissions failed:", e);
              setAppPermissions({});
          });
      return () => { cancelled = true; };
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

  const login = async (email: string, pass: string) => {
      try {
          const user = await bridgeLogin(email.trim().toLowerCase(), pass);
          sessionGen.current += 1;
          await AsyncStorage.removeItem('companyProfileLocal');
          startSession(user);
          return true;
      } catch (error: any) {
          Alert.alert("Login Failed", error?.status === 401 ? "Invalid Email or Password" : (error?.message || "Could not reach the server. Please check your internet and try again."));
          return false;
      }
  };

  const logout = async () => {
      sessionGen.current += 1;
      // Stop Day-In location tracking before the token goes away.
      await stopBackgroundTracking();
      setCurrentUser(null);
      currentUserRef.current = null;
      setAppPermissions({});
      await bridgeLogout();
      // Wipe cached list screens (see utils/listCache.ts) so a different
      // company logging in on this same device never briefly sees this
      // company's cached data before the network refresh replaces it.
      await clearAllListCaches();
  };

  const contextValue = useMemo(() => ({
      currentUser, loading, login, logout, activeSection, setActiveSection, shouldOpenSidebar, setShouldOpenSidebar, user: currentUser,
      isSessionReady, isSubscriptionExpired,
      companyProfile,
      appPermissions,
  }), [
      currentUser, loading, activeSection, shouldOpenSidebar, isSessionReady, isSubscriptionExpired,
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
