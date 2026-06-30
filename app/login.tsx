import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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

// 🔥 FIREBASE AUTH IMPORT FOR FORGOT PASSWORD
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Path check kar lein agar galat ho toh

// 🔥 SAAS IMPORTS
import { useData } from './context/DataContext';

export default function LoginScreen() {
  const router = useRouter();
  
  // 🔥 SaaS Auth System is mapped via DataContext's login function
  const { login } = useData();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Branding State
  const [branding, setBranding] = useState({
      name: 'LMS',
      tagline: 'Field Force Automation',
      logo: null as string | null
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

  // 🔥 FORGOT PASSWORD FUNCTION
  const handleForgotPassword = async () => {
      if (!email) {
          Alert.alert("Email Required", "Please enter your registered email ID in the box above to reset your password.");
          return;
      }
      
      try {
          await sendPasswordResetEmail(auth, email.trim().toLowerCase());
          Alert.alert(
              "Email Sent ✅", 
              "A password reset link has been sent to your email address. Please check your inbox (and spam folder) to create a new password."
          );
      } catch (error: any) {
          let msg = error.message;
          if (msg.includes('user-not-found')) msg = "This email is not registered with us.";
          if (msg.includes('invalid-email')) msg = "Please enter a valid email address.";
          Alert.alert("Error", msg);
      }
  };

  // 🔥 SAAS LOGIN LOGIC
  const handleLogin = async () => {
      if(!email || !password) {
          Alert.alert("Missing Details", "Please enter valid Email & Password.");
          return;
      }

      setIsLoading(true); 
      
      try {
          const success = await login(email.trim().toLowerCase(), password);
          
          if (success) {
              router.replace('/' as any); 
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

              {/* 🔥 NEW: FORGOT PASSWORD BUTTON 🔥 */}
              <TouchableOpacity onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginBottom: 20 }}>
                  <Text style={{ color: '#3b5998', fontWeight: 'bold' }}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* LOGIN BUTTON WITH SPINNER */}
              <TouchableOpacity 
                  style={[styles.loginBtn, isLoading && { opacity: 0.6 }]} 
                  onPress={handleLogin} 
                  disabled={isLoading}
                  activeOpacity={0.7}
              >
                  {isLoading ? (
                      <ActivityIndicator color="white" />
                  ) : (
                      <Text style={styles.loginText}>LOGIN</Text>
                  )}
              </TouchableOpacity>

              {/* REGISTER COMPANY LINK */}
              <TouchableOpacity onPress={() => router.push('/register_company' as any)} style={{ marginTop: 25 }}>
                  <Text style={{ textAlign: 'center', color: '#3b5998', fontWeight: 'bold', fontSize: 15 }}>
                      Don't have an account? Register Company
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
      justifyContent: 'center', alignItems: 'center', marginTop: 5, 
      shadowColor: '#3b5998', shadowOffset: {width:0, height:4}, 
      shadowOpacity:0.3, shadowRadius:5, elevation:5 
  },
  loginText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  footerText: { textAlign: 'center', color: '#aaa', marginTop: 20, fontSize: 13 },
});