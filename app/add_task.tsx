import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker'; // 🔥 Golden Rule: Calendar
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { useData } from './context/DataContext';

// 🔥🔥 1. FIREBASE IMPORTS ADDED
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig'; // ⚠️ Path check karein

export default function AddTaskScreen() {
  const router = useRouter();
  
  // 🔥 GET DATA FROM CONTEXT (Single Source of Truth)
  const { addTask, user, userList } = useData(); 

  // --- STATES ---
  const [taskTitle, setTaskTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedToId, setAssignedToId] = useState(''); // 🔥 Store ID for security
  
  const [priority, setPriority] = useState('Medium');
  const [department, setDepartment] = useState('Sales');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  // 🔥 DATES
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- MODAL STATES ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [filteredData, setFilteredData] = useState<any[]>([]); // Data for list
  const [searchText, setSearchText] = useState('');

  // --- OPTIONS ---
  const priorityOptions = ['Most Urgent', 'High', 'Medium', 'Low'];
  const deptOptions = ['Sales', 'Service', 'Account', 'HR', 'Admin', 'Store', 'Office', 'Other'];

  // DATE FORMATTER
  const formatDate = (rawDate: Date) => {
    let day = rawDate.getDate().toString().padStart(2, '0');
    let month = (rawDate.getMonth() + 1).toString().padStart(2, '0');
    let year = rawDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // --- MODAL LOGIC ---
  const openModal = (type: string) => {
      setCurrentModalType(type);
      setSearchText('');
      
      let data: any[] = [];
      if (type === 'Assign To') {
          // Use Global User List
          data = userList.length > 0 ? userList : [{name: 'Loading...', id: '0'}]; 
      } 
      else if (type === 'Priority') data = priorityOptions;
      else if (type === 'Department') data = deptOptions;
      
      setFilteredData(data);
      setModalVisible(true);
  };

  const handleSearch = (text: string) => {
      setSearchText(text);
      let sourceList: any[] = [];
      
      if (currentModalType === 'Assign To') sourceList = userList;
      else if (currentModalType === 'Priority') sourceList = priorityOptions;
      else if (currentModalType === 'Department') sourceList = deptOptions;

      if (text) {
          const newData = sourceList.filter(item => {
              const val = typeof item === 'string' ? item : (item.name || item.email);
              return val?.toLowerCase().includes(text.toLowerCase());
          });
          setFilteredData(newData);
      } else {
          setFilteredData(sourceList);
      }
  };

  const handleSelect = (item: any) => {
      if (currentModalType === 'Assign To') {
          setAssignedTo(item.name);
          setAssignedToId(item.uid || item.id); // Save ID
      }
      else if (currentModalType === 'Priority') setPriority(item);
      else if (currentModalType === 'Department') setDepartment(item);
      
      setModalVisible(false);
  };

  // 🔥 SAVE TASK
  const handleSave = async () => {
      if(!taskTitle) return Alert.alert("Required", "Please enter task title.");
      if(!assignedTo) return Alert.alert("Required", "Please select a user.");

      setLoading(true);
      try {
          const newTask = {
              task: taskTitle,
              
              // Sender Info (From Context)
              from: user?.name || 'Unknown', 
              senderId: user?.uid || 'guest',

              // Receiver Info
              to: assignedTo,
              toUid: assignedToId, // 🔥 Critical for filtering "My Tasks"
              
              priority: priority,
              department: department, 
              department_lower: department.toLowerCase(), // Helper for search
              
              dueDate: formatDate(dueDate), // Display Date
              dateIso: dueDate.toISOString().split('T')[0], // Sorting Date
              
              status: 'Pending',
              remark: remark || '',
              
              createdAt: new Date().toISOString()
          };

          // Use DataContext function (Handles Firebase internally)
          await addTask(newTask);

          // 🔥🔥 2. NOTIFICATION TRIGGER ADDED 🔥🔥
          try {
              // Notification for the Assigned User
              await addDoc(collection(db, "notifications"), {
                  title: "New Task Assigned 📋",
                  message: `${user?.name} assigned you a task: ${taskTitle}.`,
                  to: assignedTo,       // User Name
                  userId: assignedToId, // Target User ID (Sirf usko dikhega)
                  route: "/tasks",
                  read: false,
                  createdAt: new Date().toISOString(),
                  type: "warning" // Priority task color
              });
          } catch (e) {
              console.log("Notification Error:", e);
          }

          Alert.alert("Success", "Task Assigned & User Notified! 🚀");
          router.back();
      } catch (e) {
          Alert.alert("Error", "Could not save task.");
          console.log(e);
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
        <Text style={styles.headerTitle}>New Task</Text>
        <View style={{width:24}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{flex: 1}}
      >
        <ScrollView 
            style={styles.contentContainer} 
            contentContainerStyle={{paddingBottom: 100}} 
        >
            
            {/* SENDER INFO (Read Only) */}
            <Text style={styles.label}>Assigning From</Text>
            <View style={[styles.input, {backgroundColor:'#eee'}]}>
                <Text style={{color:'#555'}}>{user?.name || 'Loading...'}</Text>
            </View>

            <Text style={styles.label}>Task Title *</Text>
            <TextInput 
                style={styles.input} 
                placeholder="Enter task details..." 
                value={taskTitle} 
                onChangeText={setTaskTitle} 
            />

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Assign To *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Assign To')}>
                        <Text style={{color: assignedTo ? '#333' : 'gray'}}>{assignedTo || 'Select User'}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Due Date</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                        <Text style={{color: '#333'}}>{formatDate(dueDate)}</Text>
                        <Ionicons name="calendar" size={14} color="gray" />
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker 
                            value={dueDate} 
                            mode="date" 
                            minimumDate={new Date()}
                            onChange={(e, d) => { setShowDatePicker(false); if(d) setDueDate(d); }} 
                        />
                    )}
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Priority</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Priority')}>
                        <Text>{priority}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Department</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Department')}>
                        <Text>{department}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={styles.label}>Remark / Description</Text>
            <TextInput 
                style={[styles.input, {height: 100, textAlignVertical:'top'}]} 
                multiline 
                placeholder="Add details..."
                value={remark} onChangeText={setRemark} 
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="white"/> : <Text style={styles.saveBtnText}>Assign Task</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SEARCHABLE MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                
                {/* Search Bar (Only for User List) */}
                {currentModalType === 'Assign To' && (
                    <View style={styles.modalSearchBox}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput 
                            style={{flex:1, marginLeft:10}} 
                            placeholder="Search User..." 
                            value={searchText} 
                            onChangeText={handleSearch} 
                        />
                    </View>
                )}

                <FlatList 
                    data={filteredData}
                    keyExtractor={(item, index) => index.toString()}
                    style={{maxHeight: 300}}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                            {typeof item === 'string' ? (
                                <Text style={styles.modalText}>{item}</Text>
                            ) : (
                                <View>
                                    <Text style={[styles.modalText, {fontWeight:'bold'}]}>{item.name}</Text>
                                    <Text style={{fontSize:12, color:'gray'}}>{item.role || 'Employee'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign:'center', padding:20, color:'gray'}}>No matches found.</Text>}
                />
                
                <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                    <Text style={{color:'red'}}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  contentContainer: { padding: 20 },
  
  label: { marginBottom: 5, color:'#555', fontWeight:'600', fontSize:13, marginTop:15 },
  input: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, fontSize:16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  dropdown: { backgroundColor: '#f9f9f9', borderWidth:1, borderColor:'#ddd', borderRadius: 8, padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalText: { fontSize: 16, color: '#333' },
  closeBtn: { marginTop: 15, alignItems:'center', padding: 10 }
});