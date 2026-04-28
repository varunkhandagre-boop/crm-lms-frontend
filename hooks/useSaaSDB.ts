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

export const useSaaSDB = () => {
    const { currentUser } = useData();
    const [loading, setLoading] = useState(false);

    // 1. FETCH DATA (Optimized with useCallback)
    const fetchSaaSData = useCallback(async (collectionName: string) => {
        // 🔥 Aapka Original Super Admin Logic Retained
        if (currentUser?.role === 'SuperAdmin') {
            console.log("Super Admin restricted from viewing client data.");
            return []; 
        }

        if (!currentUser?.companyId) return [];

        setLoading(true);
        try {
            const q = query(
                collection(db, collectionName),
                where("companyId", "==", currentUser.companyId)
                // Note: orderBy hata diya gaya hai kyunki har collection me createdAt nahi hota, 
                // jisse Firebase Index error de sakta hai. Hum data UI me sort karenge.
            );

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Client side pe sort kar rahe hain (Taaki Firebase par Index ban banane ka jhanjhat na rahe)
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

    // 2. ADD DATA (Optimized for Cost & "On Behalf Of")
    const addSaaSData = async (collectionName: string, payload: any) => {
        if (!currentUser?.companyId) return { success: false, error: "Company ID required" };

        setLoading(true);
        try {
            const finalData = {
                ...payload,
                companyId: currentUser.companyId,
                // 🔥 SMART INJECTION: Agar payload me senderId hai toh wo lo, warna currentUser lo
                senderId: payload.senderId || currentUser.id || currentUser.uid,
                senderName: payload.senderName || currentUser.name,
                createdAt: payload.createdAt || new Date().toISOString(),
                timestamp: payload.timestamp || Date.now()
            };

            const docRef = await addDoc(collection(db, collectionName), finalData);
            // 🔥 Double Write Hata diya gaya hai bill bachane ke liye!
            
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
                updatedBy: currentUser?.name
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