import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import { useData } from '../app/context/DataContext';
import { db } from '../firebaseConfig';

export const useSaaSDB = () => {
    const { currentUser } = useData();
    const [loading, setLoading] = useState(false);

    // 1. FETCH DATA
    const fetchSaaSData = async (collectionName: string) => {
        // Super Admin ko client data nahi dikhana hai
        if (currentUser?.role === 'SuperAdmin') {
            console.log("Super Admin restricted from viewing client data.");
            return []; 
        }

        if (!currentUser?.companyId) return [];

        setLoading(true);
        try {
            const q = query(
                collection(db, collectionName),
                where("companyId", "==", currentUser.companyId),
                orderBy("createdAt", "desc") 
            );

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return data;
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return [];
        } finally {
            setLoading(false);
        }
    };

    // 2. ADD DATA
    const addSaaSData = async (collectionName: string, payload: any) => {
        if (!currentUser?.companyId) throw new Error("Company ID required");

        try {
            const finalData = {
                ...payload,
                companyId: currentUser.companyId,
                senderId: currentUser.id,
                senderName: currentUser.name,
                createdAt: new Date().toISOString()
            };

            const docRef = await addDoc(collection(db, collectionName), finalData);
            await updateDoc(docRef, { id: docRef.id }); 
            
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error };
        }
    };

    // 3. UPDATE DATA
    const updateSaaSData = async (collectionName: string, docId: string, updatedFields: any) => {
        try {
            const docRef = doc(db, collectionName, docId);
            await updateDoc(docRef, {
                ...updatedFields,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.name
            });
            return { success: true };
        } catch (error) {
            return { success: false, error };
        }
    };

    // 4. DELETE DATA
    const deleteSaaSData = async (collectionName: string, docId: string) => {
        try {
            await deleteDoc(doc(db, collectionName, docId));
            return { success: true };
        } catch (error) {
            return { success: false, error };
        }
    };

    return { fetchSaaSData, addSaaSData, updateSaaSData, deleteSaaSData, isDbLoading: loading };
};