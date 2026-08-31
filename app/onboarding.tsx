import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    NativeScrollEvent,
    NativeSyntheticEvent,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

// =========================================================
// 🔧 SLIDES CONFIG - apne app ke hisaab se text/icon badal sakte hain
// =========================================================
const SLIDES = [
    {
        icon: 'briefcase',
        color: '#3b5998',
        title: 'Welcome to Your CRM',
        subtitle: 'Manage orders, payments, installations, and your whole team - all from your phone.',
    },
    {
        icon: 'cart',
        color: '#ff9800',
        title: 'Track Everything in One Place',
        subtitle: 'Orders, payments, service calls, and couriers - everything is logged and organized automatically.',
    },
    {
        icon: 'chatbubbles',
        color: '#25D366',
        title: 'Automatic Customer Updates',
        subtitle: 'With Automation enabled, your customers get WhatsApp and Email updates the moment you add an order, payment, or service - no extra work needed.',
    },
    {
        icon: 'rocket',
        color: '#2e7d32',
        title: "You're All Set!",
        subtitle: 'Log in with the details given by your Admin and start using the app right away.',
        isLast: true,
    },
];

const ONBOARDING_KEY = 'hasSeenOnboarding';

export default function OnboardingScreen() {
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const finishOnboarding = async () => {
        try {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
        } catch (e) {
            // Agar AsyncStorage fail bhi ho jaye, user ko aage badhne se mat roko
            console.log('Could not save onboarding flag:', e);
        }
        router.replace('/login' as any);
    };

    const goToNext = () => {
        if (activeIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
        } else {
            finishOnboarding();
        }
    };

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / width);
        setActiveIndex(index);
    };

    const isLastSlide = activeIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>

            {/* SKIP BUTTON - top right, hidden on last slide */}
            {!isLastSlide && (
                <TouchableOpacity style={styles.skipBtn} onPress={finishOnboarding}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
            )}

            <FlatList
                ref={flatListRef}
                data={SLIDES}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, index) => String(index)}
                onMomentumScrollEnd={handleScroll}
                renderItem={({ item }) => (
                    <View style={[styles.slide, { width }]}>
                        <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                            <Ionicons name={item.icon as any} size={64} color="white" />
                        </View>
                        <Text style={styles.title}>{item.title}</Text>
                        <Text style={styles.subtitle}>{item.subtitle}</Text>
                    </View>
                )}
            />

            {/* DOTS INDICATOR */}
            <View style={styles.dotsRow}>
                {SLIDES.map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.dot,
                            index === activeIndex && styles.dotActive
                        ]}
                    />
                ))}
            </View>

            {/* NEXT / GET STARTED BUTTON */}
            <TouchableOpacity style={styles.nextBtn} onPress={goToNext}>
                <Text style={styles.nextBtnText}>{isLastSlide ? 'Get Started' : 'Next'}</Text>
                <Ionicons name={isLastSlide ? 'checkmark' : 'arrow-forward'} size={20} color="white" />
            </TouchableOpacity>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    skipBtn: { position: 'absolute', top: 55, right: 20, zIndex: 10, padding: 8 },
    skipText: { color: '#888', fontSize: 15, fontWeight: '600' },

    slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35 },
    iconCircle: { width: 130, height: 130, borderRadius: 65, alignItems: 'center', justifyContent: 'center', marginBottom: 35, elevation: 4 },
    title: { fontSize: 23, fontWeight: 'bold', color: '#222', textAlign: 'center', marginBottom: 14 },
    subtitle: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },

    dotsRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 25 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ddd', marginHorizontal: 4 },
    dotActive: { backgroundColor: '#3b5998', width: 22 },

    nextBtn: { flexDirection: 'row', backgroundColor: '#3b5998', marginHorizontal: 25, marginBottom: 40, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 3 },
    nextBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});