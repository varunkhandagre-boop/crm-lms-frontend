import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from './maps';
import { DayPoint, DayPointKind, DayRoute, fetchDayRoute, fetchLatestPoints, LatestPoint } from '../services/api/locationLogs';

const KIND_STYLE: Record<DayPointKind, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    DAY_IN: { label: 'Day In', color: '#2e7d32', icon: 'log-in' },
    DAY_OUT: { label: 'Day Out', color: '#c62828', icon: 'log-out' },
    TRACK: { label: 'Location update', color: '#4fc3f7', icon: 'navigate' },
    VISIT: { label: 'Visit', color: '#ef6c00', icon: 'briefcase' },
    ORDER: { label: 'Order', color: '#8e24aa', icon: 'cart' },
    SERVICE: { label: 'Service Call', color: '#455a64', icon: 'construct' },
    INSTALLATION: { label: 'Installation', color: '#6d4c41', icon: 'hammer' },
    PMS: { label: 'PMS', color: '#43a047', icon: 'shield-checkmark' },
    ACTIVITY: { label: 'Activity', color: '#1e88e5', icon: 'calendar' },
    LEAD: { label: 'Lead', color: '#f9a825', icon: 'funnel' },
};

const INDIA = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 15, longitudeDelta: 15 };
const EMPTY_POINTS: DayPoint[] = [];
const EMPTY_LATEST: LatestPoint[] = [];
const timeText = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Props = {
    /** 'all' or an employee id. */
    userId: string;
    /** YYYY-MM-DD (local day). */
    date: string;
    /** Bumped by the parent's refresh button. */
    refreshKey: number;
};

/**
 * Employee Day Map: one person's day on a map (path + coloured pins for Day In/Out
 * and every saved record) with a time-ordered list below; "All Staff" shows each
 * employee's last point without joining people together.
 */
