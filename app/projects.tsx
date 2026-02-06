import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useData } from './context/DataContext';

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, projectList } = useData();
  const [searchText, setSearchText] = useState('');

  // 🔒 SECURITY CHECK (Fixed casing consistency)
  const allowedRoles = ['admin', 'manager', 'account', 'accountant', 'store', 'store keeper', 'Hr'];
  
  // Safe role check: ensure user exists and role string exists before lowercasing
  const userRole = user?.role ? user.role.toLowerCase() : '';
  const hasAccess = allowedRoles.includes(userRole);

  useEffect(() => {
      // Allow a brief moment for user data to load; access denied alert logic
      if (user && !hasAccess) {
          Alert.alert("Access Denied", "You don't have permission to view Projects.");
          router.back();
      }
  }, [user, hasAccess]);

  if (!hasAccess) {
      // You might want to return a loading indicator or null while checking
      return null; 
  }

  const getStatusColor = (status: string) => {
      if (status === 'Completed') return '#4caf50'; 
      if (status === 'Ongoing') return '#2196f3';   
      return '#ff9800'; 
  };

  // 🔥 SUPER SEARCH LOGIC
  const getFilteredProjects = () => {
      if (!projectList) return []; // Guard against null list
      if (!searchText) return projectList;
      
      const lower = searchText.toLowerCase();
      return projectList.filter((item: any) => 
          (item.name && item.name.toLowerCase().includes(lower)) ||
          (item.client && item.client.toLowerCase().includes(lower)) ||
          (item.location && item.location.toLowerCase().includes(lower))
      );
  };

  const displayList = getFilteredProjects();

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Management</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_project')}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.addBtnText}>New Project</Text>
        </TouchableOpacity>
      </View>

      {/* 🔥 SEARCH BAR */}
      <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="gray" style={{marginRight: 10}} />
          <TextInput 
              style={styles.searchInput} 
              placeholder="Search Project, Client, City..." 
              value={searchText} 
              onChangeText={setSearchText} 
          />
          {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="gray" />
              </TouchableOpacity>
          )}
      </View>

      {/* SUMMARY CARDS */}
      <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, {backgroundColor:'#e3f2fd'}]}>
              <Text style={styles.summaryLabel}>Running</Text>
              <Text style={styles.summaryValue}>
                  {projectList ? projectList.filter((p:any) => p.status === 'Ongoing').length : 0}
              </Text>
          </View>
          <View style={[styles.summaryCard, {backgroundColor:'#e8f5e9'}]}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={styles.summaryValue}>
                  {projectList ? projectList.filter((p:any) => p.status === 'Completed').length : 0}
              </Text>
          </View>
      </View>

      {/* PROJECT LIST */}
      <FlatList 
        data={displayList}
        keyExtractor={(item:any) => item.id.toString()} // Ensure ID is string
        contentContainerStyle={{padding: 15}}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop:50}}>
                <Ionicons name="business-outline" size={60} color="#ccc" />
                <Text style={{color:'gray', marginTop:10}}>No Projects Found.</Text>
            </View>
        }
        renderItem={({item}) => (
            <TouchableOpacity 
                style={styles.card} 
                // Passing params: ensure your receiving screen handles 'id'
                onPress={() => router.push({ pathname: '/project_details', params: { id: item.id } })}
            >
                <View style={styles.cardHeader}>
                    <Text style={styles.projectName}>{item.name}</Text>
                    <View style={[styles.badge, {backgroundColor: getStatusColor(item.status)}]}>
                        <Text style={styles.badgeText}>{item.status}</Text>
                    </View>
                </View>

                <Text style={styles.clientName}>🏢 {item.client}</Text>
                <Text style={styles.location}>📍 {item.location}</Text>

                <View style={styles.divider} />

                <View style={styles.row}>
                    <View>
                        <Text style={styles.label}>Order Value</Text>
                        <Text style={styles.value}>
                            ₹ {(parseInt(item.totalValue) || 0).toLocaleString()}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.label}>Total Expense</Text>
                        <Text style={[styles.value, {color:'#d32f2f'}]}>
                            ₹ {(item.totalExpense ? parseInt(item.totalExpense) : 0).toLocaleString()}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50, elevation: 3 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  addBtn: { flexDirection:'row', backgroundColor:'#212121', paddingHorizontal:12, paddingVertical:8, borderRadius:5, alignItems:'center' },
  addBtnText: { color:'white', fontWeight:'bold', marginLeft:5 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 15, paddingHorizontal: 15, borderRadius: 10, height: 45, elevation: 2 },
  searchInput: { flex: 1, fontSize: 16 },

  summaryContainer: { flexDirection: 'row', paddingHorizontal: 15, justifyContent: 'space-between', marginBottom: 10 },
  summaryCard: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center', marginHorizontal: 5, elevation: 1 },
  summaryLabel: { fontSize: 12, color: '#555', fontWeight:'bold' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 5 },

  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, marginHorizontal: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: '#333', flex:1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft:5 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  clientName: { fontSize: 14, color: '#555', marginTop: 2 },
  location: { fontSize: 13, color: '#777', marginTop: 2 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 11, color: 'gray' },
  value: { fontSize: 16, fontWeight: 'bold', color: '#333' }
});