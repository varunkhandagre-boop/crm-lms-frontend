import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmployeeOverview, fetchEmployeeOverview, OverviewPeriod } from '../services/api/users';

// Employee 360: one employee on one screen — profile, attendance, this
// month's salary estimate, leave, advances, expenses, payslips and work.
// Opened from Manage Team (office roles). All numbers come from the server,
// computed the same way as the Attendance, Leave and Payroll screens.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rs = (n: number | null | undefined) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const dmy = (s: string | null | undefined) => {
    if (!s) return '-';
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};

function Section({ color, icon, title, children }: { color: string; icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
    return (
        <View style={{ marginTop: 14 }}>
            <View style={[styles.secHead, { backgroundColor: color }]}>
                <Ionicons name={icon} size={15} color="#fff" />
                <Text style={styles.secHeadText}>{title}</Text>
            </View>
            <View style={[styles.secBody, { borderLeftColor: color }]}>{children}</View>
        </View>
    );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
        <View style={styles.stat}>
            <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

function Line({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
    return (
        <View style={styles.line}>
            <Text style={[styles.lineLabel, bold && { fontWeight: 'bold', color: '#222' }]}>{label}</Text>
            <Text style={[styles.lineValue, color ? { color } : null, bold && { fontSize: 16 }]}>{value}</Text>
        </View>
    );
}

export default function Employee360Screen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [data, setData] = useState<EmployeeOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<OverviewPeriod>('month');

    const load = useCallback(async (isRefresh = false) => {
        if (!id) return;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            setData(await fetchEmployeeOverview(String(id), period));
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load this employee');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, period]);

    useEffect(() => {
        const t = setTimeout(() => load(), 0); // first load, outside the render pass
        return () => clearTimeout(t);
    }, [load]);

    if (loading && !data) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Header onBack={() => router.back()} title="Employee 360" />
                <ActivityIndicator size="large" color="#6a1b9a" style={{ marginTop: 60 }} />
            </SafeAreaView>
        );
    }
    if (!data) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Header onBack={() => router.back()} title="Employee 360" />
                <Text style={styles.error}>{error || 'Not found'}</Text>
            </SafeAreaView>
        );
    }

    const p = data.profile;
    const am = data.attendance;
    const pl = data.period.label;
    const sal = data.salaryThisMonth;
    const lv = data.leave.summary;
    const w = data.work;
    const initials = p.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    const tenure = p.tenure ? `${p.tenure.years ? `${p.tenure.years} yr ` : ''}${p.tenure.months} mo` : null;
    const hasSales = w.sales > 0 || w.collection > 0 || w.visits > 0 || w.openLeads > 0 || !!p.monthlyTarget;
    const hasService = w.serviceCallsOpen > 0 || w.serviceCallsClosed > 0;
    const PERIODS: { k: OverviewPeriod; t: string }[] = [
        { k: 'month', t: 'This month' }, { k: 'fy', t: 'This FY' }, { k: 'lastfy', t: 'Last FY' }, { k: 'all', t: 'All time' },
    ];

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Header onBack={() => router.back()} title="Employee 360" />
            <ScrollView
                contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
            >
                {/* Profile */}
                <View style={styles.profile}>
                    {p.profileImage ? (
                        <Image source={{ uri: p.profileImage }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarEmpty]}><Text style={styles.avatarText}>{initials}</Text></View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.name}>{p.name}</Text>
                        <Text style={styles.sub}>{[p.jobTitle || p.role, p.empId].filter(Boolean).join(' • ')}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            <Text style={[styles.badge, p.isActive ? styles.badgeOn : styles.badgeOff]}>{p.isActive ? 'Active' : 'Disabled'}</Text>
                            {!!tenure && <Text style={[styles.badge, styles.badgeInfo]}>🗓 {tenure}</Text>}
                        </View>
                    </View>
                </View>
                <View style={styles.card}>
                    <Line label="Joined" value={dmy(p.joiningDate)} />
                    <Line label="Weekly off / shift" value={p.schedule} />
                    {p.baseSalary !== null && <Line label="Base salary" value={rs(p.baseSalary)} />}
                    {!!p.monthlyTarget && <Line label="Sales target / month" value={rs(p.monthlyTarget)} />}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        {!!p.mobile && (
                            <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(`tel:${p.mobile}`)}>
                                <Ionicons name="call" size={15} color="#2e7d32" /><Text style={[styles.actionText, { color: '#2e7d32' }]}>{p.mobile}</Text>
                            </TouchableOpacity>
                        )}
                        {!!p.email && (
                            <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(`mailto:${p.email}`)}>
                                <Ionicons name="mail" size={15} color="#1565c0" /><Text style={[styles.actionText, { color: '#1565c0' }]} numberOfLines={1}>Email</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Period for attendance / work / expenses */}
                <View style={styles.periodRow}>
                    {PERIODS.map((x) => (
                        <TouchableOpacity key={x.k} style={[styles.periodChip, period === x.k && styles.periodChipOn]} onPress={() => setPeriod(x.k)} disabled={refreshing}>
                            <Text style={[styles.periodText, period === x.k && { color: '#fff' }]}>{x.t}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={[styles.hint, { textAlign: 'center' }]}>{dmy(data.period.from)} – {dmy(data.period.to)}{loading ? '  • loading…' : ''}</Text>

                {/* Attendance */}
                <Section color="#00897b" icon="calendar" title={`Attendance — ${pl}`}>
                    <View style={styles.statRow}>
                        <Stat label="Present" value={am.present} color="#2e7d32" />
                        <Stat label="Short" value={am.short ?? 0} color="#f9a825" />
                        <Stat label="Absent" value={am.absent} color="#c62828" />
                        <Stat label="Leave" value={am.leave} color="#6a1b9a" />
                        <Stat label="Off/Hol" value={am.holiday} color="#757575" />
                    </View>
                </Section>

                {/* Salary estimate */}
                {sal && (
                    <Section color="#1565c0" icon="cash" title="This month's salary (estimate till today)">
                        {sal.lateDays > 0 && <Line label={`Late (${sal.lateDays} times)`} value={`− ${rs(sal.lateDeduction)}`} color="#ef6c00" />}
                        {sal.absentDays > 0 && <Line label={`Absent (${sal.absentDays} day)`} value={`− ${rs(sal.absentDeduction)}`} color="#c62828" />}
                        {sal.overtimeHours > 0 && <Line label={`Overtime (${sal.overtimeHours} h)`} value={`+ ${rs(sal.overtimeAmount)}`} color="#1565c0" />}
                        {sal.incentiveAmount > 0 && <Line label="Incentive" value={`+ ${rs(sal.incentiveAmount)}`} color="#2e7d32" />}
                        {sal.expenseAmount > 0 && <Line label="Expenses" value={`+ ${rs(sal.expenseAmount)}`} color="#2e7d32" />}
                        {sal.advanceDeduction > 0 && <Line label="Advance recovery" value={`− ${rs(sal.advanceDeduction)}`} color="#c62828" />}
                        <Line label="Estimated net" value={rs(sal.netPayable)} bold />
                        <Text style={styles.hint}>By the company’s Salary Rules. The real amount is fixed when the payslip is generated.</Text>
                    </Section>
                )}

                {/* Leave */}
                <Section color="#6a1b9a" icon="briefcase" title={`Leave — ${lv.fyLabel}`}>
                    {lv.policy?.enabled && lv.balances ? (
                        <View style={styles.statRow}>
                            {lv.balances.map((b) => (
                                <Stat key={b.type} label={b.type === 'COMP' ? 'Comp Off' : b.type} value={b.balance} color={b.overdrawn > 0 ? '#c62828' : '#6a1b9a'} />
                            ))}
                            {lv.lwp > 0 && <Stat label="LWP" value={lv.lwp} color="#c62828" />}
                        </View>
                    ) : (
                        <View style={styles.statRow}>
                            <Stat label="Balance" value={lv.balance} color="#6a1b9a" />
                            <Stat label="Used" value={lv.used} />
                            <Stat label="Total" value={lv.totalQuota} />
                            {lv.lwp > 0 && <Stat label="LWP" value={lv.lwp} color="#c62828" />}
                        </View>
                    )}
                    {data.leave.recent.length > 0 && <Text style={styles.subHead}>Recent</Text>}
                    {data.leave.recent.map((l) => (
                        <View key={l.id} style={styles.listRow}>
                            <Text style={{ flex: 1, color: '#333' }} numberOfLines={1}>{l.type}{l.halfDay ? ' (½)' : ''}</Text>
                            <Text style={{ color: '#555', fontSize: 12 }}>{dmy(l.fromDate)}{l.toDate.slice(0, 10) !== l.fromDate.slice(0, 10) ? ` – ${dmy(l.toDate)}` : ''} • {l.days}d</Text>
                            <Text style={[styles.status, l.status === 'APPROVED' ? { color: '#2e7d32' } : l.status === 'REJECTED' ? { color: '#c62828' } : { color: '#ef6c00' }]}>{l.status}</Text>
                        </View>
                    ))}
                </Section>

                {/* Money: advances + expenses */}
                <Section color="#c62828" icon="wallet" title="Advances & expenses">
                    <Line label="Advance outstanding" value={rs(data.advances.outstanding)} color={data.advances.outstanding > 0 ? '#c62828' : undefined} bold />
                    {data.advances.items.map((a) => (
                        <Text key={a.id} style={styles.small}>
                            {dmy(a.date)} • {rs(a.amount)} • recovered {rs(a.recoveredAmount)}{a.monthlyDeductionAmount ? ` • ${rs(a.monthlyDeductionAmount)}/month` : ''} • {a.status}
                        </Text>
                    ))}
                    <Line label={`Expenses — ${pl}`} value={rs(data.expenses.inPeriod)} />
                    {data.expenses.pendingCount > 0 && <Line label={`Expenses pending approval (${data.expenses.pendingCount})`} value={rs(data.expenses.pendingAmount)} color="#ef6c00" />}
                </Section>

                {/* Payslips */}
                <Section color="#2e7d32" icon="document-text" title="Payslips">
                    {data.payslips.length === 0 ? (
                        <Text style={styles.small}>No payslips generated yet.</Text>
                    ) : data.payslips.map((s) => (
                        <View key={s.id} style={styles.listRow}>
                            <Text style={{ flex: 1, color: '#333' }}>{MONTHS[s.month - 1]} {s.year}</Text>
                            <Text style={{ fontWeight: 'bold', color: '#222', marginRight: 8 }}>{rs(s.netPayable)}</Text>
                            <Text style={[styles.status, s.runStatus === 'PAID' ? { color: '#2e7d32' } : s.runStatus === 'FINALIZED' ? { color: '#6a1b9a' } : { color: '#ef6c00' }]}>
                                {s.runStatus === 'PAID' ? `Paid ${dmy(s.paidAt)}` : s.runStatus === 'FINALIZED' ? 'Final' : 'Draft'}
                            </Text>
                        </View>
                    ))}
                </Section>

                {/* Work */}
                <Section color="#ef6c00" icon="trending-up" title={`Work & performance — ${pl}`}>
                    {hasSales && (
                        <>
                            <View style={styles.statRow}>
                                <Stat label="Sales" value={rs(w.sales)} color="#2e7d32" />
                                <Stat label="Collection" value={rs(w.collection)} color="#1565c0" />
                                <Stat label={`Visits${w.monthlyVisitTarget ? ` / ${w.monthlyVisitTarget}` : ''}`} value={w.visits} color="#ef6c00" />
                            </View>
                            {!!w.salesTarget && (
                                <>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { width: `${Math.min(100, (w.sales / w.salesTarget) * 100)}%` }]} />
                                    </View>
                                    <Text style={styles.hint}>{Math.round((w.sales / w.salesTarget) * 100)}% of the {rs(w.salesTarget)} monthly target</Text>
                                </>
                            )}
                            <Text style={styles.fyLine}>{w.orders} order(s) • {w.collections} collection(s) • {w.openLeads} open lead(s) now</Text>
                        </>
                    )}
                    {hasService && <Line label={`Service calls — open now / closed in period`} value={`${w.serviceCallsOpen} / ${w.serviceCallsClosed}`} />}
                    <Line label="Tasks pending" value={`${w.tasksPending}${w.tasksOverdue ? `  (${w.tasksOverdue} overdue)` : ''}`} color={w.tasksOverdue ? '#c62828' : undefined} />
                </Section>

                <Text style={[styles.hint, { textAlign: 'center', marginTop: 14 }]}>As of {dmy(data.asOf)} • pull down to refresh</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f8' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#6a1b9a' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 12 },
    error: { textAlign: 'center', color: '#c62828', marginTop: 40, paddingHorizontal: 20 },
    profile: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 1 },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
    avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ede7f6' },
    avatarText: { fontSize: 22, fontWeight: 'bold', color: '#6a1b9a' },
    name: { fontSize: 19, fontWeight: 'bold', color: '#222' },
    sub: { fontSize: 13, color: '#666', marginTop: 2 },
    badge: { fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
    badgeOn: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
    badgeOff: { backgroundColor: '#ffebee', color: '#c62828' },
    badgeInfo: { backgroundColor: '#e3f2fd', color: '#1565c0' },
    card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10, elevation: 1 },
    action: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f7fa', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
    actionText: { marginLeft: 5, fontWeight: 'bold', fontSize: 12 },
    secHead: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
    secHeadText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
    secBody: { backgroundColor: '#fff', borderRadius: 12, borderTopLeftRadius: 0, borderLeftWidth: 5, padding: 12, elevation: 1 },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    stat: { alignItems: 'center', minWidth: 56, marginVertical: 4 },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#222' },
    statLabel: { fontSize: 11, color: '#777', marginTop: 2 },
    fyLine: { fontSize: 12, color: '#555', marginTop: 8 },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
    lineLabel: { fontSize: 13, color: '#555', flex: 1, marginRight: 8 },
    lineValue: { fontSize: 14, fontWeight: '600', color: '#222', textAlign: 'right', flexShrink: 1 },
    hint: { fontSize: 11, color: '#888', marginTop: 6 },
    subHead: { fontSize: 12, fontWeight: 'bold', color: '#555', marginTop: 10, marginBottom: 2 },
    listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f2f2f2', gap: 6 },
    status: { fontSize: 11, fontWeight: 'bold' },
    small: { fontSize: 12, color: '#555', marginTop: 4 },
    periodRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 14 },
    periodChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1c4e9' },
    periodChipOn: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
    periodText: { fontSize: 12, fontWeight: 'bold', color: '#6a1b9a' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: '#eceff1', overflow: 'hidden', marginTop: 8 },
    barFill: { height: 8, borderRadius: 4, backgroundColor: '#2e7d32' },
});
