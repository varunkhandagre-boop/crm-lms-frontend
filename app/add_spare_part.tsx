import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { useData } from './context/DataContext';
// 🔥 Phase 3: spare parts now go through the new backend API
import { createSparePart } from '../services/api/spareParts';

export default function AddSparePartScreen() {
  const router = useRouter();
  
  const { addNotification } = useData();

  const [partName, setPartName] = useState('');
  const [partNo, setPartNo] = useState('');
  const [price, setPrice] = useState('');
  const [models, setModels] = useState('');
  const [stock, setStock] = useState('0');
  const [loading, setLoading] = useState(false);

  // 🔥 SAVE LOGIC — via new backend API
  const handleSave = async () => {
      if (!partName.trim() || !partNo.trim() || !price.trim()) {
          Alert.alert("Error", "Please fill Name, Part No, and Price.");
          return;
      }

      setLoading(true);
      try {
          await createSparePart({
              partName: partName.trim(),
              partNo: partNo.trim(),
              price: parseFloat(price.trim()) || 0,
              compatibleModels: models.trim(),
              officeStock: parseInt(stock) || 0,
          });

          if (addNotification) {
              await addNotification({
                  title: "New Spare Part ⚙️",
                  message: `${partName} (PN: ${partNo}) added to inventory.`,
                  to: "Admin",
                  route: "/spare_parts",
                  type: "info"
              });
          }

          Alert.alert("Success", "Spare Part Added Successfully!", [
              { text: "OK", onPress: () => router.back() }
          ]);
      } catch (error: any) {
          Alert.alert("Error", error.message || "Something went wrong.");
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
          <Text style={styles.headerTitle}>Add New Spare Part</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
          
          <Text style={styles.label}>Part Name *</Text>
          <TextInput style={styles.input} placeholder="e.g. Power Supply" value={partName} onChangeText={setPartName} />

          <Text style={styles.label}>Part Number (PN) *</Text>
          <TextInput style={styles.input} placeholder="e.g. PN-101" value={partNo} onChangeText={setPartNo} />

          <Text style={styles.label}>Price (₹) *</Text>
          <TextInput style={styles.input} placeholder="e.g. 15000" keyboardType="numeric" value={price} onChangeText={setPrice} />

          <Text style={styles.label}>Compatible Models</Text>
          <TextInput style={styles.input} placeholder="e.g. Hematology 5-Part" value={models} onChangeText={setModels} />

          <Text style={styles.label}>Initial Office Stock</Text>
          <TextInput style={styles.input} placeholder="e.g. 10" keyboardType="numeric" value={stock} onChangeText={setStock} />

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save Spare Part</Text>}
          </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingTop: 50, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 15, color: '#333' },
  form: { padding: 20 },
  label: { fontSize: 13, color: '#555', marginBottom: 5, fontWeight: '600', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#f9f9f9' },
  saveBtn: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
