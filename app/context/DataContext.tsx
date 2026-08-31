import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

// 🔥 FIREBASE IMPORTS
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { bridgeLogin, bridgeLogout } from '../../services/api/authBridge';
import { listLeads } from '../../services/api/leads';
import { listSalesVisits } from '../../services/api/salesVisits';
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

export const DataProvider = ({ children }: any) => {
  const [activeSection, setActiveSection] = useState('HR'); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shouldOpenSidebar, setShouldOpenSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);
  const [isAutomationEnabled, setIsAutomationEnabled] = useState(true); 
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false); 

  // --- REFS FOR READ OPTIMIZATION ---
  const staticDataLoaded = useRef(false);
  const currentUserRef = useRef<User | null>(null);

  // --- LISTS STATES ---
  const [userList, setUserList] = useState<any[]>([]); 
  const [productList, setProductList] = useState<any[]>([]); 
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [taskList, setTaskList] = useState<any[]>([]);
  const [pmsList, setPmsList] = useState<any[]>([]);
  const [notificationList, setNotificationList] = useState<any[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [travelList, setTravelList] = useState<any[]>([]); 
  const [advanceList, setAdvanceList] = useState<any[]>([]);
  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [leaveList, setLeaveList] = useState<any[]>([]);
  const [installList, setInstallList] = useState<any[]>([]); 
  const [salesVisitList, setSalesVisitList] = useState<any[]>([]);
  const [demoList, setDemoList] = useState<any[]>([]); 
  const [serviceList, setServiceList] = useState<any[]>([]);
  const [activityPlanList, setActivityPlanList] = useState<any[]>([]); 
  const [orgList, setOrgList] = useState<any[]>([]);
  const [serviceCallList, setServiceCallList] = useState<any[]>([]);
  const [cardRequestList, setCardRequestList] = useState<any[]>([]);
  const [sparePartsList, setSparePartsList] = useState<any[]>([]); 
  const [courierList, setCourierList] = useState<any[]>([]);
  const [orderList, setOrderList] = useState<any[]>([]);
  
  const [salesTargets, setSalesTargets] = useState({ monthly: 1000000, yearly: 12000000 });
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [dueList, setDueList] = useState<any[]>([]);
  const [appPermissions, setAppPermissions] = useState<Record<string, any>>({});
  const [holidayList, setHolidayList] = useState<any[]>([]);
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
  // 🔥 STATIC DATA FETCHERS (Saves 10,000+ reads)
  // =========================================================
  const fetchStaticData = async (compId: string) => {
      if (staticDataLoaded.current) return;
      staticDataLoaded.current = true;
      try {
          const prodSnap = await getDocs(query(
              collection(db, "products"), 
              where("companyId", "==", compId),
              orderBy("createdAt", "desc"), 
              limit(300)
          ));
          setProductList(prodSnap.docs.map(d => ({ id: d.id, ...d.data() as any })));

          const orgSnap = await getDocs(query(
              collection(db, "organizations"), 
              where("companyId", "==", compId),
              orderBy("createdAt", "desc"), 
              limit(500)
          ));
          setOrgList(orgSnap.docs.map(d => ({ id: d.id, ...d.data() as any })));

          const holSnap = await getDocs(query(
              collection(db, "holidays"),
              where("companyId", "==", compId)
          ));
          const holidays = holSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
          holidays.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setHolidayList(holidays);

          console.log("✅ Static data loaded once.");
      } catch (e) { console.log("Static data error:", e); }
  };

  const refreshOrganizations = async (compId: string) => {
      try {
          const snap = await getDocs(query(
              collection(db, "organizations"),
              where("companyId", "==", compId),
              orderBy("createdAt", "desc"),
              limit(500)
          ));
          setOrgList(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
      } catch (e) { console.log("Org refresh error:", e); }
  };

  // =========================================================
  // 🔥 MASTER MESSAGING ENGINE
  // =========================================================
  const queueAutomatedMessage = async (type: 'whatsapp' | 'email', to: string, templateName: string, variables: any, scheduledDate: string | null = null) => {
      if (!isAutomationEnabled) {
          console.log(`⏸️ Automation OFF: Skipped ${type} for ${to}`);
          return;
      }
      
      if (!to || to.trim() === '') return;
      try {
          let finalTo = to;
          if (type === 'whatsapp' && !to.startsWith('91') && !to.startsWith('+91')) {
              finalTo = `91${to.replace(/[^0-9]/g, '')}`; 
          }
          await addDoc(collection(db, 'outbound_messages'), {
              type: type, 
              to: finalTo, 
              templateName: templateName, 
              variables: variables,
              status: 'pending', 
              createdAt: new Date().toISOString(), 
              scheduledFor: scheduledDate || new Date().toISOString(), 
              retryCount: 0,
              companyId: currentUser?.companyId || ''
          });
          console.log(`✉️ [Message Queued] ${templateName} - Scheduled: ${scheduledDate ? 'Future ⏳' : 'Now ⚡'}`);
      } catch (error) { console.error("❌ [Queue Error]:", error); }
  };

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
        // AsyncStorage cache check
        const localProfile = await AsyncStorage.getItem('companyProfileLocal');
        if (localProfile) {
            const parsed = JSON.parse(localProfile);
            if (parsed.companyId === companyId) {
                setCompanyProfile(parsed);
            } else {
                await AsyncStorage.removeItem('companyProfileLocal');
            }
        }

        // ✅ FIX 1: company_profile collection mein companyId field se query karo
        let data: any = null;

        const profileQuery = query(
            collection(db, "company_profile"), 
            where("companyId", "==", companyId)
        );
        const profileSnap = await getDocs(profileQuery);

        if (!profileSnap.empty) {
            data = profileSnap.docs[0].data();
        } else {
            // Fallback: companies collection check karo
            const compQuery = query(
                collection(db, "companies"), 
                where("companyId", "==", companyId)
            );
            const compSnap = await getDocs(compQuery);
            if (!compSnap.empty) {
                data = compSnap.docs[0].data();
            }
        }
        
        if (data) {
            // ✅ FIX 2: Sab fields normalize karo - flat + nested dono
            const profileData = {
                companyId: companyId,
                companyName: data.companyName || 'My Company',
                shortName: data.shortName || 'CRM',
                tagline: data.tagline || '',

                // ✅ Address - flat fields
                addressLine: data.addressLine || data.fullAddress?.line || data.address || '',
                city:        data.city        || data.fullAddress?.city  || '',
                state:       data.state       || data.fullAddress?.state || '',
                pincode:     data.pincode     || data.fullAddress?.pincode || '',

                // ✅ Address - combined string (PDF ke liye)
                address: data.address || 
                    (data.fullAddress 
                        ? `${data.fullAddress.line || ''}, ${data.fullAddress.city || ''}, ${data.fullAddress.state || ''}`
                        : ''),
                fullAddress: data.fullAddress || {},

                // ✅ Contact - sab aliases handle karo
                phone:    data.phone    || data.contactPhone || data.mobile || '',
                mobile:   data.mobile   || data.contactPhone || data.phone  || '',
                email:    data.email    || data.contactEmail || '',
                landline: data.landline || '',
                website:  data.website  || '',

                gstNumber: data.gstNumber || '',

                // ✅ Images
                logoUrl:      data.logoUrl      || '',
                signatureUrl: data.signatureUrl || '',
                qrCodeUrl:    data.qrCodeUrl    || '',
                upiId:        data.upiId        || '',

                // ✅ Bank - nested format (PDF use karta hai)
                bankDetails1: data.bankDetails1 || {
                    bankName:  data.bank1_name   || '',
                    accountNo: data.bank1_acc    || '',
                    ifsc:      data.bank1_ifsc   || '',
                    branch:    data.bank1_branch || '',
                },
                bankDetails2: data.bankDetails2 || {
                    bankName:  data.bank2_name   || '',
                    accountNo: data.bank2_acc    || '',
                    ifsc:      data.bank2_ifsc   || '',
                    branch:    data.bank2_branch || '',
                },

                // ✅ Bank - flat format bhi rakho
                bank1_name:   data.bank1_name   || data.bankDetails1?.bankName  || '',
                bank1_acc:    data.bank1_acc    || data.bankDetails1?.accountNo || '',
                bank1_ifsc:   data.bank1_ifsc   || data.bankDetails1?.ifsc      || '',
                bank1_branch: data.bank1_branch || data.bankDetails1?.branch    || '',
                bank2_name:   data.bank2_name   || data.bankDetails2?.bankName  || '',
                bank2_acc:    data.bank2_acc    || data.bankDetails2?.accountNo || '',
                bank2_ifsc:   data.bank2_ifsc   || data.bankDetails2?.ifsc      || '',
                bank2_branch: data.bank2_branch || data.bankDetails2?.branch    || '',
            };

            setCompanyProfile(profileData as any);
            await AsyncStorage.setItem('companyProfileLocal', JSON.stringify(profileData));

            // Expiry check
            if (data.expiryDate) {
                const today = new Date();
                const expiry = new Date(data.expiryDate);
                if (today > expiry) setIsSubscriptionExpired(true);
            }
        }
    } catch (error) {
        console.log("Error fetching company settings:", error);
    }
};

  const [projectList, setProjectList] = useState<any[]>([]);
  const fetchProjects = async () => {
      try {
          const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
          const snapshot = await getDocs(q);
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          setProjectList(list);
      } catch (e) { 
          console.log("Error fetching projects:", e); 
      }
  };

  const addProject = async (data: any) => {
      try {
          await addDoc(collection(db, "projects"), data);
          await fetchProjects(); 
      } catch (e) {
          console.log("Error adding project:", e);
          throw e; 
      }
  };

  useEffect(() => {
     if(currentUser) {  
         fetchProjects();
     }
  }, [currentUser]);  
  
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
        let dbTarget = 1000000; 

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
                dbTarget = (userData.monthlyTarget && !isNaN(userData.monthlyTarget)) ? Number(userData.monthlyTarget) : 1000000;
                setSalesTargets({ monthly: dbTarget, yearly: dbTarget * 12 });

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
                    const compQuery = query(
                        collection(db, "company_profile"),
                        where("companyId", "==", companyId)
                    );
                    const compSnap = await getDocs(compQuery);
                    if (!compSnap.empty) {
                        const compData = compSnap.docs[0].data();
                        let active = compData.isActive !== false;

                        if (active && compData.expiryDate) {
                            const today = new Date().getTime();
                            const expiry = new Date(compData.expiryDate).getTime();
                            if (today > expiry) active = false;
                        }
                        isCompanyActive = active;
                        if (!active) setIsSubscriptionExpired(true);
                        else setIsSubscriptionExpired(false);
                    }
                }

            } else {
                // ✅ YE BLOCK MISSING THA - userData null hone par SuperAdmin check
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
        
        currentUserRef.current = newUser;
        setCurrentUser(newUser);
        console.log("🆔 companyId from userData:", companyId);

        if (companyId) {
            console.log("✅ Calling fetchCompanySettings with:", companyId);
            fetchCompanySettings(companyId);
            fetchStaticData(companyId);
            trackUsage(userDocId, companyId);
        }

      } else {
        console.log("❌ companyId is EMPTY — fetchCompanySettings NOT called!");
        setCurrentUser(null);
        currentUserRef.current = null;
        staticDataLoaded.current = false;
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // =========================================================
  // 2. PERMISSIONS & USER LIST
  // =========================================================
  useEffect(() => {
      if (!currentUser) {
          setIsFirebaseSynced(false); 
          return; 
      }

      let unsubPerm = () => {};
      if (currentUser.companyId) {
          const qPerm = query(collection(db, "settings_permissions"), where("companyId", "==", currentUser.companyId));
          unsubPerm = onSnapshot(qPerm, (snapshot: any) => {
              if (!snapshot.empty) {
                  const permDoc = snapshot.docs[0].data();
                  setAppPermissions(permDoc.data || permDoc || {});
              } else {
                  setAppPermissions({});
              }
          });
      } else {
          unsubPerm = onSnapshot(doc(db, "settings", "permissions"), (d: any) => { if (d.exists()) setAppPermissions(d.data()); });
      }

      let unsubAuto = () => {};
      if (currentUser.companyId) {
          const qAuto = query(collection(db, "settings_automation"), where("companyId", "==", currentUser.companyId));
          unsubAuto = onSnapshot(qAuto, (snapshot: any) => { 
              if (!snapshot.empty) {
                  const autoDoc = snapshot.docs[0].data();
                  setIsAutomationEnabled(autoDoc.enabled !== false); 
              }
          });
      } else {
          unsubAuto = onSnapshot(doc(db, "settings", "automation"), (d: any) => { 
              if (d.exists()) setIsAutomationEnabled(d.data().enabled !== false); 
          });
      }

      // ✅ Aise karo — sirf apni company ke users
const unsubUsers = onSnapshot(
    currentUser.role === 'SuperAdmin'
        ? query(collection(db, "users"), limit(200))
        : query(collection(db, "users"), where("companyId", "==", currentUser.companyId || ''), limit(100)),
    (snapshot: any) => {
        const list = snapshot.docs.map((doc: any) => ({ id: doc.id, uid: doc.id, ...doc.data() }));
        setUserList(list);
        setIsFirebaseSynced(true);
    }
);
      return () => { unsubPerm(); unsubUsers(); unsubAuto(); };
  }, [currentUser]);

  // =========================================================
  // 3. DATA LISTENERS (ENTERPRISE SAAS OPTIMIZED)
  // =========================================================
  useEffect(() => {
    if (!currentUser || !currentUser.companyId) return;

    const role = currentUser.role ? currentUser.role.toLowerCase() : '';
    const isMaster = ['admin', 'manager', 'account', 'accountant', 'hr', 'superadmin'].includes(role);
    const isAccount = role.includes('account');
    const isStore = role.includes('store');
    const compId = currentUser.companyId;

    const createListener = (colName: string, setter: Function) => {
        let dbQuery;
        const publicCollections = ['organizations', 'products', 'holidays', 'settings'];
        const personalHeavyCollections = ['leads', 'sales_reports', 'service_calls', 'demos', 'travel_notes', 'advances', 'expenses', 'attendance', 'leaves'];

        const isPublicData = publicCollections.includes(colName);
        const FETCH_LIMIT = isPublicData ? 2000 : 300;

        const baseQuery = [where("companyId", "==", compId), orderBy("createdAt", "desc"), limit(FETCH_LIMIT)];

        if (currentUser.role === 'SuperAdmin') {
            dbQuery = query(collection(db, colName), orderBy("createdAt", "desc"), limit(FETCH_LIMIT));
        }
        else if (isMaster || isPublicData) {
            dbQuery = query(collection(db, colName), ...baseQuery);
        } 
        else if (isAccount && ['orders', 'payment_collections', 'payment_dues', 'advances', 'expenses', 'leaves', 'attendance', 'travel_notes', 'visiting_cards', 'tasks', 'couriers', 'installations'].includes(colName)) {
            dbQuery = query(collection(db, colName), ...baseQuery);
        } 
        else if (isStore && ['spare_parts', 'couriers', 'visiting_cards', 'orders', 'tasks', 'installations', 'payment_dues'].includes(colName)) {
            dbQuery = query(collection(db, colName), ...baseQuery);
        } 
        else if (personalHeavyCollections.includes(colName)) {
            dbQuery = query(
                collection(db, colName), 
                where("companyId", "==", compId),
                where("senderId", "==", currentUser.id), 
                orderBy("createdAt", "desc"), 
                limit(FETCH_LIMIT)
            );
        } 
        else {
            dbQuery = query(collection(db, colName), ...baseQuery);
        }

        return onSnapshot(dbQuery, (snapshot: any) => {
            let data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));

            if (!isMaster && !isPublicData && currentUser.role !== 'SuperAdmin') {
                if (isAccount && ['orders', 'payment_collections', 'payment_dues', 'advances', 'expenses', 'leaves', 'attendance', 'travel_notes', 'visiting_cards', 'tasks', 'couriers', 'installations'].includes(colName)) {
                    // All good
                }
                else if (isStore && ['spare_parts', 'couriers', 'visiting_cards', 'orders', 'tasks', 'installations', 'payment_dues'].includes(colName)) {
                    // All good
                }
                else if (!personalHeavyCollections.includes(colName)) {
                    data = data.filter((item: any) => 
                        item.senderId === currentUser.id || 
                        item.userId === currentUser.id ||
                        item.assignedTo === currentUser.id || 
                        item.userName === currentUser.name ||
                        (colName === 'tasks' && item.to === currentUser.name) ||
                        (colName === 'couriers' && (item.receiverName === currentUser.name || item.senderName === currentUser.name))
                    );
                }
            }

            data.sort((a: any, b: any) => {
                const dateA = new Date(a.createdAt || a.date || 0).getTime();
                const dateB = new Date(b.createdAt || b.date || 0).getTime();
                return dateB - dateA;
            });

            setter(data);
        }, (error) => {
            console.error(`Firebase Listener Error [${colName}]:`, error);
        });
    };

    // 🔥 Removed Products, Orgs, Holidays from Realtime Listeners
        // 🔥 Removed Products, Orgs, Holidays from Realtime Listeners
    /* 🔥 Phase 1/2: leads/sales_reports ab neeche wale refreshLeads/refreshSalesVisits (API se) use hote hain
    const unsubLead = createListener("leads", setLeadsList);
    const unsubSales = createListener("sales_reports", setSalesVisitList);
    */
    const unsubTravel = createListener("travel_notes", setTravelList);
    const unsubPMS = createListener("pms_reports", setPmsList);
    const unsubDemo = createListener("demos", setDemoList);
    const unsubOrder = createListener("orders", setOrderList);
    const unsubService = createListener("service_calls", (data: any) => { setServiceCallList(data); setServiceList(data); });
    const unsubInstall = createListener("installations", setInstallList);
    const unsubSpare = createListener("spare_parts", setSparePartsList);
    const unsubPlan = createListener("activity_plans", setActivityPlanList);
    const unsubCourier = createListener("couriers", setCourierList);
    const unsubCard = createListener("visiting_cards", setCardRequestList);
    const unsubPay = createListener("payment_collections", setPaymentList);
    const unsubDue = createListener("payment_dues", setDueList);
    const unsubTask = createListener("tasks", setTaskList);
    
    const unsub1 = createListener("attendance", setAttendanceList);
    const unsub2 = createListener("leaves", setLeaveList);
    const unsub3 = createListener("expenses", setExpenseList);
    const unsub4 = createListener("advances", setAdvanceList);

    // 🔥 Optimized Notification Query
    // ✅ Aise karo
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const notifQuery = currentUser.role === 'SuperAdmin'
    ? query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(100))
    : query(collection(db, "notifications"), 
        where("companyId", "==", compId), 
        where("createdAt", ">=", sevenDaysAgo.toISOString()),
        orderBy("createdAt", "desc"), 
        limit(100));

    const unsubNotif = onSnapshot(notifQuery, (snapshot: any) => {
        let notifList = snapshot.docs.map((doc: any) => ({ ...doc.data() as any, id: doc.id }));
        notifList.sort((a:any, b:any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotificationList(notifList);

        const user = currentUserRef.current; 
        if (user) {
            const myName = (user.name || '').toLowerCase().trim();
            const myId = (user.id || '').toString().trim(); 
            const myRole = (user.role || '').toLowerCase().trim();

            const unreadItems = notifList.filter((n: any) => {
                const targetTo = (n.to || '').toString().toLowerCase().trim();
                const targetUserId = (n.userId || '').toString().trim(); 

                if (n.read === true) return false;
                if (targetUserId === myId) return true;
                if (targetTo === myId.toLowerCase()) return true;
                if (targetTo === myName) return true;
                if (targetTo === myRole) return true;
                if ((myRole === 'account' || myRole === 'accountant') && targetTo.includes('account')) return true;
                if ((myRole === 'store' || myRole === 'store keeper') && targetTo.includes('store')) return true;
                if (myRole === 'admin' && targetTo === 'admin') return true;
                return false;
            });
            setNotificationCount(unreadItems.length);
        }
    });

        return () => { 
        unsubTravel(); unsubPMS(); unsubDemo(); 
        unsubOrder(); unsubService(); unsubInstall(); unsubSpare(); unsubPlan(); unsubCourier(); 
        unsubCard(); unsubPay(); unsubDue(); unsubTask();
        unsub1(); unsub2(); unsub3(); unsub4(); unsubNotif();
    };
  }, [currentUser]);

  // 🔥 Phase 1/2: leads aur sales visits ab naye backend API se aate hain
  const refreshLeads = async () => {
      try {
          const leads = await listLeads();
          setLeadsList(leads);
      } catch (e) {
          console.log("Leads API fetch error:", e);
      }
  };
  const refreshSalesVisits = async () => {
      try {
          const visits = await listSalesVisits();
          setSalesVisitList(visits);
      } catch (e) {
          console.log("Sales visits API fetch error:", e);
      }
  };
  useEffect(() => {
      if (currentUser) {
          refreshLeads();
          refreshSalesVisits();
      }
  }, [currentUser]);

  // ✅ Har 1 ghante mein plan expiry check

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
  // 4. CRUD FUNCTIONS 
  // =========================================================
  
  const addWithMeta = async (col: string, data: any) => {
    try {
        const docRef = await addDoc(collection(db, col), { 
            ...data,
            companyId: currentUser?.companyId || '', 
            status: data.status || "Pending", 
            userName: currentUser?.name || 'Unknown',
            senderId: currentUser?.id || 'guest', 
            senderName: currentUser?.name || 'Unknown',
            createdAt: new Date().toISOString()
        });
        await updateDoc(docRef, { id: docRef.id });
        console.log(`✅ Added to ${col} with ID: ${docRef.id}`);

        if (col !== 'notifications') {
            let notifTitle = "New Entry Added";
            let notifRoute = "/";

            if(col === 'leaves') { notifTitle = "New Leave Request 🌴"; notifRoute = "/leave"; }
            else if(col === 'expenses') { notifTitle = "New Expense Claim 💸"; notifRoute = "/expense"; }
            else if(col === 'leads') { notifTitle = "New Lead Added 🎯"; notifRoute = "/leads"; }
            else if(col === 'tasks') { notifTitle = "New Task Assigned 📝"; notifRoute = "/tasks"; }
            else if(col === 'travel_notes') { notifTitle = "New Travel Claim 🚗"; notifRoute = "/travel"; }

            await addNotification({
                title: notifTitle,
                message: `${currentUser?.name} has added a new entry in ${col}.`,
                to: "Admin", 
                type: "info",
                route: notifRoute
            });
        }

    } catch (e) {
        console.error(`❌ Error adding to ${col}:`, e);
        Alert.alert("Error Saving Data", "Please try again.");
    }
  };
  
  const updateStatus = async (col: string, id: string, status: string) => {
    try {
        const ref = doc(db, col, id);
        await updateDoc(ref, { status: status });
    } catch (e: any) {
        Alert.alert("Update Failed", e.message);
    }
  };

  const updateAdvanceStatus = (id: string, status: string) => updateStatus("advances", id, status);
  const updateActivityStatus = (id: string, status: string) => updateStatus("activity_plans", id, status);
  const updateExpenseStatus = (id: string, status: string) => updateStatus("expenses", id, status);
  const updateLeaveStatus = (id: string, status: string) => updateStatus("leaves", id, status);
  
  const updateOrderStatus = async (id: string, status: string, orderData?: any) => {
    try {
        const ref = doc(db, "orders", id);
        await updateDoc(ref, { status: status });

        if (status === 'Approved' && orderData) {
            const dueAmount = parseFloat(orderData.amount || 0);
            if (dueAmount > 0) {
                const dueData = {
                    companyId: currentUser?.companyId || '', 
                    orgName: orderData.hospitalName || orderData.partyName || "Unknown",
                    orgId: orderData.orgId || "", 
                    city: orderData.city || "",
                    amount: dueAmount,          
                    balance: dueAmount,         
                    received: 0,
                    orderId: orderData.orderId || "ORD-XX",
                    date: new Date().toISOString().split('T')[0], 
                    dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
                    status: 'Pending',
                    senderId: currentUser?.id || 'app',
                    createdAt: new Date().toISOString()
                };

                await addDoc(collection(db, "payment_dues"), dueData);
                
                addNotification({
                    title: "New Due Generated 💰",
                    message: `Order Approved. ₹${dueAmount} added to dues for ${dueData.orgName}.`,
                    to: "Accountant", 
                    type: "info",
                    route: "/payment_duelist" 
                });
                console.log("✅ Auto Due Created");
            }
        }
    } catch (e: any) {
        Alert.alert("Update Failed", e.message);
    }
  };
  
  const updateLead = async (id: string, data: any) => {
      try {
          const ref = doc(db, "leads", id);
          await updateDoc(ref, data);
      } catch (e: any) {
          Alert.alert("Update Failed", e.message);
      }
  };

  const updateOrganization = async (id: string, data: any) => {
      try {
          const ref = doc(db, "organizations", id);
          await updateDoc(ref, data);
          setOrgList(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
          console.log(`✅ Organization updated:`, data);

          if (data.name) {
              const newName = data.name;
              const batch = writeBatch(db);
              let updateCount = 0;

              const updateOldRecords = async (colName: string, fieldsToUpdate: any) => {
                  const q = query(collection(db, colName), where("orgId", "==", id));
                  const snap = await getDocs(q);
                  snap.forEach((docItem: any) => {
                      batch.update(docItem.ref, fieldsToUpdate);
                      updateCount++;
                  });
              };

              await updateOldRecords("orders", { hospitalName: newName });
              await updateOldRecords("payment_collections", { orgName: newName }); 
              await updateOldRecords("payment_dues", { orgName: newName });
              await updateOldRecords("leads", { orgName: newName, companyName: newName });
              await updateOldRecords("service_calls", { hospitalName: newName, orgName: newName });
              await updateOldRecords("installations", { hospitalName: newName, orgName: newName });
              await updateOldRecords("pms_reports", { hospitalName: newName, orgName: newName });
              await updateOldRecords("demos", { hospitalName: newName, orgName: newName });
              await updateOldRecords("couriers", { orgName: newName, hospitalName: newName });

              if (updateCount > 0) {
                  await batch.commit();
                  console.log(`🚀 Magic Success! Changed old names in ${updateCount} places across ALL collections.`);
              }
          }
      } catch (e: any) {
          console.error("❌ Error updating org:", e);
          Alert.alert("Update Failed", e.message);
      }
  };

  const addLeadActivity = async (id: string, activity: any) => {
      try {
          const ref = doc(db, "leads", id);
          await updateDoc(ref, {
              history: arrayUnion({ ...activity, date: new Date().toLocaleString(), by: currentUser?.name || 'Admin' })
          });
      } catch (e) { console.error("History Error:", e); }
  };
  const deleteDocument = async (col: string, id: string) => {
      try { await deleteDoc(doc(db, col, id)); } 
      catch (e) { Alert.alert("Error", "Could not delete."); }
  };

  const addAttendance = (i:any) => addWithMeta("attendance", i);
  const addTask = (i:any) => addWithMeta("tasks", { ...i, from: currentUser?.name }); 
  const addLead = (i:any) => addWithMeta("leads", i);
  const addTravelNote = (i:any) => addWithMeta("travel_notes", i);
  const addAdvance = (i:any) => addWithMeta("advances", i);
  const addExpense = (i:any) => addWithMeta("expenses", i);
  const addLeave = (i:any) => addWithMeta("leaves", i);
  const addSalesVisit = (i:any) => addWithMeta("sales_reports", i);
  
  const addQuotation = async (data: any) => {
      await addWithMeta("quotations", data);
      
      if (data.mobile || data.phone) {
          const custMobile = data.mobile || data.phone;
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 3); 
          const scheduledTime = futureDate.toISOString();

          await queueAutomatedMessage('whatsapp', custMobile, 'quotation_followup_3days', {
              customer_name: data.contactPerson || data.orgName || 'Doctor/Sir',
              company_name: companyProfile?.companyName || 'Our Company'
          }, scheduledTime);

          console.log("⏳ Drip Campaign Activated: Follow-up set for 3 days later!");
      }
  };
  const addServiceCall = (i:any) => addWithMeta("service_calls", i);
  
  const addOrder = async (orderData: any) => {
      try {
          const docRef = await addDoc(collection(db, "orders"), {
              ...orderData,
              companyId: currentUser?.companyId || '' 
          });
          await updateDoc(docRef, { id: docRef.id });
          console.log("✅ Order Saved & ID Synced:", docRef.id);

          if (orderData.mobile) {
              await queueAutomatedMessage('whatsapp', orderData.mobile, 'order_confirmed', {
                  customer_name: orderData.contactPerson || orderData.hospitalName || 'Customer',
                  order_id: orderData.orderId,
                  amount: String(orderData.amount)
              });
          }

          await addNotification({
              title: "New Order Received 📦",
              message: `Order added by ${currentUser?.name} for ${orderData.hospitalName || 'a hospital'}.`,
              to: "Admin", 
              type: "info",
              route: "/orders"
          });
          
      } catch (error) {
          console.error("❌ Error adding order:", error);
          throw error;
      }
  };

  // 🔥 Local Update added for Organizations
  const addOrganization = async (orgData: any) => {
      try {
          await addWithMeta("organizations", orgData);
          setOrgList(prev => [{ ...orgData, createdAt: new Date().toISOString() }, ...prev]);
          
          const notifData = {
            companyId: currentUser?.companyId || '', 
            title: "New Organization",
            message: `New Hospital Added: ${orgData.name || orgData.orgName}`,
            type: "info",        
            to: "Admin",         
            screen: "organization", 
            id: orgData.id || Date.now().toString(),
            createdAt: new Date().toISOString(),
            read: false,
            senderId: currentUser?.id || 'app',
            senderName: currentUser?.name || 'App User'
          };

          await addDoc(collection(db, "notifications"), notifData);
          console.log("🔔 Notification Sent Successfully!");

      } catch (e) {
          console.error("Add Org Error:", e);
      }
  }; 
  const addInstallation = (i:any) => addWithMeta("installations", i);
  const addSparePart = (i:any) => addWithMeta("spare_parts", i);
  const addActivityPlan = (i:any) => addWithMeta("activity_plans", i);
  const addCardRequest = (i:any) => addWithMeta("visiting_cards", i);
  const addCourier = (i:any) => addWithMeta("couriers", i);
  
  const addPayment = async (paymentData: any) => {
      try {
          console.log("💰 Processing Payment for:", paymentData.orgName);

          const docRef = await addDoc(collection(db, "payment_collections"), { 
              ...paymentData, 
              companyId: currentUser?.companyId || '', 
              status: 'Approved', 
              createdAt: new Date().toISOString() 
          });
          await updateDoc(docRef, { id: docRef.id });

          try {
              const orgInfo = orgList.find((o:any) => o.id === paymentData.orgId) || {};
              const custMobile = paymentData.mobile || orgInfo.mobile || orgInfo.phone;
              if (custMobile) {
                  await queueAutomatedMessage('whatsapp', custMobile, 'payment_received', {
                      customer_name: paymentData.orgName,
                      amount: String(paymentData.amount),
                      receipt_no: paymentData.receiptNo || docRef.id.slice(-6).toUpperCase()
                  });
              }
          } catch(e) {}

          await addNotification({
              title: "Payment Received 💰",
              message: `₹${paymentData.amount} received from ${paymentData.orgName || 'a client'} by ${currentUser?.name}.`,
              to: "Admin", 
              type: "success",
              route: "/payment_collections"
          });

          const payAmount = parseFloat(String(paymentData.amount || 0));
          let orgName = paymentData.orgName || paymentData.partyName || paymentData.hospitalName || "";
          const orgId = paymentData.orgId || "";

          if (payAmount > 0) {
              let querySnapshot;
              const duesRef = collection(db, "payment_dues");

              if (orgId) {
                  const qId = query(duesRef, where("orgId", "==", orgId), where("status", "in", ["Pending", "Partial"]));
                  querySnapshot = await getDocs(qId);
              }

              if (!querySnapshot || querySnapshot.empty) {
                  let qName = query(duesRef, where("orgName", "==", orgName), where("status", "in", ["Pending", "Partial"]));
                  querySnapshot = await getDocs(qName);

                  if (querySnapshot.empty) {
                      qName = query(duesRef, where("orgName", "==", orgName.trim()), where("status", "in", ["Pending", "Partial"]));
                      querySnapshot = await getDocs(qName);
                  }
              }

              if (querySnapshot && !querySnapshot.empty) {
                  console.log(`✅ Found ${querySnapshot.size} Dues. Deducting...`);
                  
                  let remainingPayment = payAmount;
                  
                  const dues = querySnapshot.docs.map(d => ({id: d.id, ...d.data() as any}))
                               .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  for (const due of dues) {
                      if (remainingPayment <= 0.5) break; 

                      const currentBalance = parseFloat(String(due.balance || due.amount));
                      
                      if (currentBalance > 0) {
                          const deductAmount = Math.min(currentBalance, remainingPayment);
                          const newBalance = currentBalance - deductAmount;
                          const newReceived = (parseFloat(String(due.received || 0))) + deductAmount;
                          const newStatus = newBalance < 1 ? 'Collected' : 'Partial';

                          const dueRef = doc(db, "payment_dues", due.id);
                          await updateDoc(dueRef, {
                              balance: newBalance,
                              received: newReceived,
                              status: newStatus
                          });

                          remainingPayment -= deductAmount;
                      }
                  }
              } else {
                  console.log("❌ No matching Dues found to deduct.");
              }
          }
          return true;
      } catch (e: any) {
          console.error("Payment Error:", e);
          Alert.alert("Error", "Could not save payment.");
          return false;
      }
  };
  
  const addNotification = async (notifData: any) => {
      try {
          const docRef = await addDoc(collection(db, "notifications"), {
              ...notifData,
              companyId: currentUser?.companyId || '', 
              createdAt: new Date().toISOString(),
              read: false,
              senderId: currentUser?.id || 'app',
              senderName: currentUser?.name || 'App User'
          });
          await updateDoc(docRef, { id: docRef.id });

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

  const addDue = async (dueData: any) => {
    try {
        const docRef = await addDoc(collection(db, "payment_dues"), { 
            ...dueData, 
            companyId: currentUser?.companyId || '', 
            createdAt: new Date().toISOString() 
        });
        const newDue = { id: docRef.id, ...dueData };
        setDueList([newDue, ...dueList]);
        
        await addNotification({ title: "New Due Added", message: `Pending due of ₹${dueData.amount} added for ${dueData.orgName}`, type: "warning" });
        
        return true;
    } catch (error) { throw error; }
  };

  // 🔥 Local Update added for Products
  const addProduct = async (productData: any) => {
    try {
        const docRef = await addDoc(collection(db, "products"), { 
            ...productData, 
            companyId: currentUser?.companyId || '', 
            createdAt: new Date().toISOString() 
        });
        await updateDoc(docRef, { id: docRef.id });
        setProductList(prev => [{ id: docRef.id, ...productData, createdAt: new Date().toISOString() }, ...prev]);
        return true;
    } catch (error) { throw error; }
  };

  const completeTask = async (taskId: string, remarks: string = '') => {
    try {
        const ref = doc(db, 'tasks', taskId);
        await updateDoc(ref, { 
            status: 'Completed', completedBy: currentUser?.name || 'Unknown', completedById: currentUser?.id || 'Unknown', completedAt: new Date().toISOString(), completionRemarks: remarks
        });
    } catch (error) { console.error(error); }
  };

  const addDemo = (i:any) => addWithMeta("demos", i); 
  const addPMS = (i:any) => addWithMeta("pms_reports", i); 

  const deleteOrder = (id: string) => deleteDocument("orders", id);
  const deleteTask = (id: string) => deleteDocument("tasks", id);
  const deleteLead = (id: string) => deleteDocument("leads", id);

  const login = async (email: string, pass: string) => {
      try {
          const userCredential = await signInWithEmailAndPassword(auth, email, pass);
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

          setCurrentUser(userData);
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          await bridgeLogin(email, pass);
          return true;
      } catch (error: any) {
          Alert.alert("Login Failed", "Invalid Email or Password");
          return false;
      }
  };

  // 🔥 Logout Ref Reset
  const logout = async () => { 
      await signOut(auth); 
      setCurrentUser(null); 
      currentUserRef.current = null;
      staticDataLoaded.current = false;
      await bridgeLogout();
  };
  
  const markNotificationRead = async (id: string) => {
      setNotificationList(prev => prev.map((n: any) => n.id === id ? { ...n, read: true } : n));
      try { await updateDoc(doc(db, "notifications", id), { read: true }); } catch (e) {}
  };

  // 🔥 Optimized Batch Notifications Update
  const markAllNotificationsRead = async () => {
      setNotificationList(prev => prev.map((n: any) => ({ ...n, read: true })));
      try {
          const unread = notificationList.filter((n:any) => !n.read);
          if (unread.length === 0) return;
          const batch = writeBatch(db);
          unread.forEach((item:any) => {
              batch.update(doc(db, "notifications", item.id), { read: true });
          });
          await batch.commit();
      } catch (e) {}
  };  

  const getMyUnreadCount = () => notificationCount;

  const contextValue = useMemo(() => ({
      currentUser, loading, login, logout, activeSection, setActiveSection, shouldOpenSidebar, setShouldOpenSidebar, user: currentUser,
      isFirebaseSynced, isAutomationEnabled, isSubscriptionExpired, queueAutomatedMessage,
      taskList, leadsList, pmsList, notificationList, notificationCount, attendanceList, leaveList, expenseList, advanceList, travelList, 
      salesVisitList, orderList, serviceCallList, orgList, installList, sparePartsList, activityPlanList, courierList, 
      cardRequestList, paymentList, dueList, demoList, serviceList, productList, companyProfile,
      userList, holidayList,
      
      salesTargets, appPermissions, projectList,
      
      addAttendance, addTask, addLead, addTravelNote, addAdvance, addExpense, addLeave, addSalesVisit, addServiceCall, 
      addOrder, addPayment, addDue, addOrganization, addInstallation, addSparePart, addActivityPlan, addCardRequest, addCourier, 
      addDemo, addPMS, completeTask, addProduct, addNotification, addProject, addQuotation,
      
      updateAdvanceStatus, 
      updateExpenseStatus, 
      updateLeaveStatus,
      updateActivityStatus,
      updateOrderStatus,
      updateLead,
      updateOrganization, 
      addLeadActivity,
      refreshLeads,
      refreshSalesVisits,

      deleteOrder, deleteTask, deleteLead,

      markNotificationRead, markAllNotificationsRead, 
      refreshOrganizations: () => refreshOrganizations(currentUser?.companyId || ''),
      
      unreadCount: notificationCount 
  }), [
      currentUser, loading, activeSection, shouldOpenSidebar, isFirebaseSynced, isAutomationEnabled,
      taskList, leadsList, pmsList, notificationList, notificationCount, attendanceList, leaveList, expenseList, advanceList, travelList, 
      salesVisitList, orderList, serviceCallList, orgList, installList, sparePartsList, activityPlanList, courierList, 
      cardRequestList, paymentList, dueList, demoList, serviceList, productList, companyProfile,
      userList, holidayList, salesTargets, appPermissions, projectList
  ]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};
export default DataProvider; 
export const useData = () => useContext(DataContext);