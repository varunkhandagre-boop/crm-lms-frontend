import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (organizations/users/products still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 1/2: leads now go through the new backend API
import { updateLead as apiUpdateLead, createLead, listLeads } from '../services/api/leads';
import { fetchOrganizations } from '../services/api/organizations';
import { listProducts } from '../services/api/products';
import { fetchTeamMembers } from '../services/api/users';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';

export default function AddLeadScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se sirf user aur notification nikala
  const { currentUser, addNotification } = useData(); 

  // 🔥 2. SaaS Engine ab sirf organizations/users/products ke liye
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  // 🔥 3. Lazy Loaded States
  // orgList now comes from useCachedList below (cache-first, shared 'organizations' key)
  // userList/leadsList now come from useCachedList below (cache-first, shared keys)
  const [productList, setProductList] = useState<any[]>([]);

  // --- FORM STATES ---
  const [org, setOrg] = useState(''); 
  const [orgId, setOrgId] = useState('');

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [clientName, setClientName] = useState(''); 
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [leadOwner, setLeadOwner] = useState(currentUser?.name || 'Select'); 
  const [allocatedTo, setAllocatedTo] = useState(currentUser?.name || 'Select');
  const [leadSource, setLeadSource] = useState('Select');
  const [probability, setProbability] = useState('Select');
  const [status, setStatus] = useState('Open');
  const [leadStage, setLeadStage] = useState('New'); 
  const [leadType, setLeadType] = useState('Hot');
  
  const [nextDate, setNextDate] = useState(new Date());
  const [closingDate, setClosingDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); 
  const [showNextPicker, setShowNextPicker] = useState(false);
  const [showClosingPicker, setShowClosingPicker] = useState(false);

  // Requirements
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [otherRequirement, setOtherRequirement] = useState('');

  const [discussion, setDiscussion] = useState('');
  const [errors, setErrors] = useState({ org: false, allocated: false, discussion: false });

  // Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [currentModalType, setCurrentModalType] = useState('');

  // 🔥 Team members + Leads — cache-first, sharing the SAME cache keys as
  // manage_team.tsx ('team_members') and leads.tsx ('leads') respectively.
  const { data: userList } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  const { data: leadsList } = useCachedList({
      cacheKey: buildCacheKey('leads', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: listLeads, // For duplicate checking — was: fetchSaaSData("leads")
  });

  // 🔥 Organizations — cache-first, shares the SAME 'organizations' cache
  // key as organization.tsx/messaging_center.tsx.
  const { data: orgList } = useCachedList({
      cacheKey: buildCacheKey('organizations', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: () => fetchOrganizations({ limit: 200 }),
  });

  // 🔥 Products — unchanged plain fetch-on-mount (out of scope for this pass).
  useEffect(() => {
      const loadRest = async () => {
          if (currentUser?.companyId) {
              const prods = await listProducts(); // was: fetchSaaSData("products")
              setProductList(prods);
          }
      };
      loadRest();
  }, [currentUser]);

  const employees = (userList && userList.length > 0) ? userList.map((u: any) => u.name || 'Unknown') : ['Loading...']; 

  const getProductOptions = () => {
      const dbProducts = productList.map((p: any) => {
          return p.model ? `${p.name} - ${p.model}` : p.name;
      });
      return [...dbProducts, "Other"];
  };

  const sources = ["Cold Call", "Freelancer", "Dealer", "Tele Calling", "Website", "Existing Customer", "Conference", "Exhibition"];
  const probabilityOptions = ["25", "50", "75", "100"];
  const statusOptions = ["Open", "Replied", "Follow up", "Converted", "Plan Drop", "Lost"];
  const stageOptions = ["New", "Introduction", "Technical Review", "Quotation", "Order Negotiation", "Price Review"];
  const typeOptions = ["Hot", "Warm", "Cold"];
  
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getCurrentLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Location access is required.');
              return null;
          }
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          return {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: new Date().toISOString()
          };
      } catch (error) {
          return null;
      }
  };

  const openModal = (type: string, data: any[]) => {
    setCurrentModalType(type);
    setFilteredData(data);
    setSearchText('');
    setModalVisible(true);
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    
    let sourceData: any[] = [];
    if(currentModalType === 'Organization') sourceData = orgList;
    else if(currentModalType === 'Lead Owner' || currentModalType === 'Allocated To') sourceData = employees;
    else if(currentModalType === 'Source') sourceData = sources;
    else if(currentModalType === 'Requirements') sourceData = getProductOptions(); 
    else if(currentModalType === 'Probability') sourceData = probabilityOptions; 
    else if(currentModalType === 'Status') sourceData = statusOptions;
    else if(currentModalType === 'Stage') sourceData = stageOptions;
    else if(currentModalType === 'Type') sourceData = typeOptions;

    if (text) {
        const newData = sourceData.filter(item => {
            if (typeof item === 'string') {
                return item.toLowerCase().includes(text.toLowerCase());
            } else {
                return (item.orgName || item.name || '').toLowerCase().includes(text.toLowerCase()) || 
                       (item.city || '').toLowerCase().includes(text.toLowerCase());
            }
        });
        setFilteredData(newData);
    } else {
        setFilteredData(sourceData);
    }
  };

  const handleSelect = (item: any) => {
    if (currentModalType === 'Organization') {
        if (typeof item !== 'string') {
            setOrg(item.orgName || item.name); 
            setOrgId(item.id || ''); 
            setAddress(item.address || '');
            setCity(item.city || '');
            setClientName(item.contactPerson || '');
            setMobile(item.mobile || '');
            setEmail(item.email || '');
        } else {
            setOrg(item);
            setOrgId(''); 
        }
        setErrors(e => ({...e, org: false})); 
        setModalVisible(false);
        return;
    }

    const val = item as string;
    switch(currentModalType) {
        case 'Allocated To': setAllocatedTo(val); setErrors(e => ({...e, allocated: false})); setModalVisible(false); break;
        case 'Lead Owner': setLeadOwner(val); setModalVisible(false); break;
        case 'Source': setLeadSource(val); setModalVisible(false); break;
        case 'Probability': setProbability(val); setModalVisible(false); break;
        case 'Status': setStatus(val); setModalVisible(false); break;
        case 'Stage': setLeadStage(val); setModalVisible(false); break;
        case 'Type': setLeadType(val); setModalVisible(false); break;
        
        case 'Requirements': 
            if (!selectedRequirements.includes(val)) {
                setSelectedRequirements([...selectedRequirements, val]);
            }
            setSearchText('');
            setFilteredData(getProductOptions()); 
            break;
    }
  };

  const removeRequirement = (item: string) => {
      setSelectedRequirements(selectedRequirements.filter(r => r !== item));
  };

  // 🔥 5. SAVE & MERGE LOGIC — via new backend API
  const handleSave = async () => {
      if (isSubmitting) return;

      let hasError = false;
      let newErrors = { org: false, allocated: false, discussion: false };

      if (!org.trim()) { newErrors.org = true; hasError = true; }
      if (allocatedTo === 'Select') { newErrors.allocated = true; hasError = true; }
      if (!discussion.trim()) { newErrors.discussion = true; hasError = true; }

      if (selectedRequirements.includes("Other") && !otherRequirement.trim()) {
          Alert.alert("Missing Details", "Please specify the 'Other' requirement.");
          return;
      }

      setErrors(newErrors);

      if (hasError) {
          Alert.alert("Validation Error", "Please fill all required fields.");
      } else {
          setIsSubmitting(true); 

          const locationData = await getCurrentLocation();
          if (!locationData) {
               setIsSubmitting(false); 
               return; 
          }

          let finalRequirements = selectedRequirements.filter(r => r !== "Other");
          if (selectedRequirements.includes("Other") && otherRequirement.trim()) {
              finalRequirements.push(otherRequirement.trim());
          }

          try {
              // 🔥 FAST LOCAL DUPLICATE CHECK (against API-sourced leadsList)
              const existingLead = leadsList.find(d => {
                  return d.orgName === org && 
                         d.status !== 'Closed' && 
                         d.status !== 'Converted' && 
                         d.status !== 'Lost' && 
                         d.status !== 'Plan Drop';
              });

              if (existingLead) {
                  // ⚠️ DUPLICATE FOUND: MERGE DATA VIA NEW API
                  let currentReqs = existingLead.requirements || [];
                  let newReqsToAdd = finalRequirements.filter((r: string) => !currentReqs.includes(r));
                  let updatedReqs = [...currentReqs, ...newReqsToAdd];

                  const todayStr = new Date().toLocaleDateString('en-GB');
                  const newNote = `➕ New Inquiry Merged (${todayStr}):\nAdded Req: ${finalRequirements.join(', ')}\nNote: ${discussion}`;
                  const updatedDiscussion = `${newNote}\n────────────────\n${existingLead.discussion || ''}`;

                  await apiUpdateLead(existingLead.id, {
                      requirements: updatedReqs,
                      discussion: updatedDiscussion,
                      orgId: orgId || existingLead.orgId || undefined, 
                      isHot: leadType === 'Hot' ? true : existingLead.isHot 
                  });

                  Alert.alert(
                      "Lead Merged 🔄", 
                      `This organization already exists.\n\n✅ Added new products: ${newReqsToAdd.join(', ') || 'None'}\n✅ Updated discussion history.`,
                      [{ text: "OK", onPress: () => router.back() }]
                  );
                  
                  setIsSubmitting(false);
                  return; 
              }

          } catch (e) {
              console.log("Error checking duplicate:", e);
          }

          // ✅ CREATE NEW LEAD via the new backend API
          // Note: assignedToId intentionally omitted — backend defaults to
          // the logged-in user, same as this screen's original self-assign
          // behavior ("Allocated To" here is a display label only).
          try {
              await createLead({
                  orgName: org,
                  orgId: orgId || undefined,
                  contactPerson: clientName,
                  mobile,
                  email: email || undefined,
                  address,
                  city,
                  ownerName: leadOwner !== 'Select' ? leadOwner : undefined,
                  status,
                  stage: leadStage,
                  type: leadType.toUpperCase() as 'HOT' | 'WARM' | 'COLD',
                  isHot: leadType === 'Hot',
                  source: leadSource !== 'Select' ? leadSource : undefined,
                  requirements: finalRequirements,
                  discussion,
                  nextDate: nextDate.toISOString().split('T')[0],
                  closingDate: closingDate.toISOString().split('T')[0],
                  location: { latitude: locationData.lat, longitude: locationData.lng },
              });

              if (addNotification) {
                  await addNotification({
                      title: "New Lead Added 👥",
                      message: `${currentUser?.name} added a new lead: ${org}.`,
                      to: "Admin",
                      route: "/leads", 
                      type: "info"
                  });
              }
              Alert.alert("Success", "New Lead Added!");
              router.back();
          } catch (err: any) {
              Alert.alert("Error", err?.message || "Could not save lead.");
          } finally {
              setIsSubmitting(false); 
          }
      }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Lead</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 20}>
        <ScrollView style={styles.contentContainer} contentContainerStyle={{paddingBottom: 100}} keyboardShouldPersistTaps="handled">
            
            <Text style={styles.sectionTitle}>1. Organization Details</Text>
            <Text style={styles.label}>Select Organization <Text style={{color:'red'}}>*</Text></Text>
            <TouchableOpacity style={[styles.dropdown, errors.org && styles.errorBorder]} onPress={() => openModal('Organization', orgList)}>
                <Text style={{color: org ? '#333' : 'gray', flex:1}}>{org || "Search Hospital / Clinic..."}</Text>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998"/> : <Ionicons name="search" size={20} color="gray" />}
            </TouchableOpacity>
            {errors.org && <Text style={styles.errorText}>Organization is required</Text>}

            {org ? (
                <View style={styles.autoFillBox}>
                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                        <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginBottom:8}}>AUTO-FILLED DETAILS</Text>
                        <Ionicons name="flash" size={14} color="#3b5998" />
                    </View>
                    <Text style={styles.label}>Contact Person</Text>
                    <TextInput style={styles.inputGray} placeholder="Client Name" value={clientName} onChangeText={setClientName} />
                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Mobile</Text>
                            <TextInput style={styles.inputGray} placeholder="Mobile" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>City</Text>
                            <TextInput style={styles.inputGray} placeholder="City" value={city} onChangeText={setCity} />
                        </View>
                    </View>
                    <Text style={styles.label}>Address</Text>
                    <TextInput style={styles.inputGray} placeholder="Address" value={address} onChangeText={setAddress} />
                </View>
            ) : null}

            <Text style={styles.sectionTitle}>2. Lead Strategy</Text>
            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Lead Type</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Type', typeOptions)}>
                        <Text style={{color:'black'}}>{leadType}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Stage</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Stage', stageOptions)}>
                        <Text style={{color: leadStage === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{leadStage}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Status</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Status', statusOptions)}>
                        <Text style={{color:'black'}}>{status}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Probability</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Probability', probabilityOptions)}>
                        <Text style={{color: probability === 'Select' ? 'gray' : 'black'}}>{probability}%</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Allocated To <Text style={{color:'red'}}>*</Text></Text>
                    <TouchableOpacity style={[styles.dropdown, errors.allocated && styles.errorBorder]} onPress={() => openModal('Allocated To', employees)}>
                        <Text style={{color: allocatedTo === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{allocatedTo}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Source</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Source', sources)}>
                        <Text style={{color: leadSource === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{leadSource}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Next Follow Up</Text>
                    <TouchableOpacity style={[styles.dropdown, {borderColor: '#3b5998'}]} onPress={() => setShowNextPicker(true)}>
                        <Text style={{color:'#3b5998', fontWeight:'bold'}}>{formatDate(nextDate)}</Text>
                        <Ionicons name="calendar" size={16} color="#3b5998" />
                    </TouchableOpacity>
                    {showNextPicker && <DateTimePicker value={nextDate} mode="date" minimumDate={new Date()} onChange={(e, d) => { setShowNextPicker(false); if(d) setNextDate(d); }} />}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Expected Closing</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowClosingPicker(true)}>
                        <Text style={{color:'#333'}}>{formatDate(closingDate)}</Text>
                        <Ionicons name="calendar-outline" size={16} color="gray" />
                    </TouchableOpacity>
                    {showClosingPicker && <DateTimePicker value={closingDate} mode="date" minimumDate={new Date()} onChange={(e, d) => { setShowClosingPicker(false); if(d) setClosingDate(d); }} />}
                </View>
            </View>

            <Text style={styles.sectionTitle}>3. Requirements</Text>
            <TouchableOpacity style={styles.reqSearchBtn} onPress={() => openModal('Requirements', getProductOptions())}>
                <Text style={{color:'gray'}}>Select Product / Requirement...</Text>
                <Ionicons name="add-circle" size={24} color="#3b5998" />
            </TouchableOpacity>
            
            <View style={styles.chipContainer}>
                {selectedRequirements.map((item, index) => (
                    <View key={index} style={styles.chip}>
                        <Text style={styles.chipText}>{item}</Text>
                        <TouchableOpacity onPress={() => removeRequirement(item)}>
                            <Ionicons name="close-circle" size={18} color="white" style={{marginLeft:5}} />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>

            {selectedRequirements.includes("Other") && (
                <View style={{marginBottom:15}}>
                    <Text style={styles.label}>Specify Other Requirement <Text style={{color:'red'}}>*</Text></Text>
                    <TextInput 
                        style={[styles.inputGray, {borderColor: '#3b5998', backgroundColor: '#f0f4ff'}]} 
                        placeholder="e.g. ICU Pendant, UPS..."
                        value={otherRequirement}
                        onChangeText={setOtherRequirement}
                    />
                </View>
            )}

            <Text style={styles.label}>Discussion / Note <Text style={{color:'red'}}>*</Text></Text>
            <TextInput 
                style={[styles.inputGray, {height: 100, textAlignVertical:'top', backgroundColor:'#fff'}, errors.discussion && styles.errorBorder]} 
                multiline 
                placeholder="Enter meeting notes..."
                value={discussion}
                onChangeText={(t) => { setDiscussion(t); setErrors(e => ({...e, discussion: false})) }}
            />
            {errors.discussion && <Text style={styles.errorText}>Discussion note is required</Text>}

            {/* 🔥 BUTTON WITH LOADING */}
            <TouchableOpacity 
                style={[styles.saveButton, isSubmitting && {backgroundColor:'#9fa8da'}]} 
                onPress={handleSave} 
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={styles.saveBtnText}>Save Lead</Text>
                )}
            </TouchableOpacity>
            
            <Text style={{textAlign:'center', color:'gray', fontSize:10, marginTop:10}}>
                📍 Location will be captured automatically.
            </Text>
            
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCH MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                    <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="black" /></TouchableOpacity>
                </View>
                
                <View style={styles.modalSearchBox}>
                    <Ionicons name="search" size={20} color="gray" />
                    <TextInput 
                        style={{flex:1, marginLeft:10}} 
                        placeholder="Search..." 
                        value={searchText} 
                        onChangeText={handleSearch}
                        autoFocus={true} 
                    />
                </View>

                <FlatList 
                    data={filteredData}
                    keyExtractor={(item, index) => index.toString()}
                    keyboardShouldPersistTaps='handled'
                    style={{maxHeight: 300}}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                            {typeof item === 'string' ? (
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                    <Ionicons name="radio-button-on" size={18} color="#666" style={{marginRight:10}}/>
                                    <Text style={[styles.modalMainText, selectedRequirements.includes(item) && {color:'#3b5998', fontWeight:'bold'}]}>
                                        {item}
                                    </Text>
                                    {selectedRequirements.includes(item) && <Ionicons name="checkmark" size={18} color="#3b5998" style={{marginLeft:'auto'}}/>}
                                </View>
                            ) : (
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                    <View style={[styles.iconBox, {backgroundColor:'#f3e5f5'}]}>
                                        <Ionicons name="business" size={20} color="#8e44ad" />
                                    </View>
                                    <View style={{marginLeft:10}}>
                                        <Text style={styles.modalMainText}>{item.orgName || item.name}</Text>
                                        <Text style={styles.modalSubText}>{item.city || 'No City'}</Text>
                                    </View>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No Data Found</Text>}
                />

                {currentModalType === 'Requirements' && (
                    <TouchableOpacity 
                        style={[styles.closeBtn, {backgroundColor: '#3b5998', marginTop:10}]} 
                        onPress={() => setModalVisible(false)}
                    >
                        <Text style={{color:'white', fontWeight:'bold'}}>Done</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  contentContainer: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 10, marginBottom: 15, color:'#3b5998', textTransform:'uppercase', letterSpacing:1 },
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13 },
  autoFillBox: { backgroundColor: '#f0f8ff', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#d0eaff' },
  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 5, flexDirection:'row', justifyContent:'space-between', alignItems:'center', height:50 },
  inputGray: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, marginBottom: 10, fontSize:16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  col: { width: '48%' },
  reqSearchBtn: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, borderWidth:1, borderColor:'#3b5998', borderRadius:8, borderStyle:'dashed', marginBottom:10, backgroundColor:'#f0f4ff' },
  chipContainer: { flexDirection:'row', flexWrap:'wrap', marginBottom:15 },
  chip: { flexDirection:'row', alignItems:'center', backgroundColor:'#3b5998', paddingHorizontal:10, paddingVertical:6, borderRadius:20, marginRight:8, marginBottom:8 },
  chipText: { color:'white', fontSize:12, fontWeight:'bold' },
  errorBorder: { borderColor: 'red', backgroundColor: '#fff0f0' },
  errorText: { color: 'red', fontSize: 11, marginBottom: 10, marginLeft: 5 },
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 12, borderRadius: 8 },
  iconBox: { width: 35, height: 35, borderRadius: 8, justifyContent:'center', alignItems:'center' },
  modalMainText: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  modalSubText: { fontSize: 12, color: 'gray' }
});
