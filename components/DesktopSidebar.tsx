import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ACTIVITY_ITEMS, HR_ITEMS, MenuItemDef, NAV_TABS, SALES_ITEMS, SIDEBAR_ITEMS } from '../constants/menuItems';
import { canSeeTab, MenuAccessCtx, visibleItems } from '../utils/menuAccess';

type Props = {
    ctx: MenuAccessCtx;
    companyName: string;
    logoUrl?: string | null;
    userName: string;
    userRole: string;
    badges: Record<string, number>; // route → count
    onLogout: () => void;
};

/** Web on a laptop: the whole menu always visible on the left (phone uses Home + bottom bar + drawer). */
export default function DesktopSidebar({ ctx, companyName, logoUrl, userName, userRole, badges, onLogout }: Props) {
    const router = useRouter();
    const pathname = usePathname();

    // The bottom-bar screens first (Home, Act Plan, …), then the Home sections, then settings.
    const main = NAV_TABS.filter((t) => canSeeTab(t.module, ctx));
    const sections: { title: string; items: MenuItemDef[] }[] = [
        { title: 'HR & Operations', items: visibleItems(HR_ITEMS, ctx).filter((i) => !main.some((m) => m.route === i.route)) },
        { title: 'Activity Report', items: visibleItems(ACTIVITY_ITEMS, ctx).filter((i) => !main.some((m) => m.route === i.route)) },
        { title: 'Sales', items: visibleItems(SALES_ITEMS, ctx) },
        { title: 'Reports & Settings', items: visibleItems(SIDEBAR_ITEMS, ctx) },
    ].filter((s) => s.items.length > 0);

    const isActive = (route: string) => (route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(route + '/'));

    const Row = ({ item }: { item: MenuItemDef }) => {
        const active = isActive(item.route);
        const count = badges[item.route] || 0;
        return (
            <TouchableOpacity style={[styles.row, active && styles.rowActive]} onPress={() => router.push(item.route as any)}>
                <Ionicons name={item.icon as any} size={18} color={active ? 'white' : item.color || '#3b5998'} />
                <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>{item.title}</Text>
                {count > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>
                )}
            </TouchableOpacity>
        );
    };

    const logout = () => Alert.alert('Logout', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Logout', onPress: onLogout }]);

    return (
        <View style={styles.sidebar}>
            <TouchableOpacity style={styles.brand} onPress={() => router.push('/')}>
                {logoUrl
                    ? <Image source={{ uri: logoUrl }} style={styles.logo} />
                    : <Image source={require('../assets/images/icon.png')} style={styles.logo} />}
                <Text style={styles.brandText} numberOfLines={1}>{companyName}</Text>
            </TouchableOpacity>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                {main.map((item) => <Row key={item.route} item={item} />)}
                {sections.map((s) => (
                    <View key={s.title}>
                        <Text style={styles.sectionTitle}>{s.title}</Text>
                        {s.items.map((item) => <Row key={item.route} item={item} />)}
                    </View>
                ))}
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity style={styles.user} onPress={() => router.push('/profile' as any)}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{(userName || '?').charAt(0)}</Text></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
                        <Text style={styles.userRole} numberOfLines={1}>{userRole}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <Ionicons name="log-out-outline" size={20} color="#d32f2f" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    sidebar: { width: 248, backgroundColor: 'white', borderRightWidth: 1, borderRightColor: '#e4e7ee' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eef0f4' },
    logo: { width: 34, height: 34, resizeMode: 'contain' },
    brandText: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#3b5998' },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: '#9aa1b1', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 4, marginHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 8, borderRadius: 8 },
    rowActive: { backgroundColor: '#3b5998' },
    rowText: { flex: 1, fontSize: 14, color: '#2d3748' },
    rowTextActive: { color: 'white', fontWeight: '600' },
    badge: { backgroundColor: '#e53935', borderRadius: 10, minWidth: 20, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eef0f4', padding: 12, gap: 8 },
    user: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#3b5998', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontWeight: 'bold' },
    userName: { fontSize: 13, fontWeight: '600', color: '#2d3748' },
    userRole: { fontSize: 11, color: '#e67e22', fontWeight: '600' },
    logoutBtn: { padding: 8, borderRadius: 8, backgroundColor: '#fdecea' },
});
