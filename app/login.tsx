import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS
import { useData } from './context/DataContext';
import { useIsDesktop } from '../hooks/useIsDesktop';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.crm.lms';
// Laptop login: what the app does, shown beside the form.
const FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'trending-up', title: 'Sales', text: 'Leads, quotations, orders and payment collection' },
  { icon: 'construct', title: 'Service', text: 'Service calls, installations and PMS schedule' },
  { icon: 'location', title: 'Attendance', text: 'GPS Day In / Day Out, Day Map and shift roster' },
  { icon: 'wallet', title: 'HR & Payroll', text: 'Leave, expenses, advances and salary' },
  { icon: 'logo-whatsapp', title: 'Customer updates', text: 'Automatic WhatsApp and email messages' },
];

export default function LoginScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  
  // 🔥 SaaS Auth System is mapped via DataContext's login function
  const { login } = useData();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Android keyboard handling. Under edge-to-edge, whether the OS shrinks the screen
  // when the keyboard opens depends on the React Native version (SDK 54 didn't, SDK 57
  // does) and on Expo Go vs a real build. Padding by the full keyboard height on top of
  // an OS resize pushed the form far up. So measure how much the screen actually shrank
  // and pad only the part of the keyboard the OS didn't already make room for.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const osShrink = Math.max(0, fullHeight - viewHeight);
  const extraKbPad = Math.max(0, kbHeight - osShrink);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (kbHeight <= 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [kbHeight]);

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
    // No self-service reset yet: passwords are reset by the company Admin.
    const handleForgotPassword = () => {
      Alert.alert(
          "Reset Password",
          "Please ask your company Admin to reset your password from Team & Settings. If you are the Admin, contact support."
      );
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

  const formFields = (
    <>
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
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
                  </TouchableOpacity>
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
                      Don&apos;t have an account? Register Company
                  </Text>
              </TouchableOpacity>

              <Text style={styles.footerText}>Need Help? Contact Admin</Text>
    </>
  );

  // Laptop / desktop web: brand panel on the left, the form on the right.
  if (isDesktop) {
    return (
      <View style={styles.deskPage}>
        <View style={styles.deskBrand}>
          <View style={styles.deskBrandInner}>
            <View style={styles.deskLogoRow}>
              <View style={styles.deskLogoBox}>
                <Image source={branding.logo ? { uri: branding.logo } : require('../assets/images/icon.png')} style={styles.deskLogoImg} />
              </View>
              <View>
                <Text style={styles.deskAppName}>{branding.name}</Text>
                <Text style={styles.tagline}>{branding.tagline}</Text>
              </View>
            </View>
            <Text style={styles.deskHeadline}>One app for your field team</Text>
            <Text style={styles.deskLead}>Sales, service, attendance and payroll — on Android and on your laptop with the same login.</Text>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.deskFeature}>
                <View style={styles.deskFeatureIcon}><Ionicons name={f.icon} size={18} color="#3b5998" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deskFeatureTitle}>{f.title}</Text>
                  <Text style={styles.deskFeatureText}>{f.text}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.deskPlayBtn} onPress={() => Linking.openURL(PLAY_URL)}>
              <Ionicons name="logo-google-playstore" size={18} color="white" />
              <Text style={styles.deskPlayText}>Get the Android app</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={styles.deskFormSide} contentContainerStyle={styles.deskFormScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.deskCard}>{formFields}</View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (kbHeight === 0) setFullHeight((prev) => Math.max(prev, h));
        setViewHeight(h);
      }}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          ref={scrollRef}
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
          <View style={[styles.formContainer, kbHeight > 0 && { paddingBottom: 30 + extraKbPad }]}>
              {formFields}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3b5998' },
  scrollContent: { flexGrow: 1 },
  
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

  // Laptop layout
  deskPage: { flex: 1, flexDirection: 'row', backgroundColor: '#f4f6f8' },
  deskBrand: { flex: 1, backgroundColor: '#3b5998', justifyContent: 'center', paddingHorizontal: 56, paddingVertical: 40 },
  deskBrandInner: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  deskLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 36 },
  deskLogoBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  deskLogoImg: { width: 52, height: 52, resizeMode: 'contain' },
  deskAppName: { fontSize: 26, fontWeight: 'bold', color: 'white', letterSpacing: 1, textTransform: 'uppercase' },
  deskHeadline: { fontSize: 34, fontWeight: 'bold', color: 'white', lineHeight: 42 },
  deskLead: { fontSize: 15, color: '#dce6f7', marginTop: 10, marginBottom: 28, lineHeight: 22 },
  deskFeature: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  deskFeatureIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  deskFeatureTitle: { fontSize: 15, fontWeight: 'bold', color: 'white' },
  deskFeatureText: { fontSize: 13, color: '#dce6f7', marginTop: 1 },
  deskPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  deskPlayText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  deskFormSide: { flex: 1 },
  deskFormScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  deskCard: { width: '100%', maxWidth: 420, backgroundColor: 'white', borderRadius: 16, padding: 36, borderWidth: 1, borderColor: '#e6e9ee', boxShadow: '0 8px 30px rgba(14, 42, 71, 0.08)' } as any,
});