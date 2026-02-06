import React, { createContext, useContext, useEffect, useState } from 'react';
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
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

// --- DATA TYPES ---
type User = { id: string; name: string; email: string; role: string; empId: string; mobile: string; profileImage?: string | null; };

const DataContext = createContext<any>(null);

export const DataProvider = ({ children }: any) => {
  const [activeSection, setActiveSection] = useState('HR'); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shouldOpenSidebar, setShouldOpenSidebar] = useState(false);
  const [loading, setLoading] = useState(true);

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
  const [appPermissions, setAppPermissions] = useState({});
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
  
  const fetchCompanySettings = async () => {
        try {
            const localProfile = await AsyncStorage.getItem('companyProfileLocal');
            if (localProfile) {
                setCompanyProfile(JSON.parse(localProfile));
            }

            // 2. Phir Firebase se Latest Data lao
            const docRef = doc(db, "company_profile", "main_profile");
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // 3. Data Formatting (Fixes Phone/Email & Missing Fields)
                const profileData = {
                    companyName: data.companyName || 'LMS',
                    shortName: data.shortName || 'LMS',
                    tagline: data.tagline || '',
                    
                    // Address Logic
                    address: data.address || (data.fullAddress ? `${data.fullAddress.line || ''}, ${data.fullAddress.city || ''}` : ''),
                    fullAddress: data.fullAddress || {},

                    phone: data.contactPhone || data.phone || '', 
                    email: data.contactEmail || data.email || '',
                    landline: data.landline || '',
                    website: data.website || '',
                    
                    gstNumber: data.gstNumber || '',

                    logoUrl: data.logoUrl || '',
                    signatureUrl: data.signatureUrl || '',
                    qrCodeUrl: data.qrCodeUrl || '',
                    upiId: data.upiId || '', 
                    bankDetails1: data.bankDetails1 || {},
                    bankDetails2: data.bankDetails2 || {}
                };
                setCompanyProfile(profileData as any);
                await AsyncStorage.setItem('companyProfileLocal', JSON.stringify(profileData));
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
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setProjectList(list as any);
      } catch (e) { 
          console.log("Error fetching projects:", e); 
      }
  };

  // 2. Add New Project
  const addProject = async (data: any) => {
      try {
          await addDoc(collection(db, "projects"), data);
          await fetchProjects(); // List refresh karein
      } catch (e) {
          console.log("Error adding project:", e);
          throw e; // Error aage bheje taki alert dikha sake
      }
  };

  // 3. Auto Fetch on Load
 useEffect(() => {
     if(currentUser) {  
         fetchProjects();
     }
 }, [currentUser]);  
  
  // 🔥 PROJECT MODULE END
  
  // 1. AUTH LISTENER
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let finalRole = 'Service Engineer'; 
        let name = user.email?.split('@')[0] || "User";
        let mobile = "7030223345";
        const emailKey = user.email?.trim().toLowerCase() || ""; 

        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("email", "==", emailKey));
            const querySnap = await getDocs(q);

            if (!querySnap.empty) {
                const userData = querySnap.docs[0].data();
                // 👇👇 DEBUGGING LOGS (Terminal me dekhein) 👇👇
                console.log("🔥 Full User Data from DB:", userData);
                console.log("🎯 Found Target in DB:", userData.monthlyTarget);

                // 1. Data Nikalo (Number convert karke safety ke liye)
                const dbTarget = userData.monthlyTarget;
                const mTarget = (dbTarget && !isNaN(dbTarget)) ? Number(dbTarget) : 1000000;
                
                console.log("✅ Final Target Set To:", mTarget);

                // 2. State update karo
                setSalesTargets({
                    monthly: mTarget,
                    yearly: mTarget * 12
                });
                // 👆👆 YE CODE UPDATE KAREIN 👆👆
                let dbRole = userData.role || 'Service Engineer';
                name = userData.name || name;
                if (userData.mobile) mobile = userData.mobile;

                if (dbRole === 'Engineer' || dbRole === 'Service') finalRole = 'Service Engineer';
                else if (dbRole === 'Sales' || dbRole === 'Sales Man') finalRole = 'Sales Executive';
                else if (dbRole === 'Account') finalRole = 'Accountant';
                else if (dbRole === 'Back Office' || dbRole === 'Store') finalRole = 'Store Keeper';
                else finalRole = dbRole; 
            } else {
                if(emailKey === "varunkhandagre@gmail.com" || emailKey === "admin@mycrm.com") {
                    finalRole = "Admin";
                }
            }
        } catch (e) { console.log("⚠️ Auth Error:", e); }
        
        console.log(`✅ Logged in as: ${name} (Role: ${finalRole})`);
        setCurrentUser({
            id: user.uid,
            name: name,
            email: user.email || "",
            role: finalRole, 
            empId: "EMP-" + user.uid.slice(0,4).toUpperCase(),
            profileImage: null,
            mobile: mobile
        });
        fetchCompanySettings();
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // =========================================================
  // 2. PERMISSIONS & USER LIST
  // =========================================================
  useEffect(() => {
      // 🔥 FIX: Permission Error (Jab tak user na mile, wait karo)
      if (!currentUser) return; 

      const unsub = onSnapshot(doc(db, "settings", "permissions"), (d) => { if (d.exists()) setAppPermissions(d.data()); });
      const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
          const list = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
          setUserList(list);
      });
      return () => { unsub(); unsubUsers(); };
  }, [currentUser]); 

  // =========================================================
  // 3. DATA LISTENERS
  // =========================================================
  useEffect(() => {
    // 🔥 FIX: Data load mat karo jab tak login na ho
    if (!currentUser) return;

    const role = currentUser.role ? currentUser.role.toLowerCase() : '';
    const isMaster = ['admin', 'manager', 'account', 'accountant', 'hr'].includes(role);
    const isAccount = role.includes('account');
    const isStore = role.includes('store');

    const createListener = (colName: string, setter: Function) => {
        return onSnapshot(collection(db, colName), (snapshot) => {
            let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (isMaster) {
                // Admin sees EVERYTHING
            }
            else if (colName === 'organizations' || colName === 'installations' || colName === 'products' || colName === 'payment_dues' || colName === 'couriers') {
                // Public Data
            } 
            else if (isAccount) {
                const accountAccess = [
                    'orders', 'payment_collections', 'payment_dues', 
                    'advances', 'expenses', 'leaves', 'attendance', 
                    'travel_notes', 'card_requests', 'tasks', 'couriers', 'installations'
                ];
                if (!accountAccess.includes(colName) && 
                    colName !== 'organizations' && colName !== 'products' && colName !== 'couriers') {
                        data = data.filter((item: any) => item.senderId === currentUser.id || item.userId === currentUser.id);
                }
            }
            else if (isStore) {
                const storeAccess = ['spare_parts', 'couriers', 'products', 'card_requests', 'orders', 'tasks', 'installations'];
                if (!storeAccess.includes(colName) && colName !== 'organizations') {
                    data = data.filter((item: any) => item.senderId === currentUser.id || item.userId === currentUser.id);
                }
            }
            
            else {
                data = data.filter((item: any) => 
                    item.senderId === currentUser.id || 
                    item.userId === currentUser.id ||
                    item.assignedTo === currentUser.id || 
                    item.userName === currentUser.name ||
                    (colName === 'tasks' && item.to === currentUser.name) ||
                    (colName === 'couriers' && (item.receiverName === currentUser.name || item.senderName === currentUser.name))
                );
            }

            // Sort Newest First
            data.sort((a: any, b: any) => {
                const dateA = new Date(a.createdAt || a.date || 0).getTime();
                const dateB = new Date(b.createdAt || b.date || 0).getTime();
                return dateB - dateA;
            });

            setter(data);
        });
    };

    const unsubProduct = createListener("products", setProductList);
    const unsubLead = createListener("leads", setLeadsList);
    const unsubTravel = createListener("travel_notes", setTravelList);
    const unsubPMS = createListener("pms_reports", setPmsList);
    const unsubSales = createListener("sales_reports", setSalesVisitList);
    const unsubDemo = createListener("demos", setDemoList);
    const unsubOrder = createListener("orders", setOrderList);
    const unsubService = createListener("service_calls", (data: any) => { setServiceCallList(data); setServiceList(data); });
    const unsubInstall = createListener("installations", setInstallList);
    const unsubSpare = createListener("spare_parts", setSparePartsList);
    const unsubPlan = createListener("activity_plans", setActivityPlanList);
    const unsubCourier = createListener("couriers", setCourierList);
    const unsubCard = createListener("card_requests", setCardRequestList);
    const unsubPay = createListener("payment_collections", setPaymentList);
    const unsubDue = createListener("payment_dues", setDueList);
    
    const unsubHolidays = onSnapshot(collection(db, "holidays"), (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setHolidayList(list);
    });
    
    const unsubNotif = onSnapshot(collection(db, "notifications"), (snapshot) => {
        const notifList = snapshot.docs.map(doc => ({
            ...doc.data(), // Pehle data failao
            id: doc.id     // 🔥 BAAD ME ID set karo (Taaki asli ID hi mile)
        }));
        
        notifList.sort((a:any, b:any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotificationList(notifList);

        if (currentUser) {
            const myName = (currentUser.name || '').toLowerCase().trim();
            const myId = (currentUser.id || '').toString().trim(); 
            const myRole = (currentUser.role || '').toLowerCase().trim();

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
    const unsubOrg = createListener("organizations", setOrgList);
    const unsubTask = createListener("tasks", setTaskList);
    
    const unsub1 = createListener("attendance", setAttendanceList);
    const unsub2 = createListener("leaves", setLeaveList);
    const unsub3 = createListener("expenses", setExpenseList);
    const unsub4 = createListener("advances", setAdvanceList);

    return () => { 
        unsubTask(); unsubNotif();
        unsub1(); unsub2(); unsub3(); unsub4(); unsubTravel(); unsubLead();
        unsubSales(); unsubPMS(); unsubDemo(); unsubOrder();
        unsubService(); unsubOrg(); unsubInstall(); unsubSpare(); unsubPlan();
        unsubCourier(); unsubCard(); unsubPay(); unsubDue(); unsubHolidays();
    };
  }, [currentUser]);

  // =========================================================
  // 4. CRUD FUNCTIONS
  // =========================================================
  
  const addWithMeta = async (col: string, data: any) => {
    try {
        const docRef = await addDoc(collection(db, col), { 
            ...data, 
            status: data.status || "Pending", 
            userName: currentUser?.name || 'Unknown',
            senderId: currentUser?.id || 'guest', 
            senderName: currentUser?.name || 'Unknown',
            createdAt: new Date().toISOString()
        });
        await updateDoc(docRef, { id: docRef.id });
        console.log(`✅ Added to ${col} with ID: ${docRef.id}`);
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
  // 🔥 UPDATE ORDER & AUTO ADD TO DUES (Corrected)
  const updateOrderStatus = async (id: string, status: string, orderData?: any) => {
    try {
        const ref = doc(db, "orders", id);
        
        // 1. Status Update
        await updateDoc(ref, { status: status });

        // 2. Auto Due Logic (Sirf Approved hone par)
        if (status === 'Approved' && orderData) {
            
            const dueAmount = parseFloat(orderData.amount || 0);
            
            if (dueAmount > 0) {
                const dueData = {
                    orgName: orderData.hospitalName || orderData.partyName || "Unknown",
                    orgId: orderData.orgId || "", // <--- YE LINE ADD KAR DEIN
                    city: orderData.city || "",
                    amount: dueAmount,          
                    balance: dueAmount,         // Balance shuru me full amount rahega
                    received: 0,
                    orderId: orderData.orderId || "ORD-XX",
                    date: new Date().toISOString().split('T')[0], 
                    dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], 
                    status: 'Pending',
                    senderId: currentUser?.id || 'app',
                    createdAt: new Date().toISOString()
                };

                // ✅ Collection Name: "payment_dues" (Database ke liye)
                await addDoc(collection(db, "payment_dues"), dueData);
                
                // ✅ Notification
                if(addNotification) {
                    addNotification({
                        title: "New Due Generated 💰",
                        message: `Order Approved. ₹${dueAmount} added to dues for ${dueData.orgName}.`,
                        to: "Accountant", 
                        type: "info",
                        route: "/payment_duelist" // 🔥 FIX: Aapke file ka naam yahan dala hai
                    });
                }
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

  // 🔥 ADDED: UPDATE ORGANIZATION FUNCTION (Fixes your error)
  const updateOrganization = async (id: string, data: any) => {
      try {
          const ref = doc(db, "organizations", id);
          await updateDoc(ref, data);
          console.log(`✅ Organization updated:`, data);
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
  const addServiceCall = (i:any) => addWithMeta("service_calls", i);
  // 🔥 FIX: Save Order & Sync ID (Taaki Approve me error na aaye)
  const addOrder = async (orderData: any) => {
      try {
          // 1. Pehle document create karo (Firestore ID generate karega)
          const docRef = await addDoc(collection(db, "orders"), orderData);
          
          // 2. Ab wapas ussi document ko update karo taaki 'id' field match kare
          // Isse "No document to update" wala error khatam ho jayega
          await updateDoc(docRef, { id: docRef.id });

          console.log("✅ Order Saved & ID Synced:", docRef.id);
          
          // Agar fetchOrders function hai to call karein (optional)
          // if(fetchOrders) await fetchOrders(); 

      } catch (error) {
          console.error("❌ Error adding order:", error);
          throw error;
      }
  };
  // 🔥 NEW CODE: Save Data + Send Notification
  const addOrganization = async (orgData: any) => {
      try {
          // 1. Organization Save Karein
          await addWithMeta("organizations", orgData);
          
          // 2. Notification Bhejein (Admin ko)
          // Notification ka object banaya
          const notifData = {
            title: "New Organization",
            message: `New Hospital Added: ${orgData.name || orgData.orgName}`,
            type: "info",        // Icon type
            to: "Admin",         // Kisko dikhana hai
            screen: "organization", // Click karne par kya khulega
            id: orgData.id || Date.now().toString(),
            createdAt: new Date().toISOString(),
            read: false,
            senderId: currentUser?.id || 'app',
            senderName: currentUser?.name || 'App User'
          };

          // Database ke 'notifications' folder me save kiya
          await addDoc(collection(db, "notifications"), notifData);
          console.log("🔔 Notification Sent Successfully!");

      } catch (e) {
          console.error("Add Org Error:", e);
      }
  }; 
  const addInstallation = (i:any) => addWithMeta("installations", i);
  const addSparePart = (i:any) => addWithMeta("spare_parts", i);
  const addActivityPlan = (i:any) => addWithMeta("activity_plans", i);
  const addCardRequest = (i:any) => addWithMeta("card_requests", i);
  const addCourier = (i:any) => addWithMeta("couriers", i);
  // 🔥 ADD PAYMENT & AUTO REDUCE DUES (Final Fix)
  const addPayment = async (paymentData: any) => {
      try {
          console.log("💰 Processing Payment for:", paymentData.orgName);

          // 1. Payment Save
          const docRef = await addDoc(collection(db, "payment_collections"), { 
              ...paymentData, 
              status: 'Approved', 
              createdAt: new Date().toISOString() 
          });
          await updateDoc(docRef, { id: docRef.id });

          // 2. Auto Deduct Logic
          const payAmount = parseFloat(String(paymentData.amount || 0));
          
          // Org Name aur ID nikalo
          let orgName = paymentData.orgName || paymentData.partyName || paymentData.hospitalName || "";
          const orgId = paymentData.orgId || "";

          if (payAmount > 0) {
              let querySnapshot;
              const duesRef = collection(db, "payment_dues");

              // 🔥 STRATEGY 1: Try finding by Org ID (Sabse Accurate)
              if (orgId) {
                  const qId = query(duesRef, where("orgId", "==", orgId), where("status", "in", ["Pending", "Partial"]));
                  querySnapshot = await getDocs(qId);
              }

              // 🔥 STRATEGY 2: Agar ID se nahi mila, to Name se dhundo (Space hata ke)
              if (!querySnapshot || querySnapshot.empty) {
                  console.log("⚠️ ID not found in dues, trying Name match...");
                  
                  // Try Exact Name
                  let qName = query(duesRef, where("orgName", "==", orgName), where("status", "in", ["Pending", "Partial"]));
                  querySnapshot = await getDocs(qName);

                  // Try Trimmed Name (Agar upar wala fail hua)
                  if (querySnapshot.empty) {
                      console.log("⚠️ Exact name failed, trying Trimmed name...");
                      qName = query(duesRef, where("orgName", "==", orgName.trim()), where("status", "in", ["Pending", "Partial"]));
                      querySnapshot = await getDocs(qName);
                  }
              }

              // 3. Process Deductions
              if (querySnapshot && !querySnapshot.empty) {
                  console.log(`✅ Found ${querySnapshot.size} Dues. Deducting...`);
                  
                  let remainingPayment = payAmount;
                  
                  // Sort: Oldest First
                  const dues = querySnapshot.docs.map(d => ({id: d.id, ...d.data() as any}))
                               .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  for (const due of dues) {
                      if (remainingPayment <= 0.5) break; // Stop if payment exhausted (0.5 for rounding errors)

                      const currentBalance = parseFloat(String(due.balance || due.amount));
                      
                      if (currentBalance > 0) {
                          const deductAmount = Math.min(currentBalance, remainingPayment);
                          
                          const newBalance = currentBalance - deductAmount;
                          const newReceived = (parseFloat(String(due.received || 0))) + deductAmount;
                          
                          // Agar balance < 1 hai to 'Collected'
                          const newStatus = newBalance < 1 ? 'Collected' : 'Partial';

                          const dueRef = doc(db, "payment_dues", due.id);
                          await updateDoc(dueRef, {
                              balance: newBalance,
                              received: newReceived,
                              status: newStatus
                          });

                          remainingPayment -= deductAmount;
                          console.log(`✅ Deducted ${deductAmount} from Due ID: ${due.id}. New Balance: ${newBalance}`);
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
  const addNotification = (i:any) => addWithMeta("notifications", i);

  const addDue = async (dueData: any) => {
    try {
        const docRef = await addDoc(collection(db, "payment_dues"), { ...dueData, createdAt: new Date().toISOString() });
        const newDue = { id: docRef.id, ...dueData };
        setDueList([newDue, ...dueList]);
        if(addNotification) {
            await addNotification({ title: "New Due Added", message: `Pending due of ₹${dueData.amount} added for ${dueData.orgName}`, type: "warning" });
        }
        return true;
    } catch (error) { throw error; }
  };

  const addProduct = async (productData: any) => {
    try {
        const docRef = await addDoc(collection(db, "products"), { ...productData, createdAt: new Date().toISOString() });
        await updateDoc(docRef, { id: docRef.id });
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

  const login = async (e:string, p:string) => { try { await signInWithEmailAndPassword(auth, e, p); return true; } catch (e:any) { Alert.alert("Login Failed", e.message); return false; } };
  const logout = async () => { await signOut(auth); setCurrentUser(null); };
  
  const markNotificationRead = async (id: string) => {
      setNotificationList(prev => prev.map((n: any) => n.id === id ? { ...n, read: true } : n));
      try { await updateDoc(doc(db, "notifications", id), { read: true }); } catch (e) {}
  };

  const markAllNotificationsRead = async () => {
      setNotificationList(prev => prev.map((n: any) => ({ ...n, read: true })));
      try {
          const unread = notificationList.filter((n:any) => !n.read);
          unread.forEach(async (item:any) => { await updateDoc(doc(db, "notifications", item.id), { read: true }); });
      } catch (e) {}
  };  

  const getMyUnreadCount = () => notificationCount;

  return (
    <DataContext.Provider value={{ 
        currentUser, loading, login, logout, activeSection, setActiveSection, shouldOpenSidebar, setShouldOpenSidebar, user: currentUser,
        
        taskList, leadsList, pmsList, notificationList, notificationCount, attendanceList, leaveList, expenseList, advanceList, travelList, 
        salesVisitList, orderList, serviceCallList, orgList, installList, sparePartsList, activityPlanList, courierList, 
        cardRequestList, paymentList, dueList, demoList, serviceList, productList, companyProfile,
        userList, holidayList,
        
        salesTargets, appPermissions, projectList,
        
        addAttendance, addTask, addLead, addTravelNote, addAdvance, addExpense, addLeave, addSalesVisit, addServiceCall, 
        addOrder, addPayment, addDue, addOrganization, addInstallation, addSparePart, addActivityPlan, addCardRequest, addCourier, 
        addDemo, addPMS, completeTask, addProduct, addNotification, addProject,
        
        updateAdvanceStatus, 
        updateExpenseStatus, 
        updateLeaveStatus,
        updateActivityStatus,
        updateOrderStatus,
        updateLead,
        updateOrganization, // 🔥 ADDED HERE
        addLeadActivity,

        deleteOrder, deleteTask, deleteLead,

        markNotificationRead, markAllNotificationsRead,
        
        unreadCount: notificationCount 
    }}>
      {children}
    </DataContext.Provider>
  );
};
export default DataProvider; 
export const useData = () => useContext(DataContext);