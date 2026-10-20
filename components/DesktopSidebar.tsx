import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ACTIVITY_ITEMS, HR_ITEMS, MenuItemDef, NAV_TABS, SALES_ITEMS, SIDEBAR_ITEMS } from '../constants/menuItems';
import { canSeeTab, MenuAccessCtx, visibleItems } from '../utils/menuAccess';

// Extra words people type for a screen (English + Hinglish), so search finds it
// even when the menu name is different.
const KEYWORDS: Record<string, string> = {
    '/': 'home dashboard',
    '/activity_plan': 'activity plan visit plan schedule',
    '/tasks': 'task todo kaam assign',
    '/leads': 'lead enquiry inquiry customer follow up followup',
    '/service_call': 'service call complaint ticket breakdown repair',
    '/organization': 'org organization hospital client customer party',
    '/dayin': 'attendance day in day out hajri haziri punch login',
    '/travel': 'travel km petrol fuel ta da conveyance',
    '/advance': 'advance loan udhar',
    '/expense': 'expense kharcha bill claim reimbursement purchase approval',
    '/leave': 'leave chutti holiday off absent',
    '/visiting_card': 'visiting card stationery business card',
    '/courier': 'courier docket parcel dispatch inward outward track',
    '/payroll': 'payroll salary payslip tankhwah wages bank sheet',
    '/sales': 'visits dsr cold call visit report',
    '/installation': 'installation install warranty machine',
    '/demo': 'demo demonstration',
    '/pms_schedule': 'pms preventive maintenance',
    '/service_analysis': 'service analysis service report',
    '/projects': 'project site',
    '/leads_board': 'leads board pipeline kanban stage',
    '/quotations': 'quotation quote estimate proforma',
    '/orders': 'order booking po purchase order challan',
    '/payment_collection': 'payment collection receipt paisa cheque upi',
    '/payment_duelist': 'pending dues outstanding balance baki',
    '/sales_analysis': 'sales trends chart dashboard',
    '/sales_team_report': 'team performance target achievement sales calculation',
    '/serial_number': 'serial number machine history',
    '/attendance': 'attendance report present absent late',
    '/spare_parts': 'spare parts stock inventory store',
    '/product_master': 'product master catalog price',
    '/personal_notes': 'personal notes note reminder checklist',
    '/employee_timeline': 'activity timeline employee 360 day report',
    '/messaging_center': 'whatsapp email automation template broadcast message',
    '/manage_team': 'team settings users employees permissions holidays alerts live map setup excel admin',
    '/company_profile': 'company profile logo gst bank address signature qr',
    '/SubscriptionScreen': 'plan renewal subscription renew pay recharge',
    '/help_support': 'help support faq guide',
};

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

    // Search: matches the menu name or its keywords; Enter opens the first result.
    const [query, setQuery] = useState('');
    const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);
    const allItems = useMemo(() => {
        const seen = new Set<string>();
        return [...main, ...sections.flatMap((s) => s.items)].filter((i) => (seen.has(i.route) ? false : (seen.add(i.route), true)));
    }, [main, sections]);
    const results = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        return allItems
            .map((item) => {
                const title = item.title.toLowerCase();
                const hay = `${title} ${KEYWORDS[item.route] || ''}`;
                if (!words.every((w) => hay.includes(w))) return null;
                return { item, rank: title.startsWith(words[0]) ? 0 : title.includes(words[0]) ? 1 : 2 };
            })
            .filter(Boolean)
            .sort((a, b) => a!.rank - b!.rank)
            .map((r) => r!.item);
    }, [query, allItems]);
    const openItem = (item: MenuItemDef) => { setQuery(''); router.push(item.route as any); };

    // "/" or Ctrl+K anywhere (outside a text box) jumps to the search box.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
            if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

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

            <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#8a93a6" />
                <TextInput
                    ref={searchRef}
                    style={styles.searchInput}
                    placeholder="Search menu  ( / )"
                    placeholderTextColor="#9aa1b1"
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={() => results[0] && openItem(results[0])}
                    onKeyPress={(e: any) => { if (e.nativeEvent?.key === 'Escape') setQuery(''); }}
                    returnKeyType="go"
                />
                {!!query && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color="#9aa1b1" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                {query ? (
                    results.length ? (
                        <>
                            <Text style={styles.sectionTitle}>Results</Text>
                            {results.map((item) => (
                                <TouchableOpacity key={item.route} onPress={() => openItem(item)}>
                                    <View pointerEvents="none"><Row item={item} /></View>
                                </TouchableOpacity>
                            ))}
                        </>
                    ) : (
                        <Text style={styles.noResult}>No menu item for "{query}". Try another word.</Text>
                    )
                ) : (
                    <>
                        {main.map((item) => <Row key={item.route} item={item} />)}
                        {sections.map((s) => (
                            <View key={s.title}>
                                <Text style={styles.sectionTitle}>{s.title}</Text>
                                {s.items.map((item) => <Row key={item.route} item={item} />)}
                            </View>
                        ))}
                    </>
                )}
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
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginTop: 10, marginBottom: 4, paddingHorizontal: 10, height: 36, borderRadius: 8, backgroundColor: '#f2f4f8', borderWidth: 1, borderColor: '#e4e7ee' },
    searchInput: { flex: 1, fontSize: 14, color: '#2d3748', outlineStyle: 'none' } as any,
    noResult: { fontSize: 13, color: '#8a93a6', margin: 16 },
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
