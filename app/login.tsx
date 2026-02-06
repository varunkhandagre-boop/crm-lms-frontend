import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useData();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Branding State
  const [branding, setBranding] = useState({
      name: 'LMS',
      tagline: 'Field Force Automation',
      logo: null
  });

  // Load Branding from Local Storage
  useEffect(() => {
      const loadBranding = async () => {
          try {
              const savedProfile = await AsyncStorage.getItem('companyProfileLocal');
              if (savedProfile) {
                  const parsed = JSON.parse(savedProfile);
                  setBranding({
                      name: parsed.shortName || parsed.companyName || 'LMS',
                      tagline: parsed.tagline || 'Field Force Automation',
                      logo: parsed.logoUrl || null
                  });
              }
          } catch (e) { console.log("Branding Load Error", e); }
      };
      loadBranding();
  }, []);

  const handleLogin = async () => {
      if(!email || !password) {
          Alert.alert("Missing Details", "Please enter valid Email & Password.");
          return;
      }

      setIsLoading(true); 
      
      try {
          const success = await login(email, password);
          
          if (success) {
              router.replace('/'); 
          } else {
              setIsLoading(false); 
          }
      } catch (error) {
          setIsLoading(false);
          Alert.alert("Login Failed", "Something went wrong. Please try again.");
      }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled" 
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag" 
        >
          
          {/* --- DYNAMIC LOGO SECTION --- */}
          <View style={styles.logoContainer}>
              <View style={styles.logoBox}>
                  {branding.logo ? (
                      <Image source={{ uri: branding.logo }} style={styles.logoImage} />
                  ) : (
                      <Image source={require('../assets/images/icon.png')} style={styles.logoImage} />
                  )}
              </View>
              <Text style={styles.appName}>{branding.name}</Text>
              <Text style={styles.tagline}>{branding.tagline}</Text>
          </View>

          {/* --- FORM SECTION --- */}
          <View style={styles.formContainer}>
              <Text style={styles.welcomeText}>Welcome Back!</Text>
              <Text style={styles.subText}>Sign in to continue</Text>

              <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color="#666" style={styles.icon} />
                  <TextInput 
                      style={styles.input} 
                      placeholder="Email Address" 
                      value={email} 
                      onChangeText={setEmail} 
                      autoCapitalize="none" 
                      keyboardType="email-address"
                  />
              </View>

              <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.icon} />
                  <TextInput 
                      style={styles.input} 
                      placeholder="Password" 
                      value={password} 
                      onChangeText={setPassword} 
                      secureTextEntry 
                  />
              </View>

              <TouchableOpacity 
                  style={styles.loginBtn} 
                  onPress={handleLogin} 
                  disabled={isLoading}
                  activeOpacity={0.7}
              >
                  <Text style={styles.loginText}>
                      {isLoading ? 'Please Wait...' : 'LOGIN'}
                  </Text>
              </TouchableOpacity>

              <Text style={styles.footerText}>Need Help? Contact Admin</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3b5998' },
  scrollContent: { flexGrow: 1, paddingBottom: 20 },
  
  logoContainer: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  logoBox: { 
      width: 100, height: 100, backgroundColor: 'white', borderRadius: 50, 
      justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 5, overflow:'hidden'
  },
  logoImage: { width: 80, height: 80, resizeMode: 'contain' },
  appName: { fontSize: 30, fontWeight: 'bold', color: 'white', letterSpacing: 1, textTransform:'uppercase' },
  tagline: { fontSize: 14, color: '#e3f2fd', marginTop:5 },

  formContainer: { 
      backgroundColor: 'white', borderTopLeftRadius: 30, borderTopRightRadius: 30, 
      padding: 30, flex: 1, elevation: 10 
  },
  welcomeText: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  subText: { color: 'gray', marginBottom: 25 },

  inputWrapper: { 
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', 
      borderRadius: 12, marginBottom: 15, paddingHorizontal: 15, height: 55, 
      borderWidth: 1, borderColor: '#eee' 
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#333' },

  loginBtn: { 
      backgroundColor: '#3b5998', height: 55, borderRadius: 12, 
      justifyContent: 'center', alignItems: 'center', marginTop: 15, 
      shadowColor: '#3b5998', shadowOffset: {width:0, height:4}, 
      shadowOpacity:0.3, shadowRadius:5, elevation:5 
  },
  loginText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  footerText: { textAlign: 'center', color: '#aaa', marginTop: 25, fontSize: 13 },
});