export default function DayRouteMap({ userId, date, refreshKey }: Props) {
    const mapRef = useRef<MapView>(null);
    const [showTrack, setShowTrack] = useState(true);

    // One result per (person, day, refresh); "loading" = the result is for an older request.
    const requestKey = `${userId}|${date}|${refreshKey}`;
    const [result, setResult] = useState<{ key: string; route: DayRoute | null; latest: LatestPoint[]; error: string | null }>({
        key: '', route: null, latest: [], error: null,
    });
    useEffect(() => {
        let cancelled = false;
        const load = userId === 'all'
            ? fetchLatestPoints(date).then((latest) => ({ route: null, latest, error: null }))
            : fetchDayRoute(date, userId).then((route) => ({ route, latest: [] as LatestPoint[], error: null }));
        load
            .catch((e: any) => ({ route: null, latest: [] as LatestPoint[], error: e?.message || 'Could not load the map.' }))
            .then((r) => { if (!cancelled) setResult({ key: requestKey, ...r }); });
        return () => { cancelled = true; };
    }, [userId, date, requestKey]);

    const loading = result.key !== requestKey;
    const route = loading ? null : result.route;
    const latest = loading ? EMPTY_LATEST : result.latest;
    const error = loading ? null : result.error;

    const points = useMemo(() => route?.points ?? EMPTY_POINTS, [route]);
    // Bad GPS fixes: path points are hidden; work records stay listed but are left off the map and line.
    const goodPoints = useMemo(() => points.filter((p) => !p.outlier), [points]);
    const pins = useMemo(() => goodPoints.filter((p) => showTrack || p.kind !== 'TRACK'), [goodPoints, showTrack]);
    const listItems = useMemo(() => points.filter((p) => p.kind !== 'TRACK'), [points]);

    // Fit the map to whatever is shown.
    useEffect(() => {
        const coords = userId === 'all'
            ? latest.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
            : goodPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
        if (coords.length === 0) return;
        const t = setTimeout(() => {
            mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
        }, 300);
        return () => clearTimeout(t);
    }, [goodPoints, latest, userId]);

    const focus = (p: { latitude: number; longitude: number }) => {
        mapRef.current?.animateToRegion({ latitude: p.latitude, longitude: p.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    };

    const openInMaps = (p: DayPoint) => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`).catch(() => {});
    };

    const summary = route?.summary;

    return (
        <View style={{ flex: 1 }}>
            {userId !== 'all' && route && (
                <View style={styles.summary}>
                    <SummaryItem label="Day In" value={route.dayIn ? timeText(route.dayIn) : '—'} />
                    <SummaryItem label="Day Out" value={route.dayOut ? timeText(route.dayOut) : '—'} />
                    <SummaryItem label="Work done" value={String(summary?.workCount ?? 0)} />
                    <SummaryItem label="Approx. km" value={String(summary?.approxKm ?? 0)} />
                </View>
            )}
            {userId !== 'all' && !!summary?.ignoredPoints && (
                <Text style={styles.ignoredNote}>{summary.ignoredPoints} wrong GPS point(s) ignored in km and route</Text>
            )}

            <View style={userId === 'all' ? { flex: 1 } : { flex: 1.2 }}>
                <MapView ref={mapRef} style={{ flex: 1 }} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} initialRegion={INDIA}>
                    {userId !== 'all' && goodPoints.length > 1 && (
                        <Polyline coordinates={goodPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))} strokeColor="#3b5998" strokeWidth={3} />
                    )}
                    {userId !== 'all' && pins.map((p) => (
                        <Marker
                            key={p.id}
                            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                            title={`${timeText(p.time)} • ${KIND_STYLE[p.kind].label}`}
                            description={p.kind === 'TRACK' ? undefined : [p.title, p.subtitle].filter(Boolean).join(' — ')}
                            pinColor={KIND_STYLE[p.kind].color}
                            zIndex={p.kind === 'TRACK' ? 1 : 10}
                            opacity={p.kind === 'TRACK' ? 0.7 : 1}
                        />
                    ))}
                    {userId === 'all' && latest.map((p) => (
                        <Marker
                            key={p.userId}
                            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                            title={p.userName}
                            description={`Last update ${timeText(p.time)}`}
                            pinColor="#3b5998"
                        />
                    ))}
                </MapView>

                {loading && <ActivityIndicator size="large" color="#3b5998" style={styles.overlayLoader} />}
                {!loading && error && <Text style={styles.overlayMsg}>{error}</Text>}
                {!loading && !error && userId !== 'all' && points.length === 0 && (
                    <Text style={styles.overlayMsg}>No locations for this day.</Text>
                )}
                {!loading && !error && userId === 'all' && latest.length === 0 && (
                    <Text style={styles.overlayMsg}>No one has shared a location on this day.</Text>
                )}

                {userId !== 'all' && points.some((p) => p.kind === 'TRACK') && (
                    <TouchableOpacity style={styles.trackToggle} onPress={() => setShowTrack((v) => !v)}>
                        <Ionicons name={showTrack ? 'eye' : 'eye-off'} size={14} color="#3b5998" />
                        <Text style={styles.trackToggleText}>{showTrack ? 'Hide' : 'Show'} path points</Text>
                    </TouchableOpacity>
                )}
            </View>

            {userId === 'all' ? (
                <FlatList
                    style={styles.list}
                    data={latest}
                    keyExtractor={(p) => p.userId}
                    ListHeaderComponent={latest.length > 0 ? <Text style={styles.listHeader}>Last location of each employee — pick a name above for the full day</Text> : null}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.row} onPress={() => focus(item)}>
                            <View style={[styles.dot, { backgroundColor: '#3b5998' }]} />
                            <Text style={styles.rowTitle} numberOfLines={1}>{item.userName}</Text>
                            <Text style={styles.rowTime}>{timeText(item.time)}</Text>
                        </TouchableOpacity>
                    )}
                />
            ) : (
                <FlatList
                    style={styles.list}
                    data={listItems}
                    keyExtractor={(p) => p.id}
                    ListEmptyComponent={!loading && points.length > 0 ? <Text style={styles.empty}>Only path points today — no visits or records with location.</Text> : null}
                    renderItem={({ item }) => {
                        const k = KIND_STYLE[item.kind];
                        return (
                            <TouchableOpacity style={styles.row} onPress={() => focus(item)} onLongPress={() => openInMaps(item)}>
                                <Text style={styles.rowTime}>{timeText(item.time)}</Text>
                                <View style={[styles.iconBox, { backgroundColor: k.color }]}>
                                    <Ionicons name={k.icon} size={14} color="white" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>
                                        {item.kind === 'DAY_IN' || item.kind === 'DAY_OUT' ? k.label : `${k.label}: ${item.title}`}
                                    </Text>
                                    {(item.subtitle || item.address) ? (
                                        <Text style={styles.rowSub} numberOfLines={1}>{item.subtitle || item.address}</Text>
                                    ) : null}
                                    {item.outlier && <Text style={styles.gpsWarn}>GPS location looked wrong — not on the map</Text>}
                                </View>
                                <Ionicons name="locate" size={16} color="#90a4ae" />
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.summaryValue}>{value}</Text>
            <Text style={styles.summaryLabel}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    gpsWarn: { fontSize: 10, color: '#e65100', marginTop: 1 },
    ignoredNote: { fontSize: 11, color: '#e65100', backgroundColor: '#fff3e0', textAlign: 'center', paddingVertical: 3 },
    summary: { flexDirection: 'row', backgroundColor: 'white', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
    summaryValue: { fontSize: 15, fontWeight: 'bold', color: '#2c3e50' },
    summaryLabel: { fontSize: 10, color: 'gray', marginTop: 1 },
    overlayLoader: { position: 'absolute', top: 20, alignSelf: 'center' },
    overlayMsg: {
        position: 'absolute', bottom: 16, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, color: 'gray', fontSize: 12, overflow: 'hidden',
    },
    trackToggle: {
        position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, elevation: 2,
    },
    trackToggleText: { fontSize: 11, color: '#3b5998', fontWeight: '600' },
    list: { flex: 1, backgroundColor: 'white' },
    listHeader: { fontSize: 11, color: 'gray', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
    empty: { textAlign: 'center', color: 'gray', fontSize: 12, padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderColor: '#f1f1f1' },
    rowTime: { fontSize: 12, color: '#607d8b', width: 62 },
    iconBox: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    rowTitle: { fontSize: 13, fontWeight: '600', color: '#333', flexShrink: 1 },
    rowSub: { fontSize: 11, color: 'gray', marginTop: 1 },
});
