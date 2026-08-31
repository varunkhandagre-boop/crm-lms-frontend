import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (organizations/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 2: demos & sales visits now go through the new backend API
import { listDemos } from '../services/api/demos';
import { listSalesVisits } from '../services/api/salesVisits';

// 🔥 PDF IMPORTS
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function DemoScreen() {
  const router = useRouter();
  
  const { currentUser, companyProfile } = useData(); 

  // 🔥 SaaS Engine kept for organizations/users
  const { fetchSaaSData, isDbLoading } = useSaaSDB();

  const [demoList, setDemoList] = useState<any[]>([]);
  const [salesVisitList, setSalesVisitList] = useState<any[]>([]);
  const [orgList, setOrgList] = useState<any[]>([]);
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [orgDetails, setOrgDetails] = useState<any>(null); 
  const [generatingPdf, setGeneratingPdf] = useState(false); 

  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const isAdmin = ['Admin', 'Manager', 'Accountant' , 'Account', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

  useEffect(() => {
      if (viewMode === 'Day') {
          setVisibleCount(500); 
      } else {
          setVisibleCount(20); 
      }
  }, [viewMode, currentDate, selectedEmployee, searchText]);

  // 🔥 LOAD DATA — demos & sales visits via new API; orgs/users via Firestore
  useEffect(() => {
      const loadData = async () => {
          if (currentUser?.companyId) {
              const [demos, sales, orgs, users] = await Promise.all([
                  listDemos(),         // was: fetchSaaSData("demos")
                  listSalesVisits(),   // was: fetchSaaSData("sales_reports")
                  fetchSaaSData("organizations"),
                  fetchSaaSData("users")
              ]);

              setDemoList(demos);
              setSalesVisitList(sales);
              setOrgList(orgs);

              if (isAdmin) {
                  const mappedUsers = users.map((u: any) => ({
                      id: u.id,
                      name: u.name || 'Unknown User'
                  }));
                  setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
              }
          }
      };
      loadData();
  }, [currentUser]);

  const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      if (dateStr.includes('T')) return new Date(dateStr);
      if (dateStr.includes('-')) return new Date(dateStr);
      const parts = dateStr.split('/');
      if (parts.length === 3) {
          return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(0);
  };

  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const m = currentDate.getMonth(); 
          const y = currentDate.getFullYear();
          const startY = m >= 3 ? y : y - 1;
          return `FY ${startY.toString().slice(-2)}-${(startY + 1).toString().slice(-2)}`;
      }
      return "All Time";
  };

  const generateDemoPDF = async (demoData: any) => {
    setGeneratingPdf(true);
    try {
        const logoHTML = companyProfile?.logoUrl 
            ? `<img src="${companyProfile.logoUrl}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = companyProfile?.signatureUrl 
            ? `<img src="${companyProfile.signatureUrl}" style="height: 40px; margin-top: 5px; margin-bottom: 2px;" />` 
            : `<div style="height: 40px;"></div>`;

        const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 30px; border: 2px solid #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
              .title { font-size: 22px; font-weight: bold; color: #1a237e; text-transform: uppercase; }
              .sub-title { font-size: 12px; margin-top: 2px; color: #333; line-height: 1.4; }
              .box { border: 1px solid #000; padding: 15px; margin-top: 10px; background-color: #fcfcfc; }
              .row { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .label { font-weight: bold; color: #444; width: 130px; display: inline-block; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
              .sign-box { text-align: center; width: 45%; }
              .sign-line { border-top: 1px solid #000; width: 100%; margin-top: 5px; margin-bottom: 5px; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHTML}
              ${companyProfile?.logoUrl ? `<div class="title">${companyProfile.companyName}</div>` : ''}
              <div class="sub-title">${companyProfile?.address || ''}</div>
              <div class="sub-title">
                Phone: ${companyProfile?.contactPhone || companyProfile?.phone || '-'} | 
                Email: ${companyProfile?.contactEmail || companyProfile?.email || '-'}
              </div>
            </div>

            <h3 style="text-align: center; text-decoration: underline;">PRODUCT DEMO REPORT</h3>

            <div class="box">
                <div class="row">
                    <div><span class="label">Date:</span> ${demoData.date}</div>
                    <div><span class="label">Duration:</span> ${demoData.duration || '1'} Days</div>
                </div>
            </div>

            <div class="box">
                <div style="font-size:14px; margin-bottom:5px;"><b>Client:</b> ${demoData.hospital}</div>
                <div style="font-size:14px; margin-bottom:5px;"><b>Address:</b> ${demoData.address || demoData.city || ''}</div>
                <div style="font-size:14px;"><b>Department:</b> ${demoData.department || '-'}</div>
            </div>

            <div class="box">
                <div class="row"><div><span class="label">Contact Person:</span> <b>${demoData.contactPerson || '-'}</b></div></div>
                <div class="row"><div><span class="label">Designation:</span> ${demoData.designation || '-'}</div></div>
                <div class="row"><div><span class="label">Mobile:</span> ${demoData.contactNumber || '-'}</div></div>
            </div>

            <div class="box">
                <div style="font-weight:bold; margin-bottom:10px; text-decoration:underline;">Product Details</div>
                <div class="row"><div><span class="label">Product Name:</span> <b>${demoData.product}</b></div></div>
                <div class="row"><div><span class="label">Model:</span> ${demoData.model}</div></div>
                <div class="row"><div><span class="label">Serial No:</span> ${demoData.serialNo || 'N/A'}</div></div>
            </div>

            <div class="box">
                <div style="font-weight:bold; margin-bottom:5px; text-decoration:underline;">Demo Outcome / Remarks:</div>
                <div style="margin-top:5px; min-height: 50px;">${demoData.result || demoData.outcome || 'Demo completed successfully.'}</div>
                ${demoData.notes ? `<div style="margin-top:10px; font-style:italic; font-size:12px;">Internal Note: ${demoData.notes}</div>` : ''}
            </div>

            <div class="footer">
              <div class="sign-box">
                <div style="height: 60px;"></div> 
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Client Signature & Stamp</div>
              </div>

              <div class="sign-box">
                <div style="font-weight: bold; font-size: 12px;">Given By: ${demoData.senderName}</div>
                ${signatureHTML}
                <div class="sign-line"></div>
                <div style="font-weight: bold;">Engineer Signature</div>
              </div>
            </div>
          </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Demo_${(demoData.hospital || 'Client').replace(/ /g, '_')}_${Date.now()}.pdf`;
        // @ts-ignore
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Demo Report` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        // Alert.alert("Error", "Could not generate PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  // --- SMART MERGE LOGIC (unchanged, now fed by API data) ---
  const getAllDemos = () => {
      const salesDemos = salesVisitList ? salesVisitList.filter((item: any) => 
          (item.discussion && item.discussion.toLowerCase().includes('demo')) || 
          (item.outcome && item.outcome.toLowerCase().includes('demo'))
      ).map((item: any) => ({
          id: item.id, 
          hospital: item.hospital,
          orgId: item.orgId || '', 
          date: item.date,
          product: 'See Details', 
          result: item.outcome || 'N/A',
          status: 'Completed',    
          isFromSales: true,      
          fullData: item,
          senderId: item.senderId,
          senderName: item.senderName || 'Unknown'
      })) : [];

      const actualDemos = demoList || [];
      
      let combined = [...actualDemos, ...salesDemos].map(item => {
        const org = orgList.find((o: any) => (o.id === item.orgId) || (o.orgName === item.hospital) || (o.name === item.hospital));
        return { ...item, city: item.city || (org ? org.city : '') };
      });

      if (!isAdmin) {
          const myId = currentUser?.id || currentUser?.uid;
          combined = combined.filter((item: any) => item.senderId === myId || item.userName === currentUser?.name);
      }

      return combined;
  };

  const allData = getAllDemos(); 

  const getFilteredData = () => {
    let data = allData;

    if (isAdmin && selectedEmployee !== 'All') {
        data = data.filter((item: any) => 
          (item.senderId === selectedEmployee) || 
          (item.userId === selectedEmployee) ||
          (item.senderName === selectedEmployeeName)
        );
    }

    if (searchText) {
        const lowerTerm = searchText.toLowerCase();
        data = data.filter((item: any) => {
           const fullString = `
               ${item.hospital || ''} 
               ${item.product || ''} 
               ${item.result || ''} 
               ${item.senderName || ''}
               ${item.date || ''}
               ${item.id || ''}
           `.toLowerCase();
           return fullString.includes(lowerTerm);
        });
    }

    if (viewMode !== 'All') {
        const targetYear = currentDate.getFullYear();
        const targetMonth = currentDate.getMonth();
        const targetDay = currentDate.getDate();

        const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
        const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
        const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); 

        data = data.filter((item: any) => {
            if(!item.date) return false;
            const itemDate = parseDate(item.date);
            const itemTime = itemDate.getTime();
            
            if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
            if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
            if (viewMode === 'FY') return itemTime >= fyStartDate && itemTime <= fyEndDate;
            return true;
        });
    }

    return data.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  const openDetails = (item: any) => {
      setSelectedItem(item);
      const foundOrg = orgList.find((o: any) => (o.id === item.orgId) || (o.orgName === item.hospital) || (o.name === item.hospital));
      setOrgDetails(foundOrg || null);
      setModalVisible(true);
  };

  const handleCall = (num: string) => {
      if(num) Linking.openURL(`tel:${num}`);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetails(item)}>
        <View style={styles.row}>
            <Text style={{color:'gray', fontSize:12, fontWeight:'bold'}}>{item.date}</Text>
            <View style={item.isFromSales ? styles.badgeOrange : styles.badgeBlue}>
                <Text style={item.isFromSales ? styles.textOrange : styles.textBlue}>
                    {item.isFromSales ? 'From Sales' : 'Direct Demo'}
                </Text>
            </View>
        </View>
        
        <Text style={styles.title}>{item.hospital || 'Unknown Hospital'}</Text>
        
        {item.city ? (
            <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
                <Ionicons name="location-outline" size={12} color="gray" />
                <Text style={{fontSize: 11, color: 'gray', marginLeft: 2}}>
                    {item.city}
                </Text>
            </View>
        ) : null}
        
        <View style={styles.row}>
            {isAdmin && (
                 <View style={{flexDirection:'row', alignItems:'center'}}>
                     <Ionicons name="person" size={10} color="#3b5998" />
                     <Text style={{fontSize:11, color:'#3b5998', fontWeight:'bold', marginLeft:2}}>
                         {item.senderName ? item.senderName.split(' ')[0] : 'Unknown'}
                     </Text>
                 </View>
            )}
        </View>
        
        <View style={styles.divider} />
        
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
             <View style={{flex: 1}}>
                 <Text style={{fontSize:13, color:'#3b5998', fontWeight:'bold'}}>
                     {item.product}
                 </Text>
                 {item.model ? (
                     <Text style={{fontSize:11, color:'#555'}}>Model: {item.model}</Text>
                 ) : null}
             </View>
             <Text style={styles.resultText} numberOfLines={1}>Result: {item.result || 'Pending'}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Demonstration Note</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/add_demo' as any)}>
            <Ionicons name="add-circle" size={32} color="#3b5998" />
        </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10}}>
          
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {isAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity 
                   style={styles.employeeFilterBtn} 
                   onPress={() => setShowEmployeePicker(true)}
               >
                   <Ionicons name="people" size={18} color="#2e7d32" />
                   <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                       {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                   </Text>
                   <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
               </TouchableOpacity>
            </View>
          )}

          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={{paddingHorizontal:15}}>
              <View style={styles.searchBar}>
                  {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
                  <TextInput 
                    style={styles.input} 
                    placeholder={isAdmin ? "Search Hospital, Product, Employee..." : "Search Hospital, Product..."}
                    value={searchText}
                    onChangeText={setSearchText}
                  />
                  {searchText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchText('')}>
                          <Ionicons name="close-circle" size={20} color="gray" />
                      </TouchableOpacity>
                  )}
              </View>
              <Text style={{textAlign:'right', fontSize:12, color:'gray', marginTop:5}}>
                  Total: <Text style={{fontWeight:'bold', color:'green'}}>{fullList.length}</Text> Records
              </Text>
          </View>
      </View>

      <FlatList 
        data={renderedList}
        keyExtractor={(item, index) => (item.id || index.toString()) + index} 
        renderItem={renderItem}
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="flask-outline" size={60} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>{isDbLoading ? 'Loading Demos...' : 'No Demo Records Found'}</Text>
            </View>
        }
        ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity 
                        onPress={() => setVisibleCount(prev => prev + 20)} 
                        style={{
                            padding: 12, 
                            backgroundColor: '#fff', 
                            alignItems: 'center', 
                            marginVertical: 10, 
                            borderRadius: 8, 
                            borderWidth: 1, 
                            borderColor: '#ddd'
                        }}
                    >
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                            👇 Load More Records ({fullList.length - visibleCount} remaining)
                        </Text>
                    </TouchableOpacity>
                ) : (
                    fullList.length > 0 ? (
                        <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                            --- End of List ---
                        </Text>
                    ) : null
                )}
            </View>
        }
      />

      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Demo Report</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}>
                          <Ionicons name="close-circle" size={30} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  {selectedItem && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          
                          <View style={styles.section}>
                              <Text style={styles.hospitalHeader}>{selectedItem.hospital}</Text>
                              <Text style={{color:'gray', fontSize:12, marginBottom:5}}>{selectedItem.date}</Text>
                              
                              {orgDetails && (
                                  <View style={{flexDirection:'row', alignItems:'center', marginTop:5}}>
                                      <Ionicons name="location" size={14} color="#555" />
                                      <Text style={{fontSize:12, color:'#555', marginLeft:5}}>
                                          {orgDetails.city}, {orgDetails.state}
                                      </Text>
                                  </View>
                              )}
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Contact Person</Text>
                              <DetailRow label="Name" value={selectedItem.contactPerson || 'N/A'} icon="person" />
                              <TouchableOpacity onPress={() => handleCall(selectedItem.contactNumber)}>
                                  <DetailRow label="Mobile" value={selectedItem.contactNumber} icon="call" highlight />
                              </TouchableOpacity>
                              <DetailRow label="Email" value={selectedItem.email} icon="mail" />
                              <DetailRow label="Dept" value={selectedItem.department} icon="medkit" />
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Product Details</Text>
                              <DetailRow label="Product" value={selectedItem.product} icon="cube" />
                              <DetailRow label="Model" value={selectedItem.model} icon="hardware-chip" />
                              <DetailRow label="Serial No" value={selectedItem.serialNo} icon="barcode" />
                              <DetailRow label="Duration" value={selectedItem.duration ? `${selectedItem.duration} Days` : 'N/A'} icon="time" />
                          </View>

                          <View style={styles.section}>
                              <Text style={styles.sectionTitle}>Feedback & Notes</Text>
                              <View style={styles.noteBox}>
                                  <Text style={styles.noteLabel}>Outcome / Feedback:</Text>
                                  <Text style={styles.noteText}>{selectedItem.result || selectedItem.fullData?.outcome || 'No feedback yet.'}</Text>
                              </View>

                              {selectedItem.notes ? (
                                  <View style={[styles.noteBox, {marginTop:10, backgroundColor:'#f3e5f5', borderColor:'#e1bee7'}]}>
                                      <Text style={[styles.noteLabel, {color:'#7b1fa2'}]}>Private Notes:</Text>
                                      <Text style={styles.noteText}>{selectedItem.notes}</Text>
                                  </View>
                              ) : null}
                          </View>

                          <View style={[styles.section, {borderBottomWidth:0}]}>
                              <DetailRow label="Entry By" value={selectedItem.senderName} icon="person-circle" />
                          </View>

                          <TouchableOpacity 
                              style={[styles.pdfBtn, generatingPdf && { opacity: 0.6 }]}
                              onPress={() => generateDemoPDF(selectedItem)}
                              disabled={generatingPdf}
                          >
                              {generatingPdf ? (
                                  <ActivityIndicator color="#1565c0" size="small" />
                              ) : (
                                  <>
                                      <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                      <Text style={styles.pdfBtnText}>Share Report PDF</Text>
                                  </>
                              )}
                          </TouchableOpacity>

                          <View style={{height:20}} />
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.pickerItem} 
                        onPress={() => { 
                            setSelectedEmployee(item.id); 
                            setSelectedEmployeeName(item.name);
                            setShowEmployeePicker(false); 
                        }}
                      >
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                             <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                             <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          </View>
                          {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:8}}>
        <View style={{width:30}}><Ionicons name={icon} size={18} color="#3b5998" /></View>
        <Text style={{fontSize:12, color:'gray', width:70}}>{label}</Text>
        <Text style={{fontSize:14, fontWeight: highlight ? 'bold' : '500', color: highlight ? '#2e7d32' : '#333', flex:1}}>
            {value || '-'}
        </Text>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 0 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998', marginLeft: 15 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 15, borderRadius: 8, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32' },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 4, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', height: 36 },
  input: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems:'center' },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 5, color:'#333' },
  resultText: { fontSize:12, color:'#555', maxWidth:'60%' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  
  badgeBlue: { backgroundColor: '#e3f2fd', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textBlue: { color: '#1565c0', fontSize: 10, fontWeight:'bold' },
  badgeOrange: { backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  textOrange: { color: '#e65100', fontSize: 10, fontWeight:'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width:'100%', backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color:'#3b5998' },
  
  section: { borderBottomWidth:1, borderBottomColor:'#eee', paddingBottom:15, marginBottom:15 },
  hospitalHeader: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 10, textDecorationLine:'underline' },
  
  noteBox: { backgroundColor: '#fffde7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fff9c4' },
  noteLabel: { fontSize: 12, fontWeight: 'bold', color: '#f57f17', marginBottom: 5 },
  noteText: { fontSize: 13, color: '#333' },

  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 12, borderRadius: 8, marginTop: 15, borderWidth: 1, borderColor: '#2196f3' },
  pdfBtnText: { color: '#1565c0', fontWeight: 'bold', marginLeft: 8 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
