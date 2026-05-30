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
    // 🔥 isGlobal = true ka matlab hai bina companyId ke filter kiye data lana (Sirf SuperAdmin ke liye)
    const fetchSaaSData = useCallback(async (collectionName: string, isGlobal: boolean = false) => {
        // Agar isGlobal false hai (matlab regular employee/admin call kar raha hai)
        if (!isGlobal) {
            // Super Admin restricted logic
            if (currentUser?.role === 'SuperAdmin' && collectionName !== 'companies') {
                console.log("Super Admin restricted from viewing client data.");
                return []; 
            }

            if (!currentUser?.companyId) return [];
        }

        setLoading(true);
        try {
            let q;
            // Agar global true hai toh poora collection lao (SuperAdmin ke liye)
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
            
            // Client side sorting
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
    // 🔥 isGlobal = true is for creating a new company during registration
    const addSaaSData = async (collectionName: string, payload: any, isGlobal: boolean = false) => {
        if (!isGlobal && !currentUser?.companyId) return { success: false, error: "Company ID required" };

        setLoading(true);
        try {
            const finalData = {
                ...payload,
                companyId: isGlobal ? (payload.companyId || 'GLOBAL') : currentUser?.companyId,
                senderId: payload.senderId || currentUser?.id || currentUser?.uid || 'System',
                senderName: payload.senderName || currentUser?.name || 'System',
                createdAt: payload.createdAt || new Date().toISOString(),
                timestamp: payload.timestamp || Date.now()
            };

            const docRef = await addDoc(collection(db, collectionName), finalData);
            
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