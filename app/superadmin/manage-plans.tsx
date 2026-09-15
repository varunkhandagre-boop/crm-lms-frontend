import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import {
    BillingSettings,
    createPlan,
    deletePlan,
    fetchBillingSettings,
    listPlans,
    Plan,
    saveBillingSettings,
    updatePlan,
} from '../../services/api/superadminPlans';

type PlanForm = {
    id: string; // '' for a new plan, real uuid when editing
    label: string;
    durationMonths: string;
    pricePerEmployee: string;
    discountPercent: string;
    active: boolean;
};

const EMPTY_FORM: PlanForm = {
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
    const [plans, setPlans] = useState<Plan[]>([]);

    // Billing settings (UPI + automation add-on price) — one backend record,
    // so any save here must send all three fields together (see PUT schema).
    const [upiId, setUpiId] = useState('');
    const [upiPayeeName, setUpiPayeeName] = useState('');
    const [automationAddonPrice, setAutomationAddonPrice] = useState('3000');
    const [savingAutomationPrice, setSavingAutomationPrice] = useState(false);

    // Modal / form state
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<PlanForm>(EMPTY_FORM);

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [plansRes, billingRes] = await Promise.all([
                listPlans(),
                fetchBillingSettings().catch(() => null), // may not exist yet on a fresh DB
            ]);
            setPlans(plansRes);
            if (billingRes) {
                setUpiId(billingRes.upiId || '');
                setUpiPayeeName(billingRes.upiPayeeName || '');
                setAutomationAddonPrice(String(billingRes.automationAddonPrice ?? '3000'));
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not load plans. Check your connection.');
        } finally {
            setLoading(false);
        }
    };

    // Sends all three billing fields together — the backend PUT replaces the
    // whole billing-settings record, so a partial save would wipe the rest.
    const persistBilling = async (overrides: Partial<BillingSettings>) => {
        const payload: BillingSettings = {
            upiId,
            upiPayeeName,
            automationAddonPrice: Number(automationAddonPrice) || 0,
            ...overrides,
        };
        return saveBillingSettings(payload);
    };

    const saveUpiDetails = async () => {
        if (!upiId.trim()) {
            Alert.alert('Invalid', 'UPI ID cannot be empty.');
            return;
        }
        setSaving(true);
        try {
            await persistBilling({ upiId: upiId.trim(), upiPayeeName: upiPayeeName.trim() || 'Company' });
            Alert.alert('Saved ✅', 'UPI details updated.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save UPI details.');
        } finally {
            setSaving(false);
        }
    };

    const saveAutomationPrice = async () => {
        const priceNum = Number(automationAddonPrice);
        if (!priceNum || priceNum <= 0) {
            Alert.alert('Invalid', 'Automation price must be a positive number.');
            return;
        }
        setSavingAutomationPrice(true);
        try {
            await persistBilling({ automationAddonPrice: priceNum });
            Alert.alert('Saved ✅', 'Automation add-on price updated. The new price will show next time the Subscription screen is opened.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save automation price.');
        } finally {
            setSavingAutomationPrice(false);
        }
    };

    const openAddForm = () => {
        setForm(EMPTY_FORM);
        setIsEditing(false);
        setModalVisible(true);
    };

    const openEditForm = (plan: Plan) => {
        setForm({
            id: plan.id,
            label: plan.label,
            durationMonths: String(plan.durationMonths),
            pricePerEmployee: String(plan.pricePerEmployee),
            discountPercent: String(plan.discountPercent),
            active: plan.active,
        });
        setIsEditing(true);
        setModalVisible(true);
    };

    const handleSaveForm = async () => {
        if (!form.label.trim()) {
            Alert.alert('Missing Info', 'Please enter a plan label.');
            return;
        }
        const duration = Number(form.durationMonths);
        const price = Number(form.pricePerEmployee);
        const discount = Number(form.discountPercent || '0');

        if (!duration || duration <= 0) {
            Alert.alert('Invalid', 'Duration (months) must be a positive number.');
            return;
        }
        if (!price || price <= 0) {
            Alert.alert('Invalid', 'Price per employee must be a positive number.');
            return;
        }
        if (discount < 0 || discount > 100) {
            Alert.alert('Invalid', 'Discount % must be between 0 and 100.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                label: form.label.trim(),
                durationMonths: duration,
                pricePerEmployee: price,
                discountPercent: discount,
                active: form.active,
            };

            if (isEditing) {
                const updated = await updatePlan(form.id, payload);
                setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
            } else {
                const created = await createPlan({ ...payload, sortOrder: plans.length });
                setPlans(prev => [...prev, created]);
            }

            setModalVisible(false);
            Alert.alert('Success ✅', isEditing ? 'Plan updated.' : 'New plan added.');
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not save changes. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Toggle active/inactive directly from the list.
    const toggleActive = async (plan: Plan, value: boolean) => {
        try {
            const updated = await updatePlan(plan.id, { active: value });
            setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update plan status.');
        }
    };

    // Backend only supports a soft-delete (deactivate) — no hard-delete route
    // is exposed, so "Delete" here always deactivates rather than removing
    // the row. This matches the original screen's safer recommended path.
    const handleDelete = (plan: Plan) => {
        Alert.alert(
            'Deactivate Plan',
            `Deactivate "${plan.label}"? It will stop showing to new subscribers, but existing subscribers on this plan are unaffected.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Deactivate', style: 'destructive', onPress: async () => {
                        try {
                            const updated = await deletePlan(plan.id);
                            setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
                            Alert.alert('Deactivated', 'Plan is now inactive.');
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'Could not deactivate plan.');
                        }
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
                                onValueChange={(val) => toggleActive(plan, val)}
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
                                <Text style={styles.deleteBtnText}>Deactivate</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}

                {/* AUTOMATION ADD-ON PRICE SECTION */}
                <View style={styles.automationCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <Ionicons name="chatbubbles" size={18} color="#2e7d32" />
                        <Text style={[styles.sectionHeader, { marginBottom: 0, marginLeft: 6 }]}>
                            Automation Add-on Price
                        </Text>
                    </View>
                    <Text style={styles.helperText}>
                        This price is shown to every client on the Subscription screen
                        when they select the "WhatsApp/Email Automation" add-on.
                    </Text>
                    <Text style={styles.label}>Price (₹)</Text>
                    <TextInput
                        style={styles.inputBox}
                        value={automationAddonPrice}
                        onChangeText={setAutomationAddonPrice}
                        placeholder="e.g. 3000"
                        keyboardType="numeric"
                    />
                    <TouchableOpacity
                        style={[styles.saveUpiBtn, { backgroundColor: '#2e7d32' }]}
                        onPress={saveAutomationPrice}
                        disabled={savingAutomationPrice}
                    >
                        {savingAutomationPrice
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.btnText}>Save Automation Price</Text>
                        }
                    </TouchableOpacity>
                </View>

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

    automationCard: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginTop: 10, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#c8e6c9' },
    helperText: { fontSize: 12, color: '#888', marginBottom: 5, lineHeight: 17 },

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
