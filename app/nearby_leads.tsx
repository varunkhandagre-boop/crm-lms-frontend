import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getCurrentLocation as getGpsFix, locationErrorMessage } from '../utils/getLocation';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useServerPagedList } from '../hooks/useServerPagedList';
import { getNearbyCities, getNearbyLeadsPage, NearbyLead } from '../services/api/leads';
import { useData } from './context/DataContext';

// Nearby Leads: open leads around the phone's location (only leads that have
// coordinates — saved when a lead or its visit is logged with GPS) or in one
// city. Everything is filtered and sorted on the server, 20 at a time.

const RADII = [5, 10, 25, 50, 100];
type Mode = 'near' | 'city';

const fmtDate = (ymd: string | null) => {
    if (!ymd) return 'No follow-up';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
};

export default function NearbyLeadsScreen() {
    const router = useRouter();
    const { currentUser } = useData();

    const [mode, setMode] = useState<Mode>('near');
    const [view, setView] = useState<'list' | 'map'>('list');

    // ── Near me ──
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [locating, setLocating] = useState(false);
    const [locError, setLocError] = useState<string | null>(null);
    const [radiusKm, setRadiusKm] = useState(25);

    const locate = useCallback(async () => {
        setLocating(true);
        setLocError(null);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocError('Location permission is needed for "Near me". You can still use "By city".');
                return;
            }
            const pos = await getGpsFix();
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch (err) {
            setLocError(locationErrorMessage(err));
        } finally {
            setLocating(false);
        }
    }, []);

    // Screen opens on "Near me": locate once right away (deferred a tick).
    useEffect(() => {
        const t = setTimeout(locate, 0);
        return () => clearTimeout(t);
    }, [locate]);

    const switchMode = (m: Mode) => {
        setMode(m);
        if (m === 'near' && !coords && !locating) locate();
    };

    // ── By city ──
    const [cities, setCities] = useState<{ city: string; count: number }[]>([]);
    const [leadsWithLocation, setLeadsWithLocation] = useState<number | null>(null);
    const [cityQuery, setCityQuery] = useState('');
    const [city, setCity] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser?.companyId) return;
        getNearbyCities()
            .then((r) => { setCities(r.cities); setLeadsWithLocation(r.leadsWithLocation); })
            .catch(() => {});
    }, [currentUser?.companyId]);

    // The city picker list is small (one row per city), so narrowing it as you type is local.
    const shownCities = useMemo(() => {
        const q = cityQuery.trim().toLowerCase();
        return q ? cities.filter((c) => c.city.toLowerCase().includes(q)) : cities;
    }, [cities, cityQuery]);

    // ── Results (server-paged) ──
    const filters = useMemo<any>(() => {
        if (mode === 'near') return coords ? { lat: coords.lat, lng: coords.lng, radiusKm } : null;
        return city ? { city } : null;
    }, [mode, coords, radiusKm, city]);

    const { items, total, loading, loadingMore, hasMore, loadMore, refresh, refreshing } = useServerPagedList<any, NearbyLead>({
        fetchPage: getNearbyLeadsPage,
        filters: filters || {},
        enabled: !!currentUser?.companyId && !!filters,
    });

    const located = items.filter((l) => l.latitude != null && l.longitude != null);

    const openLead = (id: string) => router.push({ pathname: '/lead_details', params: { id } } as any);
    const call = (mobile: string | null) => { if (mobile) Linking.openURL(`tel:${mobile}`); };
    const directions = (l: NearbyLead) => {
        if (l.latitude == null || l.longitude == null) return;
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}`);
    };

    const renderLead = ({ item }: { item: NearbyLead }) => (
        <TouchableOpacity style={styles.card} onPress={() => openLead(item.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.isHot ? '🔥 ' : ''}{item.orgName}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                        {[item.contactPerson, item.city].filter(Boolean).join(' • ') || '—'}
                    </Text>
                </View>
                {item.distanceKm != null && (
                    <View style={styles.distance}><Text style={styles.distanceText}>{item.distanceKm} km</Text></View>
                )}
            </View>
            <View style={styles.metaRow}>
                <Text style={styles.stage}>{item.stage || 'New'}</Text>
                <Text style={styles.meta}>📅 {fmtDate(item.nextDate)}</Text>
                {!!item.assignedToName && <Text style={styles.meta} numberOfLines={1}>👤 {item.assignedToName}</Text>}
            </View>
            <View style={styles.actions}>
                {!!item.mobile && (
                    <TouchableOpacity style={styles.action} onPress={() => call(item.mobile)}>
                        <Ionicons name="call" size={15} color="#2e7d32" />
                        <Text style={[styles.actionText, { color: '#2e7d32' }]}>Call</Text>
                    </TouchableOpacity>
                )}
                {item.latitude != null && (
                    <TouchableOpacity style={styles.action} onPress={() => directions(item)}>
                        <Ionicons name="navigate" size={15} color="#1565c0" />
                        <Text style={[styles.actionText, { color: '#1565c0' }]}>Directions</Text>
                    </TouchableOpacity>
                )}
            </View>
        </TouchableOpacity>
    );

    const footer = hasMore ? (
        <TouchableOpacity style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
            {loadingMore ? <ActivityIndicator color="#3b5998" /> : <Text style={styles.loadMoreText}>Load more ({total - items.length} remaining)</Text>}
        </TouchableOpacity>
    ) : <View style={{ height: 30 }} />;

    const emptyText = mode === 'near'
        ? (leadsWithLocation === 0
            ? 'No open lead has a saved location yet. A location is saved when a lead (or a visit for it) is logged with GPS. Use "By city" meanwhile.'
            : `No open leads within ${radiusKm} km. Try a bigger distance.`)
        : 'No open leads in this city.';

    const mapRegion = useMemo(() => {
        const pts = located.map((l) => ({ lat: l.latitude!, lng: l.longitude! }));
        if (mode === 'near' && coords) pts.push(coords);
        if (pts.length === 0) return { latitude: 21.1458, longitude: 79.0882, latitudeDelta: 1, longitudeDelta: 1 };
        const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        return {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
            longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.4),
        };
    }, [located, coords, mode]);

    const showResults = mode === 'near' ? !!coords : !!city;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Nearby Leads</Text>
                {showResults && (
                    <TouchableOpacity style={styles.viewToggle} onPress={() => setView(view === 'list' ? 'map' : 'list')}>
                        <Ionicons name={view === 'list' ? 'map-outline' : 'list-outline'} size={18} color="#3b5998" />
                        <Text style={styles.viewToggleText}>{view === 'list' ? 'Map' : 'List'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.tabs}>
                {(['near', 'city'] as Mode[]).map((m) => (
                    <TouchableOpacity key={m} style={[styles.tab, mode === m && styles.tabActive]} onPress={() => switchMode(m)}>
                        <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{m === 'near' ? '📍 Near me' : '🏙️ By city'}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mode === 'near' ? (
                <View style={styles.controls}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {RADII.map((r) => (
                            <TouchableOpacity key={r} style={[styles.chip, radiusKm === r && styles.chipActive]} onPress={() => setRadiusKm(r)}>
                                <Text style={[styles.chipText, radiusKm === r && styles.chipTextActive]}>{r} km</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.chip} onPress={locate} disabled={locating}>
                            {locating ? <ActivityIndicator size="small" color="#3b5998" /> : <Text style={styles.chipText}>↻ My location</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                    {!!locError && <Text style={styles.warn}>{locError}</Text>}
                    {!locError && locating && !coords && <Text style={styles.hint}>Getting your location…</Text>}
                </View>
            ) : (
                <View style={styles.controls}>
                    {city ? (
                        <TouchableOpacity style={[styles.chip, styles.chipActive, { alignSelf: 'flex-start' }]} onPress={() => setCity(null)}>
                            <Text style={styles.chipTextActive}>🏙️ {city}  ✕</Text>
                        </TouchableOpacity>
                    ) : (
                        <TextInput
                            style={styles.search}
                            placeholder="Search city…"
                            value={cityQuery}
                            onChangeText={setCityQuery}
                        />
                    )}
                </View>
            )}

            {mode === 'city' && !city ? (
                <FlatList
                    data={shownCities}
                    keyExtractor={(c) => c.city}
                    contentContainerStyle={{ padding: 12 }}
                    ListEmptyComponent={<Text style={styles.empty}>No cities found.</Text>}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.cityRow} onPress={() => setCity(item.city)}>
                            <Text style={styles.cityName}>{item.city}</Text>
                            <Text style={styles.cityCount}>{item.count} open</Text>
                            <Ionicons name="chevron-forward" size={18} color="#999" />
                        </TouchableOpacity>
                    )}
                />
            ) : !showResults ? (
                <View style={{ padding: 30, alignItems: 'center' }}>
                    {locating ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={styles.empty}>{locError || 'Tap "↻ My location" to find leads near you.'}</Text>}
                </View>
            ) : view === 'map' ? (
                <View style={{ flex: 1 }}>
                    <MapView
                        style={{ flex: 1 }}
                        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                        region={mapRegion}
                        showsUserLocation={mode === 'near'}
                    >
                        {located.map((l) => (
                            <Marker
                                key={l.id}
                                coordinate={{ latitude: l.latitude!, longitude: l.longitude! }}
                                title={`${l.isHot ? '🔥 ' : ''}${l.orgName}`}
                                description={`${l.stage || 'New'}${l.distanceKm != null ? ` • ${l.distanceKm} km` : ''} — tap to open`}
                                pinColor={l.isHot ? 'red' : 'orange'}
                                onCalloutPress={() => openLead(l.id)}
                            />
                        ))}
                    </MapView>
                    <View style={styles.mapNote}>
                        <Text style={styles.mapNoteText}>
                            {located.length} of {items.length} loaded leads have a location{hasMore ? ` • ${total} in total — open List to load more` : ''}
                        </Text>
                    </View>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(l) => l.id}
                    renderItem={renderLead}
                    contentContainerStyle={{ padding: 12 }}
                    onRefresh={refresh}
                    refreshing={refreshing}
                    ListHeaderComponent={!loading && total > 0 ? <Text style={styles.total}>{total} open lead{total === 1 ? '' : 's'}</Text> : null}
                    ListEmptyComponent={loading ? <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 30 }} /> : <Text style={styles.empty}>{emptyText}</Text>}
                    ListFooterComponent={footer}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', elevation: 2 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 12 },
    viewToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
    viewToggleText: { marginLeft: 4, color: '#3b5998', fontWeight: 'bold', fontSize: 12 },
    tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 10, paddingBottom: 8 },
    tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, marginHorizontal: 4, backgroundColor: '#f1f3f6' },
    tabActive: { backgroundColor: '#3b5998' },
    tabText: { fontWeight: 'bold', color: '#555' },
    tabTextActive: { color: '#fff' },
    controls: { paddingHorizontal: 12, paddingTop: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d7e2', marginRight: 8, justifyContent: 'center' },
    chipActive: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    chipText: { color: '#3b5998', fontWeight: '600', fontSize: 13 },
    chipTextActive: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    warn: { color: '#c62828', fontSize: 12, marginTop: 8 },
    hint: { color: 'gray', fontSize: 12, marginTop: 8 },
    search: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d7e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
    cityRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 8 },
    cityName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
    cityCount: { color: '#3b5998', fontWeight: 'bold', marginRight: 6 },
    total: { textAlign: 'right', fontSize: 12, color: 'gray', marginBottom: 6 },
    empty: { textAlign: 'center', color: 'gray', marginTop: 30, paddingHorizontal: 20, lineHeight: 20 },
    card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, elevation: 1 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#222' },
    cardSub: { fontSize: 12, color: '#666', marginTop: 2 },
    distance: { backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 },
    distanceText: { color: '#2e7d32', fontWeight: 'bold', fontSize: 12 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8, gap: 10 },
    stage: { fontSize: 11, fontWeight: 'bold', color: '#3b5998', backgroundColor: '#e8eaf6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    meta: { fontSize: 11, color: '#555' },
    actions: { flexDirection: 'row', marginTop: 10, gap: 10 },
    action: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f5f7fa' },
    actionText: { marginLeft: 4, fontWeight: 'bold', fontSize: 12 },
    loadMore: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
    loadMoreText: { fontWeight: 'bold', color: '#3b5998' },
    mapNote: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.95)', padding: 8, borderRadius: 8 },
    mapNoteText: { fontSize: 12, color: '#333', textAlign: 'center' },
});
