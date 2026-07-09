import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../firebaseConfig';

type PlanConfig = {
    id: string;
    label: string;
    durationMonths: string;
    pricePerEmployee: string;
    discountPercent: string;
    active: boolean;
};

const EMPTY_FORM: PlanConfig = {
    id: '',
    label: '',
    durationMonths: '',
    pricePerEmployee: '',
    discountPercent: '0',
    active: true,
};

export default function ManagePlansScreen() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [plans, setPlans] = useState<PlanConfig[]>([]);

    // UPI settings (same doc, so we manage them here too)
    const [upiId, setUpiId] = useState('');
    const [upiPayeeName, setUpiPayeeName] = useState('');

    // Modal / form state
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<PlanConfig>(EMPTY_FORM);

    useEffect(() => {
        loadPricingDoc();
    }, []);

    // 🔥 LOAD FULL PRICING DOC (plans array + upi fields)
    const loadPricingDoc = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, "settings", "pricing");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const rawPlans = (data.plans || []).map((p: any) => ({
                    id: String(p.id ?? ''),
                    label: String(p.label ?? ''),
                    durationMonths: String(p.durationMonths ?? ''),
                    pricePerEmployee: String(p.pricePerEmployee ?? ''),
                    discountPercent: String(p.discountPercent ?? '0'),
                    active: p.active !== false && p.active !== "false",
                }));
                setPlans(rawPlans);
                setUpiId(data.upiId || '');
                setUpiPayeeName(data.upiPayeeName || '');
            } else {
                // Doc doesn't exist yet — will be created on first save
                setPlans([]);
            }
        } catch (e) {
            console.log("Error loading pricing doc:", e);
            Alert.alert("Error", "Could not load plans. Check your internet connection.");
        } finally {
            setLoading(false);
        }
    };

    // 🔥 SAVE ENTIRE plans ARRAY BACK TO FIRESTORE
    // (Firestore array fields don't support partial edits, so we always
    // replace the full array — this is the safe, standard approach)
    const persistPlans = async (updatedPlans: PlanConfig[]) => {
        setSaving(true);
        try {
            const cleanPlans = updatedPlans.map(p => ({
                id: p.id,
                label: p.label,
                durationMonths: Number(p.durationMonths) || 0,
                pricePerEmployee: Number(p.pricePerEmployee) || 0,
                discountPercent: Number(p.discountPercent) || 0,
                active: p.active,
            }));

            const docRef = doc(db, "settings", "pricing");
            await updateDoc(docRef, { plans: cleanPlans });

            setPlans(updatedPlans);
            return true;
        } catch (e) {
            console.log("Error saving plans:", e);
            Alert.alert("Error", "Could not save changes. Please try again.");
            return false;
        } finally {
            setSaving(false);
        }
    };

    // 🔥 SAVE UPI DETAILS
    const saveUpiDetails = async () => {
        if (!upiId.trim()) {
            Alert.alert("Invalid", "UPI ID cannot be empty.");
            return;
        }
        setSaving(true);
        try {
            const docRef = doc(db, "settings", "pricing");
            await updateDoc(docRef, {
                upiId: upiId.trim(),
                upiPayeeName: upiPayeeName.trim() || 'Company',
            });
            Alert.alert("Saved ✅", "UPI details updated.");
        } catch (e) {
            Alert.alert("Error", "Could not save UPI details.");
        } finally {
            setSaving(false);
        }
    };

    const openAddForm = () => {
        setForm(EMPTY_FORM);
        setIsEditing(false);
        setModalVisible(true);
    };

    const openEditForm = (plan: PlanConfig) => {
        setForm(plan);
        setIsEditing(true);
        setModalVisible(true);
    };

    // Auto-generate a safe unique id from the label (slug + short timestamp)
    const generateId = (label: string) => {
        const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return `${slug || 'plan'}-${Date.now().toString().slice(-5)}`;
    };

    // 🔥 VALIDATE + SAVE (ADD or EDIT)
    const handleSaveForm = async () => {
        if (!form.label.trim()) {
            Alert.alert("Missing Info", "Please enter a plan label.");
            return;
        }
        const duration = Number(form.durationMonths);
        const price = Number(form.pricePerEmployee);
        const discount = Number(form.discountPercent || '0');

        if (!duration || duration <= 0) {
            Alert.alert("Invalid", "Duration (months) must be a positive number.");
            return;
        }
        if (!price || price <= 0) {
            Alert.alert("Invalid", "Price per employee must be a positive number.");
            return;
        }
        if (discount < 0 || discount > 100) {
            Alert.alert("Invalid", "Discount % must be between 0 and 100.");
            return;
        }

        let updatedPlans: PlanConfig[];

        if (isEditing) {
            updatedPlans = plans.map(p => p.id === form.id ? { ...form } : p);
        } else {
            const newPlan: PlanConfig = { ...form, id: generateId(form.label) };
            updatedPlans = [...plans, newPlan];
        }

        const ok = await persistPlans(updatedPlans);
        if (ok) {
            setModalVisible(false);
            Alert.alert("Success ✅", isEditing ? "Plan updated." : "New plan added.");
        }
    };

    // 🔥 TOGGLE ACTIVE / INACTIVE (from list, no need to open form)
    const toggleActive = async (planId: string, value: boolean) => {
        const updatedPlans = plans.map(p => p.id === planId ? { ...p, active: value } : p);
        await persistPlans(updatedPlans);
    };

    // 🔥 DELETE — with confirmation. Deactivating is safer for plans that
    // existing subscribers might reference, so we nudge towards that first.
    const handleDelete = (plan: PlanConfig) => {
        Alert.alert(
            "Delete Plan",
            `Delete "${plan.label}" permanently? This cannot be undone.\n\nTip: If old subscribers used this plan, consider just deactivating it instead.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Deactivate Instead", onPress: () => toggleActive(plan.id, false)
                },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        const updatedPlans = plans.filter(p => p.id !== plan.id);
                        const ok = await persistPlans(updatedPlans);
                        if (ok) Alert.alert("Deleted", "Plan removed.");
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color="#3b5998" />
                <Text style={{ marginTop: 10, color: '#666' }}>Loading plans...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Manage Plans</Text>
                <TouchableOpacity onPress={openAddForm} style={styles.addBtn}>
                    <Ionicons name="add" size={22} color="white" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 15 }}>

                {plans.length === 0 && (
                    <Text style={{ textAlign: 'center', color: '#888', marginTop: 30 }}>
                        No plans yet. Tap + to add your first plan.
                    </Text>
                )}

                {plans.map((plan) => (
                    <View key={plan.id} style={[styles.card, !plan.active && styles.cardInactive]}>
                        <View style={styles.cardTop}>
                            <Text style={styles.planLabel}>{plan.label}</Text>
                            <Switch
                                trackColor={{ false: "#767577", true: "#81b0ff" }}
                                thumbColor={plan.active ? "#2e7d32" : "#f4f3f4"}
                                onValueChange={(val) => toggleActive(plan.id, val)}
                                value={plan.active}
                            />
                        </View>
                        <Text style={styles.planDetail}>Duration: {plan.durationMonths} months</Text>
                        <Text style={styles.planDetail}>Price: ₹{plan.pricePerEmployee} / employee / year</Text>
                        <Text style={styles.planDetail}>Discount: {plan.discountPercent}%</Text>
                        <Text style={styles.planId}>id: {plan.id}</Text>

                        <View style={styles.cardActions}>
                            <TouchableOpacity style={styles.editBtn} onPress={() => openEditForm(plan)}>
                                <Ionicons name="create-outline" size={16} color="#3b5998" />
                                <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(plan)}>
                                <Ionicons name="trash-outline" size={16} color="#d32f2f" />
                                <Text style={styles.deleteBtnText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}

                {/* UPI SETTINGS SECTION */}
                <View style={styles.upiCard}>
                    <Text style={styles.sectionHeader}>UPI Payment Settings</Text>
                    <Text style={styles.label}>UPI ID</Text>
                    <TextInput
                        style={styles.inputBox}
                        value={upiId}
                        onChangeText={setUpiId}
                        placeholder="yourcompany@upi"
                        autoCapitalize="none"
                    />
                    <Text style={styles.label}>Payee Name (shown to payer)</Text>
                    <TextInput
                        style={styles.inputBox}
                        value={upiPayeeName}
                        onChangeText={setUpiPayeeName}
                        placeholder="Your Company Name"
                    />
                    <TouchableOpacity style={styles.saveUpiBtn} onPress={saveUpiDetails} disabled={saving}>
                        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save UPI Details</Text>}
                    </TouchableOpacity>
                </View>

            </ScrollView>

            {/* ADD / EDIT MODAL */}
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={styles.modalTitle}>{isEditing ? 'Edit Plan' : 'Add New Plan'}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close-circle" size={28} color="#d32f2f" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.label}>Plan Label</Text>
                            <TextInput
                                style={styles.inputBox}
                                value={form.label}
                                onChangeText={(v) => setForm({ ...form, label: v })}
                                placeholder="e.g. 6 Month Plan"
                            />

                            <Text style={styles.label}>Duration (Months)</Text>
                            <TextInput
                                style={styles.inputBox}
                                value={form.durationMonths}
                                onChangeText={(v) => setForm({ ...form, durationMonths: v })}
                                placeholder="e.g. 6"
                                keyboardType="numeric"
                            />

                            <Text style={styles.label}>Price per Employee / Year (₹)</Text>
                            <TextInput
                                style={styles.inputBox}
                                value={form.pricePerEmployee}
                                onChangeText={(v) => setForm({ ...form, pricePerEmployee: v })}
                                placeholder="e.g. 500"
                                keyboardType="numeric"
                            />

                            <Text style={styles.label}>Discount %</Text>
                            <TextInput
                                style={styles.inputBox}
                                value={form.discountPercent}
                                onChangeText={(v) => setForm({ ...form, discountPercent: v })}
                                placeholder="e.g. 10"
                                keyboardType="numeric"
                            />

                            <View style={styles.statusRow}>
                                <Text style={styles.label}>Active</Text>
                                <Switch
                                    trackColor={{ false: "#767577", true: "#81b0ff" }}
                                    thumbColor={form.active ? "#2e7d32" : "#f4f3f4"}
                                    onValueChange={(v) => setForm({ ...form, active: v })}
                                    value={form.active}
                                />
                            </View>

                            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveForm} disabled={saving}>
                                {saving ? <ActivityIndicator color="white" /> : (
                                    <Text style={styles.btnText}>{isEditing ? 'Save Changes' : 'Add Plan'}</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { backgroundColor: '#3b5998', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 },

    card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
    cardInactive: { opacity: 0.6, borderLeftWidth: 4, borderLeftColor: '#d32f2f' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    planLabel: { fontSize: 17, fontWeight: 'bold', color: '#333' },
    planDetail: { color: '#666', fontSize: 13, marginTop: 4 },
    planId: { color: '#aaa', fontSize: 11, marginTop: 6, fontStyle: 'italic' },

    cardActions: { flexDirection: 'row', gap: 15, marginTop: 12, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    editBtnText: { color: '#3b5998', fontWeight: 'bold', fontSize: 13 },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deleteBtnText: { color: '#d32f2f', fontWeight: 'bold', fontSize: 13 },

    upiCard: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginTop: 10, marginBottom: 30, elevation: 2 },
    sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
    saveUpiBtn: { backgroundColor: '#3b5998', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },

    label: { fontSize: 12, color: '#888', marginTop: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    inputBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 15, marginTop: 5, backgroundColor: '#fafafa' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '90%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },

    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },

    saveBtn: { backgroundColor: '#2e7d32', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});