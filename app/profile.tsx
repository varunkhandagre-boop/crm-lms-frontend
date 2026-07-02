import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function ProfileScreen() {
  const router = useRouter();
  
  // 🔥 1. Context se global details
  const { currentUser, logout, companyProfile } = useData();
  
  // 🔥 2. Naya SaaS Engine
  const { fetchSaaSData, updateSaaSData } = useSaaSDB();

  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  
  // 🔥 Type assertion (as any) add kiya gaya hai
  const [currentImage, setCurrentImage] = useState((currentUser as any)?.profileImage || null);
  const [userData, setUserData] = useState<any>(currentUser);

  // 🔥 3. LOAD PROFILE DATA (SAAS IMPLEMENTATION)
  useEffect(() => {
    const fetchLatestProfile = async () => {
      if ((currentUser as any)?.email) {
        try {
          const users = await fetchSaaSData("users");
          const userEmail = (currentUser as any).email.toLowerCase();
          
          // Find the current user in the tenant's user list
          const data: any = users.find((u: any) => u.id === userEmail || u.email === userEmail);
          
          if (data) {
            // 1. Photo update karo (data ko any type diya gaya hai)
            setCurrentImage(data.profileImage || null);
            // 2. Baki details (City, State) bhi update karo
            setUserData({ ...currentUser, ...data });
          }
        } catch (error) {
          console.log("Error fetching profile:", error);
        }
      }
    };
    fetchLatestProfile();
  }, [currentUser]);

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: 'destructive', onPress: async () => { if (logout) await logout(); router.replace('/' as any); } }
    ]);
  };

  const handleProfileOptions = () => {
      if (!currentImage) { pickImage(); return; }
      Alert.alert("Profile Photo", "Choose an option", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove Photo", style: 'destructive', onPress: removeProfilePhoto },
          { text: "Choose from Gallery", onPress: pickImage }
      ]);
  };

  // 🔥 4. SAAS PHOTO REMOVAL
  const removeProfilePhoto = async () => {
      if (!currentUser?.email) return;
      setUploading(true);
      try {
          const userEmail = currentUser.email.toLowerCase();
          const res = await updateSaaSData("users", userEmail, { profileImage: null, updatedAt: new Date().toISOString() });
          
          if (res.success) {
              setCurrentImage(null);
              Alert.alert("Success", "Profile photo removed.");
          } else {
              throw new Error("Failed to remove photo.");
          }
      } catch (error) { Alert.alert("Error", "Failed to remove photo."); } 
      finally { setUploading(false); }
  };

  const pickImage = async () => {
      try {
        if (Platform.OS === 'ios') {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return Alert.alert("Permission Needed", "Please allow gallery access in Settings.");
        }
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.2, base64: true, 
        });
        if (!result.canceled && result.assets[0].base64) {
            savePhotoToFirebase(result.assets[0].uri, result.assets[0].base64);
        }
      } catch (error) { Alert.alert("Error", "Could not open gallery."); }
  };

  // 🔥 5. SAAS PHOTO UPDATE
  const savePhotoToFirebase = async (localUri: string, base64: string) => {
      if (!currentUser?.email) return;
      setUploading(true);
      try {
          const imageString = `data:image/jpeg;base64,${base64}`;
          const userEmail = currentUser.email.toLowerCase();
          
          const res = await updateSaaSData("users", currentUser.id, { profileImage: imageString, updatedAt: new Date().toISOString() });
          
          if (res.success) {
              setCurrentImage(imageString);
              Alert.alert("Success", "Profile Photo Updated!");
          } else {
              throw new Error("Update failed.");
          }
      } catch (error: any) { Alert.alert("Error", "Failed to save photo."); } 
      finally { setUploading(false); }
  };

  const getImageSource = () => {
      if (currentImage) return { uri: currentImage };
      return { uri: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' };
  };

  // 🔥🔥 GENERATE VISITING CARD (CLICKABLE LINKS PDF) 🔥🔥
  const shareVisitingCard = async () => {
      setSharing(true);
      try {
          // Company Info
          const companyName = companyProfile?.companyName || 'My Company';
          const companyLogo = companyProfile?.logoUrl || ''; 
          const headOffice = companyProfile?.headOfficeAddress || companyProfile?.address || '';
          
          let website = companyProfile?.website || 'www.google.com';
          if (!website.startsWith('http')) website = 'https://' + website; // Link sahi karne ke liye

          const compEmail = companyProfile?.contactEmail || companyProfile?.email || 'info@company.com';
          const compPhone = companyProfile?.contactPhone || companyProfile?.phone || '';

          // Employee Info
          const user = userData || currentUser; 
          const empName = user?.name || 'Employee Name';
          const designation = user?.role || 'Staff Member';
          const empMobile = user?.mobile || '';
          const empEmail = user?.email || '';

          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${website}`;

          const htmlContent = `
          <html>
            <head>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: 'Poppins', sans-serif; background-color: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .card { width: 600px; height: 350px; background: white; border-radius: 20px; box-shadow: 0 15px 30px rgba(0,0,0,0.2); overflow: hidden; display: flex; border: 1px solid #ddd; }
                
                /* Link Styles (Taaki PDF me blue na dikhe, par click ho) */
                a { text-decoration: none; color: inherit; }

                /* Left Section */
                .left-section { width: 38%; background: linear-gradient(135deg, #1a237e 0%, #283593 100%); color: white; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; }
                .logo-img { width: 70px; height: 70px; object-fit: contain; background: white; border-radius: 10px; padding: 5px; margin: 0 auto 15px auto; display: block; }
                .comp-name-vertical { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; line-height: 1.2; word-wrap: break-word; }
                .qr-box { background: white; padding: 5px; border-radius: 5px; margin-bottom: 10px; }
                .qr-img { width: 70px; height: 70px; display: block; }

                /* Right Section */
                .right-section { width: 62%; padding: 25px 35px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
                .circle-bg { position: absolute; top: -70px; right: -70px; width: 180px; height: 180px; background: #e8eaf6; border-radius: 50%; z-index: 1; }
                
                .emp-block { margin-top: 30px; z-index: 2; }
                .emp-name { font-size: 24px; font-weight: 700; color: #333; text-transform: uppercase; margin-bottom: 4px; line-height: 1; }
                .emp-role { font-size: 12px; color: #e65100; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
                
                /* Info Rows */
                .info-row { display: flex; align-items: center; margin-bottom: 6px; font-size: 13px; color: #555; }
                .icon { width: 24px; height: 24px; background: #3b5998; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; color: white; font-size: 11px; flex-shrink: 0; }

                /* Head Office Block */
                .ho-section { background-color: #f9f9f9; padding: 12px; border-radius: 8px; border-left: 4px solid #3b5998; }
                .ho-label { font-size: 9px; font-weight: bold; color: #999; text-transform: uppercase; margin-bottom: 4px; }
                .ho-address { font-size: 10px; color: #333; line-height: 1.4; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="left-section">
                    <div class="top-content">
                        ${companyLogo ? `<img src="${companyLogo}" class="logo-img" />` : ''}
                        <div class="comp-name-vertical">${companyName}</div>
                    </div>
                    <div class="qr-box"><img src="${qrCodeUrl}" class="qr-img" /></div>
                </div>

                <div class="right-section">
                    <div class="circle-bg"></div>
                    <div class="emp-block">
                        <div class="emp-name">${empName}</div>
                        <div class="emp-role">${designation}</div>

                        <div class="info-row">
                            <div class="icon">📞</div> 
                            <span><a href="tel:${empMobile}">${empMobile}</a></span>
                        </div>
                        <div class="info-row">
                            <div class="icon">✉️</div> 
                            <span><a href="mailto:${empEmail}">${empEmail}</a></span>
                        </div>
                        
                        <div class="info-row">
                            <div class="icon">🌐</div> 
                            <span><a href="${website}" target="_blank">${website.replace('https://','')}</a></span>
                        </div>

                    </div>

                    <div class="ho-section">
                        <div class="ho-label">🏢 HEAD OFFICE</div>
                        <div class="ho-address">${headOffice}</div>
                        <div class="ho-address" style="margin-top:2px;">
                            ${compPhone ? `📞 <a href="tel:${compPhone}">${compPhone}</a> &nbsp;` : ''} 
                            ✉️ <a href="mailto:${compEmail}">${compEmail}</a>
                        </div>
                    </div>
                </div>
              </div>
            </body>
          </html>`;

          const { uri } = await Print.printToFileAsync({ html: htmlContent, width: 600, height: 350 });
          const newFileName = `Card_${empName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
          // @ts-ignore
          const newPath = `${FileSystem.cacheDirectory}${newFileName}`;

          try {
             await FileSystem.copyAsync({ from: uri, to: newPath });
             await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share Visiting Card' });
          } catch (e) { await Sharing.shareAsync(uri); }
      } catch (error) { Alert.alert("Error", "Could not generate card."); } 
      finally { setSharing(false); }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#3b5998" />
      <View style={styles.blueBackground} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerSpacer} />
        <View style={styles.navBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={{width: 24}} /> 
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.profileCard}>
            
            <View style={styles.profileRow}>
                <TouchableOpacity onPress={handleProfileOptions} disabled={uploading}>
                    <Image source={getImageSource()} style={styles.mainAvatar} resizeMode="cover" />
                    <View style={styles.cameraIcon}>
                        {uploading ? <ActivityIndicator size="small" color="white"/> : <Ionicons name={currentImage ? "pencil" : "camera"} size={14} color="white" />}
                    </View>
                </TouchableOpacity>
                <View style={styles.nameContainer}>
                    <Text style={styles.empId}>{currentUser?.role || 'Employee'}</Text> 
                    <Text style={styles.empName}>{currentUser?.name || 'User'}</Text>
                    <View style={styles.statusBadge}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeText}>Active Now</Text>
                    </View>
                </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                    <Text style={styles.label}>Email Address</Text>
                    <Text style={styles.value} numberOfLines={1}>{currentUser?.email || '-'}</Text>
                </View>
                <View style={styles.infoItem}>
                    <Text style={styles.label}>Phone Number</Text>
                    <Text style={styles.value}>{currentUser?.mobile || '-'}</Text>
                </View>
                <View style={styles.infoItem}>
                    <Text style={styles.label}>Designation</Text>
                    <Text style={styles.value}>{currentUser?.role || 'Staff'}</Text>
                </View>
                <View style={styles.infoItem}>
                    <Text style={styles.label}>Location</Text>
                    <Text style={styles.value}>
                        {userData?.city ? `${userData?.city} ${userData?.state ? ', ' + userData.state : ''}` : (userData?.address || 'Not Set')}
                    </Text>
                </View>
            </View>

            {/* COMPANY DETAILS */}
            <View style={{marginTop: 25, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0'}}>
                <Text style={{fontSize:14, fontWeight:'bold', color:'#3b5998', marginBottom:10}}>🏢 COMPANY DETAILS</Text>
                <View style={{flexDirection:'row', alignItems:'center', marginBottom:5}}>
                    <Ionicons name="business" size={16} color="gray" />
                    <Text style={{marginLeft:10, color:'#333', fontWeight:'bold'}}>{companyProfile?.companyName || 'My Company'}</Text>
                </View>
                <View style={{flexDirection:'row', alignItems:'center', marginBottom:5}}>
                    <Ionicons name="location" size={16} color="gray" />
                    <Text style={{marginLeft:10, color:'#555', fontSize:12, flex:1}}>{companyProfile?.address || 'Not Set'}</Text>
                </View>
                <View style={{flexDirection:'row', alignItems:'center', marginBottom:5}}>
                    <Ionicons name="globe" size={16} color="gray" />
                    <Text style={{marginLeft:10, color:'#555', fontSize:12}}>{companyProfile?.website || 'No Website'}</Text>
                </View>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Ionicons name="call" size={16} color="gray" />
                    <Text style={{marginLeft:10, color:'#555', fontSize:12}}>{companyProfile?.phone || '-'}</Text>
                </View>
            </View>

            {/* 🔥 BUTTON BELOW COMPANY DETAILS */}
            <TouchableOpacity style={styles.visitingCardBtn} onPress={shareVisitingCard} disabled={sharing}>
                {sharing ? <ActivityIndicator color="white" /> : <Ionicons name="card-outline" size={20} color="white" />}
                <Text style={styles.visitingCardText}>{sharing ? 'Generating...' : 'Share My Visiting Card'}</Text>
            </TouchableOpacity>

          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="white" />
              <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>App Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F5F7FA' },
  blueBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, backgroundColor: '#3b5998', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  scrollContent: { paddingBottom: 40 },
  headerSpacer: { height: 50 },
  navBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  backButton: { padding: 5 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  cardContainer: { paddingHorizontal: 20, marginTop: 10 },
  profileCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  mainAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: '#F5F7FA', backgroundColor: '#eee' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#3b5998', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'white' },
  nameContainer: { flex: 1, marginLeft: 20 },
  empId: { fontSize: 12, fontWeight: '800', color: '#3b5998', textTransform: 'uppercase', marginBottom: 4 },
  empName: { color: '#1a1a1a', fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CAF50', marginRight: 6 },
  activeText: { color: '#2E7D32', fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginBottom: 20 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -10 },
  infoItem: { width: '50%', paddingHorizontal: 10, marginBottom: 20 },
  label: { fontSize: 12, color: '#8F9BB3', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  value: { color: '#222B45', fontSize: 15, fontWeight: '500' },
  actionContainer: { paddingHorizontal: 20, marginTop: 30 },
  logoutBtn: { flexDirection: 'row', backgroundColor: '#FF3D71', paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#FF3D71', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  logoutText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
  versionText: { textAlign: 'center', color: '#8F9BB3', marginTop: 20, fontSize: 12 },
  visitingCardBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#e65100', paddingVertical: 12, borderRadius: 12, marginTop: 20, shadowColor: '#e65100', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 4 },
  visitingCardText: { color: 'white', fontWeight: 'bold', fontSize: 14, marginLeft: 8 }
});