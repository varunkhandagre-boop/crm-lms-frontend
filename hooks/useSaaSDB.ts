import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { useData } from '../app/context/DataContext';
import { db } from '../firebaseConfig';

// =========================================================
// 🔔 AUTOMATION CONFIG — ek hi jagah se sab collections control
// =========================================================

type MessageType = 'whatsapp' | 'email';

interface AutomationRule {
    type: MessageType;
    getTo: (d: any) => string | undefined | null;
    template: string;
    getVars: (d: any, id: string) => Record<string, string>;
}

// Record<string, AutomationRule[]> = "koi bhi string key ho sakti hai,
// value hamesha AutomationRule[] hogi" — isi se error 7053 fix hota hai.
const AUTOMATION_RULES: Record<string, AutomationRule[]> = {
    orders: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'order_confirmed',
            getVars: (d: any, id: string) => ({
                customer_name: d.contactPerson || d.hospitalName || 'Customer',
                order_id: d.orderId || id,
                amount: String(d.amount ?? ''),
            }),
        },
        {
            type: 'email',
            getTo: (d: any) => d.email,
            template: 'order_confirmed_email',
            getVars: (d: any, id: string) => ({
                customer_name: d.contactPerson || d.hospitalName || 'Customer',
                order_id: d.orderId || id,
                amount: String(d.amount ?? ''),
            }),
        },
    ],

    payment_collections: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'payment_received',
            getVars: (d: any, id: string) => ({
                customer_name: d.orgName || 'Customer',
                amount: String(d.amount ?? ''),
                receipt_no: d.receiptNo || String(id).slice(-6).toUpperCase(),
            }),
        },
    ],

    installations: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'installation_completed',
            getVars: (d: any) => ({
                customer_name: d.contactPerson || d.hospitalName || 'Customer',
                product: d.productName || d.product || 'Machine',
            }),
        },
    ],

    service_calls: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'service_ticket_created',
            getVars: (d: any, id: string) => ({
                customer_name: d.contactPerson || d.hospitalName || 'Customer',
                ticket_id: String(id).slice(-6).toUpperCase(),
            }),
        },
    ],

    couriers: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile || d.receiverMobile,
            template: 'courier_dispatched',
            getVars: (d: any, id: string) => ({
                customer_name: d.receiverName || d.orgName || 'Customer',
                tracking_id: d.trackingId || String(id).slice(-6).toUpperCase(),
                courier_partner: d.courierPartner || '',
            }),
        },
    ],

    sales_reports: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'sales_visit_thanks',
            getVars: (d: any) => ({
                customer_name: d.person || d.orgName || 'Customer',
                company_name: '', // companyProfile.companyName neeche inject hoga
            }),
        },
    ],

    demos: [
        {
            type: 'whatsapp',
            getTo: (d: any) => d.mobile,
            template: 'demo_scheduled',
            getVars: (d: any) => ({
                customer_name: d.contactPerson || d.hospitalName || 'Customer',
                date: d.date,
            }),
        },
    ],
};

export const useSaaSDB = () => {
    const { currentUser, queueAutomatedMessage, companyProfile } = useData();
    const [loading, setLoading] = useState(false);

    // 1. FETCH DATA
    const fetchSaaSData = useCallback(async (collectionName: string, isGlobal: boolean = false): Promise<any[]> => {
        if (!isGlobal) {
            if (currentUser?.role === 'SuperAdmin' && collectionName !== 'companies') {
                console.log("Super Admin restricted from viewing client data.");
                return [];
            }
            if (!currentUser?.companyId) return [];
        }

        setLoading(true);
        try {
            let q;
            if (isGlobal) {
                 q = collection(db, collectionName);
            } else {
                 q = query(
                     collection(db, collectionName),
                     where("companyId", "==", currentUser?.companyId)
                 );
            }

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            return data.sort((a: any, b: any) => {
                const dateA = new Date(b.createdAt || b.timestamp || 0).getTime();
                const dateB = new Date(a.createdAt || a.timestamp || 0).getTime();
                return dateA - dateB;
            });

        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return [];
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    // 🔔 Automation runner - config check karke message queue karta hai
    const runAutomation = async (collectionName: string, savedData: any, docId: string): Promise<void> => {
        const rules = AUTOMATION_RULES[collectionName];
        if (!rules || !queueAutomatedMessage) return;

        for (const rule of rules) {
            try {
                const to = rule.getTo(savedData);
                if (!to) continue;

                const vars = rule.getVars(savedData, docId);
                // sales_reports ke liye company_name yaha inject karo
                if (collectionName === 'sales_reports') {
                    vars.company_name = companyProfile?.companyName || 'Our Company';
                }

                await queueAutomatedMessage(rule.type, to, rule.template, vars);
            } catch (err) {
                console.error(`Automation rule failed for ${collectionName} (${rule.type}):`, err);
            }
        }
    };

    // 2. ADD DATA
    const addSaaSData = async (collectionName: string, payload: any, isGlobal: boolean = false) => {
        if (!isGlobal && !currentUser?.companyId) return { success: false, error: "Company ID required" };

        setLoading(true);
        try {
            const finalData = {
                ...payload,
                companyId: isGlobal ? (payload.companyId || 'GLOBAL') : currentUser?.companyId,
                senderId: payload.senderId || currentUser?.id || (currentUser as any)?.uid || 'System',
                senderName: payload.senderName || currentUser?.name || 'System',
                createdAt: payload.createdAt || new Date().toISOString(),
                timestamp: payload.timestamp || Date.now()
            };

            const docRef = await addDoc(collection(db, collectionName), finalData);

            runAutomation(collectionName, finalData, docRef.id);

            return { success: true, id: docRef.id };
        } catch (error: any) {
            console.error(`Add Error [${collectionName}]:`, error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // 3. UPDATE DATA
    const updateSaaSData = async (collectionName: string, docId: string, updatedFields: any) => {
        setLoading(true);
        try {
            const docRef = doc(db, collectionName, docId);
            await updateDoc(docRef, {
                ...updatedFields,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.name || 'SuperAdmin'
            });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    // 4. DELETE DATA
    const deleteSaaSData = async (collectionName: string, docId: string) => {
        setLoading(true);
        try {
            await deleteDoc(doc(db, collectionName, docId));
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    return {
        fetchSaaSData,
        addSaaSData,
        updateSaaSData,
        deleteSaaSData,
        isDbLoading: loading
    };
};