import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { pickerHandlers } from '../utils/datePickerHandlers';
import * as Location from 'expo-location';
import { getCurrentLocation as getGpsFix } from '../utils/getLocation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from './context/DataContext';
// 🔥 Phase 1/2: lead update/delete and visit logging now via the new backend API
import { deleteLead as apiDeleteLead, getLead, updateLead as apiUpdateLead } from '../services/api/leads';
import { isWebsiteLead } from '../services/api/websiteLeads';
import { createSalesVisit } from '../services/api/salesVisits';
import { listProducts } from '../services/api/products';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
import { formatInr, isLostState, LOST_REASONS, LostReason } from '../constants/leadStatus';
import { listLeadQuotations } from '../services/api/quotations';
import { fetchTeamMembers } from '../services/api/users';

export default function LeadDetailsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams();
    
    const { currentUser } = useData();

    // Only this one lead is fetched (by id) — this screen used to download
    // the company's entire lead list just to find it. Products stay
    // cache-first, sharing product_master.tsx's 'products' key.
    const [fetchedLead, setFetchedLead] = useState<any>(null);
    const [quotes, setQuotes] = useState<any[]>([]);
    const refreshLeads = useCallback(async () => {
        if (!id) return;
        try {
            const [l, q] = await Promise.all([getLead(String(id)), listLeadQuotations(String(id)).catch(() => [])]);
            setFetchedLead(l);
            setQuotes(q);
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not load this lead');
        }
    }, [id]);
    // Runs on first open AND when coming back (e.g. after creating a
    // quotation, which moves the lead's stage on the server).
    useFocusEffect(useCallback(() => { refreshLeads(); }, [refreshLeads]));

    const { data: teamMembers } = useCachedList({
        cacheKey: buildCacheKey('team_members', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: fetchTeamMembers,
    });
    const [showAssignPicker, setShowAssignPicker] = useState(false);
    const [editDealValue, setEditDealValue] = useState('');

    const { data: productList } = useCachedList({
        cacheKey: buildCacheKey('products', currentUser?.companyId),
        enabled: !!currentUser?.companyId,
        fetcher: listProducts,
    });

    const [lead, setLead] = useState<any>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Log Visit Modal States
    const [logModalVisible, setLogVisitModalVisible] = useState(false);
    const [editOutcome, setEditOutcome] = useState('Follow Up');
    const [editStage, setEditStage] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editNextDate, setEditNextDate] = useState(new Date());
    const [editLostReason, setEditLostReason] = useState<LostReason | ''>('');
    const [editLostNote, setEditLostNote] = useState('');
    const [showLostReasonPicker, setShowLostReasonPicker] = useState(false);
    const markingLost = isLostState(editOutcome, editStage);
    
    // 🔥 Multiple Product & Search States
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [otherProductText, setOtherProductText] = useState('');
    const [productSearchText, setProductSearchText] = useState(''); 
    
    // Pickers
    const [showNextDatePicker, setShowNextDatePicker] = useState(false);
    const [showOutcomePicker, setShowOutcomePicker] = useState(false);
    const [showStagePicker, setShowStagePicker] = useState(false);
    const [showProductPicker, setShowProductPicker] = useState(false);

    const [isRecording, setIsRecording] = useState(false);

    const outcomeOptions = ['Interested', 'Follow Up', 'Demo Planned', 'Order Expected', 'Order Closed', 'Lost', 'Not Interested'];
    const stageOptions = ['New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation', 'Order Closed', 'Lost'];
    const pipelineStages = ['New', 'Introduction', 'Technical Review', 'Quotation', 'Negotiation', 'Order Closed'];

    // 🔥 STRICT ADMIN FOR DELETE
    const userRole = (currentUser?.role || '').toLowerCase().trim();
    const isStrictAdmin = ['admin', 'manager', 'superadmin'].includes(userRole);

    const getProductOptions = () => {
        const dbProducts = productList.map((p: any) => p.model ? `${p.name} - ${p.model}` : p.name);
        return [...dbProducts, "Other"];
    };

    useEffect(() => {
        const found = fetchedLead;
        if (found) {
            setLead(found);
            setEditOutcome(found.status || 'Follow Up');
            setEditStage(found.stage || 'New');
            
            // 🔥 Initialize Multiple Products safely
            let initialProducts: string[] = [];
            if (Array.isArray(found.requirements) && found.requirements.length > 0) {
                initialProducts = found.requirements;
            } else if (found.product) {
                if (Array.isArray(found.product)) {
                    initialProducts = found.product;
                } else if (typeof found.product === 'string' && found.product.trim() !== '') {
                    initialProducts = [found.product];
                }
            }
            setSelectedProducts(initialProducts);

            if (found.nextDate) setEditNextDate(new Date(found.nextDate));
            setEditLostReason((found.lostReason as LostReason) || '');
            setEditDealValue(found.dealValue ? String(found.dealValue) : '');
            setEditLostNote(found.lostReasonNote || '');
        }
    }, [fetchedLead]);

    const toggleRecording = () => {
        Alert.alert("Coming Soon 🎤", "Voice-to-Text feature will be available in the next update!");
    };

    const reassignTo = (member: { id: string; name: string }) => {
        setShowAssignPicker(false);
        if (member.id === lead?.assignedTo) return;
        Alert.alert('Reassign Lead?', `${lead.orgName || lead.org} will be assigned to ${member.name}.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Reassign', onPress: async () => {
                    try {
                        await apiUpdateLead(lead.id, { assignedToId: member.id });
                        await refreshLeads();
                        Alert.alert('Done ✅', `Lead assigned to ${member.name}.`);
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not reassign');
                    }
                },
            },
        ]);
    };

    const handleCall = () => {
        if (lead?.mobile) Linking.openURL(`tel:${lead.mobile}`);
        else Alert.alert("No Number", "Mobile number not available.");
    };

    const openWhatsApp = () => {
        const mobile = lead?.mobile || lead?.contactNumber || '';
        if (!mobile) return Alert.alert("Error", "No mobile number found.");
        const product = Array.isArray(lead?.requirements) ? lead.requirements.join(', ') : (lead?.product || 'your inquiry');
        let msg = `Hello ${lead.contactPerson},\n\nGreetings from our Sales Team.\nWe are following up regarding requirements for *${product}* at *${lead.org || lead.orgName}*.\n\nRegards,\n*Team*`;
        Linking.openURL(`whatsapp://send?phone=91${mobile}&text=${encodeURIComponent(msg)}`).catch(() => Alert.alert("Error", "WhatsApp not installed"));
    };

    const getCurrentLocation = async () => {
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return null;
            let location = await getGpsFix();
            return { lat: location.coords.latitude, lng: location.coords.longitude, timestamp: new Date().toISOString() };
        } catch (error) { return null; }
    };

    // 🔥 Toggle Multiple Products
    const toggleProductSelection = (item: string) => {
        setSelectedProducts(prev => {
            if (prev.includes(item)) {
                if (item === 'Other') setOtherProductText('');
                return prev.filter(p => p !== item);
            } else {
                return [...prev, item];
            }
        });
    };

    const getSelectedProductsText = () => {
        if (selectedProducts.length === 0) return '';
        let displayText = selectedProducts.filter(p => p !== 'Other').join(', ');
        if (selectedProducts.includes('Other') && otherProductText) {
             displayText += displayText ? `, ${otherProductText}` : otherProductText;
        } else if (selectedProducts.includes('Other')) {
             displayText += displayText ? `, Other` : 'Other';
        }
        return displayText;
    };

    const renderProductList = (productData: any) => {
        if (!productData) return null;
        if (Array.isArray(productData) && productData.length > 0) {
            return (
                <View style={{ marginTop: 4 }}>
                    {productData.map((prod, idx) => (
                        <View key={idx} style={{flexDirection:'row', alignItems:'flex-start', marginTop: 3}}>
                            <Ionicons name="cube-outline" size={12} color="#1565c0" style={{marginTop: 2}} />
                            <Text style={{fontSize:13, color:'#333', marginLeft:6, fontWeight:'500', flex: 1}}>
                                {prod}
                            </Text>
                        </View>
                    ))}
                </View>
            );
        }
        if (typeof productData === 'string' && productData.trim() !== '') {
            return (
                <View style={{flexDirection:'row', alignItems:'center', marginTop:4}}>
                    <Ionicons name="cube-outline" size={12} color="#1565c0" />
                    <Text style={{fontSize:13, color:'#333', marginLeft:6, fontWeight:'500'}}>{productData}</Text>
                </View>
            );
        }
        return null;
    };

    // 🔥 DUAL SAVE LOGIC (Log Visit + Update Lead) — via new backend API
    const handleLogVisit = async () => {
        if (!editNote.trim()) return Alert.alert("Required", "Please enter discussion note.");
        if (selectedProducts.includes('Other') && !otherProductText.trim()) return Alert.alert("Required", "Please type the new product name.");
        if (markingLost && !editLostReason) return Alert.alert("Required", "Please select why this lead was lost.");
        if (markingLost && editLostReason === 'Other' && !editLostNote.trim()) return Alert.alert("Required", "Please describe the reason for losing this lead.");
        
        setIsUpdating(true);
        try {
            const locationData = await getCurrentLocation();
            const nextDateISO = editNextDate.toISOString().split('T')[0];
            const todayString = new Date().toLocaleDateString('en-GB');

            let finalProductsToSave = selectedProducts.filter(p => p !== 'Other');
            if (selectedProducts.includes('Other') && otherProductText.trim()) {
                finalProductsToSave.push(otherProductText.trim());
            }
            const productDisplayString = finalProductsToSave.join(', ');

            // 1. CREATE VISIT — linked to this existing lead via leadId, so
            // the backend does NOT auto-create a second lead for it.
            await createSalesVisit({
                visitType: 'Follow Up',
                orgName: lead.org || lead.orgName,
                orgId: lead.orgId || undefined,
                contactPerson: lead.contactPerson || undefined,
                mobile: lead.mobile || undefined,
                city: lead.city || undefined,
                products: finalProductsToSave,
                discussion: editNote,
                outcome: editOutcome,
                nextFollowUp: nextDateISO,
                location: locationData ? { latitude: locationData.lat, longitude: locationData.lng } : null,
                leadId: lead.id,
            });

            // 2. UPDATE LEAD
            let finalStatus = editOutcome === 'Order Closed' ? 'Converted' : editOutcome;
            // Note: this is lead TYPE (Hot/Warm/Cold), not deal outcome —
            // 'Won' isn't a valid type, `status: 'Converted'` already covers that.
            const apiLeadType: 'HOT' | 'WARM' | 'COLD' =
                editOutcome === 'Order Expected' ? 'HOT' :
                lead.type === 'Hot' ? 'HOT' :
                lead.type === 'Cold' ? 'COLD' : 'WARM';

            // Only send the reason when it's new or edited, so re-logging a note
            // on an already-lost lead doesn't add a "reason updated" entry each time.
            const parsedDeal = parseFloat(editDealValue.replace(/[^0-9.]/g, ''));
            const newDealValue = editDealValue.trim() && !isNaN(parsedDeal) ? parsedDeal : null;
            const dealValueChanged = (newDealValue ?? null) !== (lead.dealValue ?? null);

            const lostReasonChanged = markingLost && !!editLostReason && (
                !isLostState(lead.status, lead.stage) ||
                editLostReason !== (lead.lostReason || '') ||
                editLostNote.trim() !== (lead.lostReasonNote || '')
            );
            const lostLine = markingLost ? `\nLost Reason: ${editLostReason}${editLostNote.trim() ? ` — ${editLostNote.trim()}` : ''}` : '';
            const logEntry = `📅 ${todayString}: Visit/Follow-up Logged.\nStatus: ${editOutcome} | Stage: ${editStage}${lostLine}\nProducts: ${productDisplayString}\nNote: ${editNote}`;
            const updatedDiscussion = lead.discussion ? `${logEntry}\n────────────────\n${lead.discussion}` : logEntry;

            await apiUpdateLead(lead.id, {
                status: finalStatus,
                stage: editStage,
                type: apiLeadType,
                requirements: finalProductsToSave,
                isHot: apiLeadType === 'HOT',
                nextDate: nextDateISO,
                discussion: updatedDiscussion,
                ...(dealValueChanged ? { dealValue: newDealValue } : {}),
                ...(lostReasonChanged
                    ? { lostReason: editLostReason as LostReason, lostReasonNote: editLostNote.trim() || undefined }
                    : {}),
            });

            // 3. Timeline history is now handled automatically by the
            // backend: apiUpdateLead() above appends a new history entry
            // itself whenever `discussion` is included in the update.
            // (No Firestore addLeadActivity call needed anymore — leads
            // don't have a Firestore document to update since Phase 1.)

            if (refreshLeads) await refreshLeads();
            setLogVisitModalVisible(false);
            setEditNote('');

            setLead((prev: any) => ({
                ...prev,
                status: finalStatus,
                stage: editStage,
                type: apiLeadType === 'HOT' ? 'Hot' : apiLeadType === 'COLD' ? 'Cold' : 'Warm',
                requirements: finalProductsToSave,
                product: productDisplayString,
                nextDate: nextDateISO,
                discussion: updatedDiscussion,
                lostReason: markingLost ? editLostReason : '',
                lostReasonNote: markingLost ? editLostNote.trim() : '',
                dealValue: newDealValue,
            }));
            
            Alert.alert("Success", "Visit Logged & Lead Updated Successfully! 🚀");
            
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    // 🔥 ADMIN DELETE — via new backend API
    const handleDeleteLead = async () => {
        if (!lead) return;
        Alert.alert(
            "Delete Lead?",
            "Are you sure you want to permanently delete this lead? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Delete", 
                    style: "destructive", 
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await apiDeleteLead(lead.id);
                            Alert.alert("Deleted", "Lead has been deleted successfully.");
                            router.back(); // the Leads list refreshes itself when it regains focus
                        } catch (error: any) {
                            Alert.alert("Error", error.message);
                        } finally {
                            setIsDeleting(false);
                        }
                    } 
                }
            ]
        );
    };

    const renderHistoryItem = (item: any, index: number) => {
        const isSystem = item.type === 'System' || item.type === 'New Lead';
        const isVisit = item.type === 'Visit';
        
        if (isSystem) {
            return (
                <View key={index} style={styles.systemLogBox}>
                    <Text style={styles.systemLogText}>✨ {item.msg}</Text>
                    <Text style={styles.tinyDate}>{item.date} • By {item.by}</Text>
                </View>
            );
        } else {
            const isMe = item.by === currentUser?.name;
            return (
                <View key={index} style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther, isVisit && {borderColor: '#4caf50', borderWidth: 1}]}>
                    <View style={styles.chatHeader}>
                        <Text style={[styles.chatUser, isMe && {color: '#3b5998'}]}>{isMe ? 'You' : item.by} {isVisit && '📍 (Visit)'}</Text>
                        <Text style={styles.chatDate}>{item.date}</Text>
                    </View>
                    <Text style={styles.chatText}>{item.msg}</Text>
                    {item.changeNote ? <Text style={styles.systemNote}>{item.changeNote}</Text> : null}
                </View>
            );
        }
    };

    if (!lead) return <View style={styles.container}><ActivityIndicator size="large" style={{marginTop: 50}} color="#3b5998" /></View>;
    
    const history = lead.history ? [...lead.history].reverse() : [];

    return (
        <View style={styles.container}>
            <View style={[styles.header, {paddingTop: insets.top + 15}]}>
                <TouchableOpacity onPress={() => router.back()} style={{padding:5}}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Lead Details</Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                    <TouchableOpacity onPress={openWhatsApp} style={[styles.actionIconBtn, {backgroundColor: '#25D366'}]}>
                        <Ionicons name="logo-whatsapp" size={18} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCall} style={styles.actionIconBtn}>
                        <Ionicons name="call" size={18} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
                <ScrollView 
                    style={styles.content} 
                    contentContainerStyle={{paddingBottom: 150}} 
                    keyboardShouldPersistTaps="handled"
                >

                    {/* 🔥 VISUAL PIPELINE */}
                    <View style={styles.pipelineWrapper}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{alignItems: 'center'}}>
                            {pipelineStages.map((stage, index) => {
                                const isActive = lead.stage === stage;
                                const isPassed = pipelineStages.indexOf(lead.stage) > index;
                                return (
                                    <View key={stage} style={{flexDirection: 'row', alignItems: 'center'}}>
                                        <View style={[styles.stageBubble, isActive && styles.activeStageBubble, isPassed && styles.passedStageBubble]}>
                                            <Text style={[styles.stageText, (isActive || isPassed) && styles.activeStageText]}>
                                                {isPassed ? '✓' : index + 1}
                                            </Text>
                                        </View>
                                        <Text style={[styles.stageLabel, isActive && styles.activeStageLabel]}>{stage}</Text>
                                        {index < pipelineStages.length - 1 && <View style={[styles.stageLine, isPassed && {backgroundColor: '#4caf50'}]} />}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* 1. TOP CARD */}
                    <View style={styles.card}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems: 'flex-start'}}>
                            <View style={{flex:1}}>
                                <Text style={styles.orgName}>{lead.orgName || lead.org}</Text>
                                <Text style={styles.subText}>{lead.contactPerson} • {lead.mobile}</Text>
                                <Text style={styles.subText}>{lead.city || 'No City'}</Text>
                            </View>
                            <View style={{alignItems:'flex-end'}}>
                                <View style={[styles.statusTag, {backgroundColor: lead.isHot ? '#ffebee' : '#e3f2fd'}]}>
                                    <Text style={{color: lead.isHot ? '#d32f2f' : '#1976d2', fontWeight:'bold', fontSize:10}}>
                                        {lead.isHot ? '🔥 HOT' : '🌤️ WARM'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        
                        <View style={styles.divider}/>
                        
                        <View style={styles.reqBox}>
                            <Text style={{fontSize: 12, fontWeight: 'bold', color: 'gray', marginBottom: 2}}>Requirements / Products</Text>
                            {renderProductList(lead.requirements || lead.product) || <Text style={{fontSize: 13, color: '#444'}}>None</Text>}
                        </View>
                        
                        <View style={styles.row}>
                            <View style={styles.actionPill}>
                                <Text style={styles.pillLabel}>Status</Text>
                                <Text style={[styles.pillValue, {color: lead.status === 'Lost' ? 'red' : '#333'}]}>{lead.status}</Text>
                            </View>
                            <View style={styles.actionPill}>
                                <Text style={styles.pillLabel}>Next Follow-up</Text>
                                <Text style={[styles.pillValue, {color:'#d32f2f'}]}>
                                    {lead.nextDate ? new Date(lead.nextDate).toLocaleDateString('en-GB') : 'N/A'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={styles.actionPill}>
                                <Text style={styles.pillLabel}>Deal Value</Text>
                                <Text style={[styles.pillValue, { color: '#2e7d32' }]}>
                                    {lead.dealValue ? formatInr(lead.dealValue) : 'Not set'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.actionPill}
                                disabled={!isStrictAdmin}
                                onPress={() => setShowAssignPicker(true)}
                            >
                                <Text style={styles.pillLabel}>Assigned To {isStrictAdmin ? '✎' : ''}</Text>
                                <Text style={styles.pillValue} numberOfLines={1}>
                                    {teamMembers.find((m: any) => m.id === lead.assignedTo)?.name || '—'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {isWebsiteLead(lead.source) && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f7fa', borderRadius: 8, padding: 8, marginTop: 8 }}>
                                <Ionicons name="globe-outline" size={16} color="#00838f" />
                                <Text style={{ marginLeft: 8, color: '#00838f', fontWeight: 'bold', fontSize: 12, flex: 1 }}>
                                    Website lead — {lead.source.replace(/^website\s*-\s*/i, '') || 'website form'}
                                </Text>
                            </View>
                        )}

                        {isLostState(lead.status, lead.stage) && (
                            <View style={styles.lostReasonBox}>
                                <Ionicons name="close-circle" size={16} color="#c62828" />
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text style={styles.lostReasonTitle}>
                                        Lost Reason: {lead.lostReason || 'Not recorded'}
                                    </Text>
                                    {lead.lostReasonNote ? <Text style={styles.lostReasonNote}>{lead.lostReasonNote}</Text> : null}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* 🔥 GENERATE QUOTATION BUTTON */}
                    <TouchableOpacity 
                        style={{backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#90caf9'}}
                        onPress={() => router.push({
                            pathname: '/add_quotation',
                            params: {
                                mode: 'from_lead',
                                leadId: lead.id,
                                leadOrg: lead.org || lead.orgName || '',
                                leadPerson: lead.contactPerson || '',
                                leadMobile: lead.mobile || '',
                                leadCity: lead.city || '',
                                leadAddress: lead.address || '',
                                leadProduct: Array.isArray(lead.requirements) ? lead.requirements.join(', ') : lead.product || ''
                            }
                        })}
                    >
                        <Ionicons name="document-text" size={20} color="#1565c0" />
                        <Text style={{color: '#1565c0', fontWeight: 'bold', marginLeft: 8}}>📄 Generate Quotation for this Lead</Text>
                    </TouchableOpacity>

                    {quotes.length > 0 && (
                        <View style={styles.quotesBox}>
                            <Text style={styles.quotesTitle}>📑 Quotations for this lead ({quotes.length})</Text>
                            {quotes.map((q: any) => (
                                <TouchableOpacity
                                    key={q.id}
                                    style={styles.quoteRow}
                                    onPress={() => router.push({ pathname: '/add_quotation', params: { id: q.id, mode: 'edit' } } as any)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#333', fontSize: 13 }}>{q.estimateNo}</Text>
                                        <Text style={{ fontSize: 11, color: 'gray' }}>{q.date ? new Date(q.date).toLocaleDateString('en-GB') : ''} • {q.status}</Text>
                                    </View>
                                    <Text style={{ fontWeight: 'bold', color: '#1565c0' }}>₹{Number(q.grandTotal || 0).toLocaleString('en-IN')}</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#999" style={{ marginLeft: 6 }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {(lead.stage === 'Order Closed' || lead.status === 'Converted') && (
                        <TouchableOpacity 
                            style={{backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#a5d6a7'}}
                            onPress={() => router.push({
                                pathname: '/add_order',
                                params: {
                                    mode: 'from_lead',
                                    leadId: lead.id,
                                    leadOrgId: lead.orgId || '',
                                    leadOrg: lead.org || lead.orgName || '',
                                    leadPerson: lead.contactPerson || '',
                                    leadMobile: lead.mobile || '',
                                    leadEmail: lead.email || '',
                                    leadCity: lead.city || '',
                                    leadAddress: lead.address || '',
                                    leadProduct: Array.isArray(lead.requirements) ? lead.requirements.join(', ') : lead.product || ''
                                }
                            })}
                        >
                            <Ionicons name="cart" size={20} color="#2e7d32" />
                            <Text style={{color: '#2e7d32', fontWeight: 'bold', marginLeft: 8}}>🎉 Convert Deal to Order (Won)</Text>
                        </TouchableOpacity>
                    )}

                    {isStrictAdmin && (
                        <TouchableOpacity 
                            style={{backgroundColor: '#ffebee', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#ef9a9a'}}
                            onPress={handleDeleteLead}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <ActivityIndicator size="small" color="#d32f2f" /> : <Ionicons name="trash-outline" size={20} color="#d32f2f" />}
                            <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                {isDeleting ? "Deleting..." : "Delete Lead Permanently"}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* 2. DISCUSSION & NOTES */}
                    <Text style={styles.sectionHeader}>DISCUSSION & NOTES</Text>
                    <View style={{backgroundColor: '#fffde7', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ffe0b2', marginBottom: 20}}>
                        <Text style={{fontSize: 13, color: '#333', lineHeight: 22}}>
                            {lead.discussion || 'No discussion notes available.'}
                        </Text>
                    </View>

                    {/* 3. TIMELINE HISTORY */}
                    <Text style={styles.sectionHeader}>ACTIVITY TIMELINE</Text>
                    <View style={styles.timelineContainer}>
                        {history.length > 0 ? history.map((item: any, index: number) => renderHistoryItem(item, index)) : (
                            <Text style={{textAlign: 'center', color: 'gray', marginTop: 20, fontStyle: 'italic'}}>No history found.</Text>
                        )}
                    </View>
                </ScrollView>

                {/* BOTTOM ACTION BAR */}
                <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom + 10, 20) }]}>
                    <TouchableOpacity style={styles.logVisitBigBtn} onPress={() => setLogVisitModalVisible(true)}>
                        <Ionicons name="create" size={20} color="white" />
                        <Text style={styles.logVisitBigBtnText}>Log Visit & Update Lead</Text>
                    </TouchableOpacity>
                </View>

            </KeyboardAvoidingView>

            {/* 🔥 LOG VISIT MODAL */}
            <Modal visible={logModalVisible} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' }}>
                            <Text style={styles.modalTitle}>Log Visit & Update</Text>
                            <TouchableOpacity onPress={() => setLogVisitModalVisible(false)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                                <Ionicons name="close-circle" size={32} color="#d32f2f" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <View style={styles.updateBox}>
                                <View style={styles.row}>
                                    <View style={styles.col}>
                                        <Text style={styles.label}>Outcome / Status:</Text>
                                        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowOutcomePicker(true)}>
                                            <Text style={{ color: '#333', fontWeight: 'bold' }} numberOfLines={1}>{editOutcome}</Text>
                                            <Ionicons name="chevron-down" size={16} color="gray" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.col}>
                                        <Text style={styles.label}>Pipeline Stage:</Text>
                                        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowStagePicker(true)}>
                                            <Text style={{ color: '#333', fontWeight: 'bold' }} numberOfLines={1}>{editStage}</Text>
                                            <Ionicons name="stats-chart" size={16} color="gray" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {!markingLost && (
                                    <>
                                        <Text style={styles.label}>Expected Deal Value (₹):</Text>
                                        <TextInput
                                            style={styles.pickerBtn}
                                            placeholder="e.g. 450000"
                                            keyboardType="numeric"
                                            value={editDealValue}
                                            onChangeText={setEditDealValue}
                                        />
                                    </>
                                )}

                                {markingLost && (
                                    <View style={styles.lostReasonInputBox}>
                                        <Text style={[styles.label, { color: '#c62828', marginTop: 0 }]}>
                                            Why was this lead lost? <Text style={{color:'red'}}>*</Text>
                                        </Text>
                                        <TouchableOpacity style={[styles.pickerBtn, { backgroundColor: 'white' }]} onPress={() => setShowLostReasonPicker(true)}>
                                            <Text style={{ color: editLostReason ? '#333' : 'gray', fontWeight: 'bold' }} numberOfLines={1}>
                                                {editLostReason || 'Select reason...'}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color="gray" />
                                        </TouchableOpacity>
                                        <TextInput
                                            style={[styles.pickerBtn, { marginTop: 8, backgroundColor: 'white' }]}
                                            placeholder={editLostReason === 'Other' ? 'Describe the reason (required)' : 'Details, e.g. competitor name / quoted price (optional)'}
                                            value={editLostNote}
                                            onChangeText={setEditLostNote}
                                            maxLength={500}
                                        />
                                    </View>
                                )}

                                <Text style={styles.label}>Products Discussed:</Text>
                                <TouchableOpacity style={styles.pickerBtn} onPress={() => { setProductSearchText(''); setShowProductPicker(true); }}>
                                    <Text style={{ color: selectedProducts.length > 0 ? '#333' : 'gray', fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
                                        {getSelectedProductsText() || "Select Product(s)..."}
                                    </Text>
                                    <Ionicons name="cube-outline" size={16} color="gray" />
                                </TouchableOpacity>
                                {selectedProducts.includes('Other') && (
                                    <TextInput 
                                        style={[styles.pickerBtn, {marginTop: 10, backgroundColor: 'white'}]} 
                                        placeholder="Type Other Product Name(s)..." 
                                        value={otherProductText} 
                                        onChangeText={setOtherProductText} 
                                    />
                                )}

                                {!markingLost && (
                                    <>
                                        <Text style={styles.label}>Next Follow-up Date:</Text>
                                        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowNextDatePicker(true)}>
                                            <Text style={{ color: '#333', fontWeight: 'bold' }}>{editNextDate.toLocaleDateString('en-GB')}</Text>
                                            <Ionicons name="calendar" size={16} color="#3b5998" />
                                        </TouchableOpacity>
                                        {showNextDatePicker && <DateTimePicker value={editNextDate} mode="date" {...pickerHandlers((e, d) => { setShowNextDatePicker(false); if (d) setEditNextDate(d); })} />}
                                    </>
                                )}

                                <Text style={[styles.label, {marginTop: 15}]}>Discussion Note <Text style={{color:'red'}}>*</Text></Text>
                                <View style={styles.voiceInputContainer}>
                                    <TextInput 
                                        style={styles.voiceTextInput} 
                                        multiline 
                                        value={editNote} 
                                        onChangeText={setEditNote} 
                                        placeholder="Type your note here..." 
                                    />
                                    <TouchableOpacity 
                                        onPress={toggleRecording} 
                                        style={styles.micBtn}
                                    >
                                        <Ionicons 
                                            name="mic-off-outline" 
                                            size={24} 
                                            color="gray" 
                                        />
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity style={[styles.saveButton, isUpdating && { backgroundColor: '#ccc' }]} onPress={handleLogVisit} disabled={isUpdating}>
                                    {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Update & Create DSR</Text>}
                                </TouchableOpacity>
                            </View>
                            <View style={{ height: 20 }} />
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* PICKERS */}
            <Modal visible={showOutcomePicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowOutcomePicker(false)} />
                    <View style={styles.pickerContainerSmall}>
                        <Text style={styles.pickerHeader}>Select Outcome</Text>
                        <FlatList data={outcomeOptions} keyExtractor={item => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setEditOutcome(item); setShowOutcomePicker(false); }}>
                                <Text style={{ fontSize: 16, color: '#333', fontWeight: editOutcome === item ? 'bold' : 'normal' }}>{item}</Text>
                                {editOutcome === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            <Modal visible={showStagePicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowStagePicker(false)} />
                    <View style={styles.pickerContainerSmall}>
                        <Text style={styles.pickerHeader}>Select Stage</Text>
                        <FlatList data={stageOptions} keyExtractor={item => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setEditStage(item); setShowStagePicker(false); }}>
                                <Text style={{ fontSize: 16, color: '#333', fontWeight: editStage === item ? 'bold' : 'normal' }}>{item}</Text>
                                {editStage === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            <Modal visible={showAssignPicker} transparent animationType="fade" onRequestClose={() => setShowAssignPicker(false)}>
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowAssignPicker(false)} />
                    <View style={[styles.pickerContainerSmall, { maxHeight: 450 }]}>
                        <Text style={styles.pickerHeader}>Assign Lead To</Text>
                        <FlatList
                            data={teamMembers.filter((m: any) => m.status !== 'Disabled')}
                            keyExtractor={(item: any) => item.id}
                            renderItem={({ item }: any) => (
                                <TouchableOpacity style={styles.pickerItem} onPress={() => reassignTo(item)}>
                                    <Text style={{ fontSize: 16, color: '#333', fontWeight: item.id === lead?.assignedTo ? 'bold' : 'normal' }}>{item.name}</Text>
                                    {item.id === lead?.assignedTo && <Ionicons name="checkmark" size={18} color="green" />}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={showLostReasonPicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowLostReasonPicker(false)} />
                    <View style={[styles.pickerContainerSmall, { maxHeight: 420 }]}>
                        <Text style={styles.pickerHeader}>Lost Reason</Text>
                        <FlatList data={LOST_REASONS as readonly string[]} keyExtractor={item => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.pickerItem} onPress={() => { setEditLostReason(item as LostReason); setShowLostReasonPicker(false); }}>
                                <Text style={{ fontSize: 16, color: '#333', fontWeight: editLostReason === item ? 'bold' : 'normal' }}>{item}</Text>
                                {editLostReason === item && <Ionicons name="checkmark" size={18} color="green" />}
                            </TouchableOpacity>
                        )} />
                    </View>
                </View>
            </Modal>

            <Modal visible={showProductPicker} transparent animationType="fade">
                <View style={styles.pickerOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowProductPicker(false)} />
                    <View style={styles.pickerContainerLarge}>
                        <Text style={styles.pickerHeader}>Select Product(s)</Text>
                        
                        <View style={styles.modalSearchBox}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput 
                                style={{flex:1, marginLeft:10, fontSize:15}} 
                                placeholder="Search Product..." 
                                value={productSearchText} 
                                onChangeText={setProductSearchText} 
                            />
                            {productSearchText.length > 0 && (
                                <TouchableOpacity onPress={() => setProductSearchText('')}>
                                    <Ionicons name="close-circle" size={18} color="gray" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <FlatList 
                            data={getProductOptions().filter(p => p.toLowerCase().includes(productSearchText.toLowerCase()))} 
                            keyExtractor={(item, index) => index.toString()} 
                            renderItem={({ item }) => {
                                const isSelected = selectedProducts.includes(item);
                                return (
                                <TouchableOpacity 
                                    style={[styles.pickerItem, isSelected && {backgroundColor: '#e3f2fd'}]} 
                                    onPress={() => toggleProductSelection(item)}
                                >
                                    <Text style={{ fontSize: 15, color: isSelected ? '#1976d2' : '#333', fontWeight: isSelected ? 'bold' : 'normal', flex:1 }}>{item}</Text>
                                    <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#1976d2" : "gray"} />
                                </TouchableOpacity>
                            )}} 
                            ListEmptyComponent={<Text style={{textAlign:'center', color:'gray', marginTop:20}}>No product found.</Text>}
                        />
                        <TouchableOpacity style={[styles.closeBtn, {backgroundColor: '#3b5998', borderRadius: 8, marginTop: 15}]} onPress={() => setShowProductPicker(false)}>
                            <Text style={{color:'white', fontWeight:'bold', fontSize: 16}}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f2f4f8' }, 
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', elevation: 3, alignItems:'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    actionIconBtn: { backgroundColor:'#4caf50', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

    pipelineWrapper: { backgroundColor: 'white', paddingVertical: 15, paddingHorizontal: 10, marginBottom: 15, elevation: 1 },
    stageBubble: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    activeStageBubble: { backgroundColor: '#3b5998', transform: [{scale: 1.2}] },
    passedStageBubble: { backgroundColor: '#4caf50' },
    stageText: { fontSize: 10, color: 'gray', fontWeight: 'bold' },
    activeStageText: { color: 'white' },
    stageLabel: { fontSize: 9, color: 'gray', position: 'absolute', top: 28, width: 60, textAlign: 'center', left: -18 },
    activeStageLabel: { color: '#3b5998', fontWeight: 'bold' },
    stageLine: { width: 30, height: 3, backgroundColor: '#eee', zIndex: 1 },

    content: { padding: 15 },
    card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 1 },
    orgName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    subText: { color: 'gray', fontSize: 13, marginTop: 2 },
    statusTag: { paddingHorizontal:8, paddingVertical:4, borderRadius:6 },
    
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
    reqBox: { backgroundColor:'#f9f9f9', padding:12, borderRadius:8, marginBottom:10, borderWidth: 1, borderColor: '#eee' },
    reqText: { color:'#1565c0', marginLeft:5, fontSize:13, fontWeight:'bold' },

    row: { flexDirection:'row', justifyContent:'space-between', gap:10 },
    col: { width: '48%' },
    actionPill: { flex:1, backgroundColor:'#f9f9f9', padding:10, borderRadius:8, alignItems:'center', borderWidth:1, borderColor:'#e1e4e8' },
    pillLabel: { fontSize:11, color:'gray', marginBottom:2 },
    pillValue: { fontSize:14, fontWeight:'bold', color:'#333' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', paddingHorizontal: 15, paddingTop: 15, borderTopWidth: 1, borderColor: '#eee', elevation: 10 },
    logVisitBigBtn: { flexDirection: 'row', backgroundColor: '#3b5998', padding: 15, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    logVisitBigBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    sectionHeader: { fontSize:12, fontWeight:'bold', color:'#888', marginBottom:10, textAlign:'center' },
    timelineContainer: { paddingBottom: 20 },

    systemLogBox: { alignSelf:'center', backgroundColor:'#e3f2fd', paddingVertical:6, paddingHorizontal:15, borderRadius:15, marginBottom:15, alignItems:'center' },
    systemLogText: { fontSize:11, color:'#1565c0', fontWeight:'bold' },
    tinyDate: { fontSize:9, color:'#90a4ae', marginTop:4 },

    chatBubble: { padding:12, borderRadius:12, marginBottom:10, maxWidth:'85%', elevation:1 },
    chatBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#e1f5fe', borderTopRightRadius: 2 }, 
    chatBubbleOther: { alignSelf: 'flex-start', backgroundColor: 'white', borderTopLeftRadius: 2, marginLeft: 5 }, 
    
    chatHeader: { flexDirection:'row', justifyContent:'space-between', marginBottom:5, width:'100%', gap: 15 },
    chatUser: { fontSize:11, fontWeight:'bold', color:'#e65100' },
    chatDate: { fontSize:10, color:'gray' },
    chatText: { fontSize:14, color:'#333', lineHeight:20 },
    systemNote: { fontSize:11, color:'#1565c0', fontStyle:'italic', marginTop:4, fontWeight:'600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 400 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    updateBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 15 },
    label: { marginTop: 10, marginBottom: 5, fontWeight: '600', color: '#555', fontSize: 12 },
    pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9' },
    saveButton: { backgroundColor: '#4caf50', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    
    voiceInputContainer: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#f9f9f9', paddingRight: 10 },
    voiceTextInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', height: 80, textAlignVertical: 'top', padding: 10, fontSize: 14 },
    micBtn: { marginTop: 15, padding: 8, backgroundColor: '#e3f2fd', borderRadius: 25 },
    
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    pickerContainerSmall: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation: 10 },
    pickerContainerLarge: { width: '90%', height: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: '90%', elevation: 10 },
    pickerHeader: { fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: '#3b5998', textAlign: 'center' },
    pickerItem: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 5 },
    closeBtn: { marginTop: 15, alignItems:'center', padding: 12 },
    
    modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },

    quotesBox: { backgroundColor: 'white', borderRadius: 8, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e3f2fd' },
    quotesTitle: { fontSize: 13, fontWeight: 'bold', color: '#1565c0', marginBottom: 6 },
    quoteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    lostReasonBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#ffebee', borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#ffcdd2' },
    lostReasonTitle: { fontSize: 13, fontWeight: 'bold', color: '#c62828' },
    lostReasonNote: { fontSize: 12, color: '#555', marginTop: 2 },
    lostReasonInputBox: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#ffcdd2', borderRadius: 8, padding: 10, marginTop: 12 },
});
