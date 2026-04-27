import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Direct Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function AddProductScreen() {
    const router = useRouter();
    
    // 🔥 1. Context se Notification Engine nikala
    const { addNotification } = useData(); 

    // 🔥 2. Naya SaaS Engine connect kiya
    const { addSaaSData } = useSaaSDB();

    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [series, setSeries] = useState('');
    const [desc, setDesc] = useState('');
    const [specifications, setSpecifications] = useState(''); 
    
    // Price and GST State
    const [price, setPrice] = useState('');
    const [gstRate, setGstRate] = useState('');
    
    const [link, setLink] = useState('');

    // 🔥 3. SAAS SAVE LOGIC
    const handleSave = async () => {
        if (!name || !category || !link) {
            Alert.alert("Missing Fields", "Name, Category and Link are required.");
            return;
        }

        setLoading(true);
        try {
            // 🔥 4. CLEAN PAYLOAD: Engine injects ID, CompanyID, SenderID & CreatedAt
            const newProduct = {
                name,
                category,
                series: series || 'General',
                desc,
                specifications,
                price: Number(price) || 0,     
                gstRate: Number(gstRate) || 0, 
                link
            };

            const result = await addSaaSData("products", newProduct);

            if (result.success) {
                // 🔥 5. PUSH NOTIFICATION
                if (addNotification) {
                    await addNotification({
                        title: "New Product Added 📦",
                        message: `New Product: ${name} (${category}) has been added to catalog.`,
                        to: "All",
                        route: "/catalog",
                        type: "success"
                    });
                }
                Alert.alert("Success", "Product added to catalog!");
                router.back();
            } else {
                Alert.alert("Save Failed", "Could not save the product.");
            }
        } catch (error: any) {
            console.log("Error details:", error);
            Alert.alert("Save Failed", error.message || "Unknown error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Add New Product</Text>
                <View style={{width:24}} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
                <ScrollView contentContainerStyle={{padding: 20}}>
                    <View style={styles.card}>
                        
                        <Text style={styles.label}>Product Name *</Text>
                        <TextInput style={styles.input} placeholder="e.g. Cflow 10C" value={name} onChangeText={setName} />

                        <Text style={styles.label}>Category *</Text>
                        <TextInput style={styles.input} placeholder="e.g. Ventilator / Anesthesia" value={category} onChangeText={setCategory} />

                        <Text style={styles.label}>Series (Optional)</Text>
                        <TextInput style={styles.input} placeholder="e.g. C-Series" value={series} onChangeText={setSeries} />

                        {/* Price & GST Row */}
                        <View style={{flexDirection: 'row', gap: 10}}>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>Base Price (₹)</Text>
                                <TextInput style={styles.input} placeholder="e.g. 50000" keyboardType="numeric" value={price} onChangeText={setPrice} />
                            </View>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>GST Rate (%)</Text>
                                <TextInput style={styles.input} placeholder="e.g. 18" keyboardType="numeric" value={gstRate} onChangeText={setGstRate} />
                            </View>
                        </View>

                        <Text style={styles.label}>Description</Text>
                        <TextInput style={[styles.input, {height: 80, textAlignVertical:'top'}]} multiline placeholder="Short description..." value={desc} onChangeText={setDesc} />

                        <Text style={styles.label}>Specifications (For Quotations)</Text>
                        <TextInput style={[styles.input, {height: 100, textAlignVertical:'top'}]} multiline placeholder="Type specifications line by line..." value={specifications} onChangeText={setSpecifications} />

                        <Text style={styles.label}>Catalog / Drive Link *</Text>
                        <TextInput style={styles.input} placeholder="Paste Google Drive Link here..." value={link} onChangeText={setLink} />
                        <Text style={{fontSize:11, color:'gray', marginBottom:20}}>Paste the shareable link of PDF or Image from Google Drive.</Text>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Product</Text>}
                        </TouchableOpacity>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 2, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    card: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 3 },
    label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 8, marginTop: 10 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, fontSize: 15, color: '#333' },
    saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});