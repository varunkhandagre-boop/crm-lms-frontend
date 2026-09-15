import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuditLogEntry, fetchAuditLogs } from '../services/api/auditLogs';

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  USER_UPDATED: { icon: 'person-outline', color: '#3b5998' },
  CHEQUE_BOUNCED: { icon: 'alert-circle-outline', color: '#d32f2f' },
};

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadLogs = async (pageNum: number = 1, append: boolean = false) => {
    try {
      const result = await fetchAuditLogs(pageNum);
      setLogs((prev) => (append ? [...prev, ...result.data] : result.data));
      setHasMore(pageNum < result.meta.totalPages);
      setPage(pageNum);
    } catch (e) {
      console.log('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs(1);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadLogs(1);
  };

  const loadMore = () => {
    if (hasMore && !loading) loadLogs(page + 1, true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity History</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && logs.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3b5998" />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centerLoading}>
          <Ionicons name="document-text-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No activity recorded yet.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 15 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => {
            const iconInfo = ACTION_ICONS[item.action] || { icon: 'ellipse-outline', color: '#666' };
            return (
              <View style={styles.logCard}>
                <View style={[styles.iconCircle, { backgroundColor: iconInfo.color + '20' }]}>
                  <Ionicons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionText}>{formatAction(item.action)}</Text>
                  {item.details && <Text style={styles.detailsText}>{item.details}</Text>}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{item.performedBy?.name || 'Unknown'}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {new Date(item.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#3b5998', paddingTop: 50, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#999', marginTop: 10, fontSize: 14 },
  logCard: { backgroundColor: 'white', borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12, elevation: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  detailsText: { fontSize: 13, color: '#555', marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  metaText: { fontSize: 11, color: '#999' },
  metaDot: { fontSize: 11, color: '#ccc' },
});
