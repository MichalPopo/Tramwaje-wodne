import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { getServerUrl } from '../api';
import { colors, spacing, fonts, radius } from '../theme';

interface TaskSummary {
    total: number;
    todo: number;
    in_progress: number;
    blocked: number;
    done: number;
}

interface Worker {
    id: number;
    name: string;
    active_tasks: number;
}

export default function AdminDashScreen({ navigation }: any) {
    const { token, user } = useAuth();
    const [summary, setSummary] = useState<TaskSummary | null>(null);
    const [recentTasks, setRecentTasks] = useState<any[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        if (!token) return;
        const serverUrl = await getServerUrl();
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        try {
            const [summaryRes, tasksRes, usersRes] = await Promise.all([
                fetch(`${serverUrl}/api/tasks/summary`, { headers }).then(r => r.json()).catch(() => null),
                fetch(`${serverUrl}/api/tasks?limit=10`, { headers }).then(r => r.json()).catch(() => ({ tasks: [] })),
                fetch(`${serverUrl}/api/auth/users`, { headers }).then(r => r.json()).catch(() => ({ users: [] })),
            ]);

            if (summaryRes) setSummary(summaryRes);
            if (tasksRes?.tasks) setRecentTasks(tasksRes.tasks);
            if (usersRes?.users) {
                setWorkers(usersRes.users
                    .filter((u: any) => u.is_active)
                    .map((u: any) => ({ id: u.id, name: u.name, active_tasks: 0 }))
                );
            }
        } catch {
            // Offline — show cached data in the future
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        loadData();
    }, [loadData]);

    const statusIcon = (status: string) => {
        switch (status) {
            case 'todo': return '🟡';
            case 'in_progress': return '🟡';
            case 'blocked': return '🔴';
            case 'done': return '🟢';
            default: return '⚪';
        }
    };

    const statusLabel = (status: string) => {
        switch (status) {
            case 'todo': return 'Do zrobienia';
            case 'in_progress': return 'W toku';
            case 'blocked': return 'Zablokowane';
            case 'done': return 'Gotowe';
            default: return status;
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
                    tintColor={colors.primary} colors={[colors.primary]} />
            }
        >
            <Text style={styles.greeting}>👋 Cześć, {user?.name?.split(' ')[0]}</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString('pl-PL', {
                weekday: 'long', day: 'numeric', month: 'long'
            })}</Text>

            {/* Stats cards */}
            {summary && (
                <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                        <Text style={styles.statValue}>{summary.total}</Text>
                        <Text style={styles.statLabel}>Wszystkie</Text>
                    </View>
                    <View style={[styles.statCard, { borderLeftColor: colors.accent }]}>
                        <Text style={styles.statValue}>{summary.in_progress}</Text>
                        <Text style={styles.statLabel}>W toku</Text>
                    </View>
                    <View style={[styles.statCard, { borderLeftColor: colors.accentRed }]}>
                        <Text style={styles.statValue}>{summary.blocked}</Text>
                        <Text style={styles.statLabel}>Zablokowane</Text>
                    </View>
                    <View style={[styles.statCard, { borderLeftColor: colors.accentGreen }]}>
                        <Text style={styles.statValue}>{summary.done}</Text>
                        <Text style={styles.statLabel}>Gotowe</Text>
                    </View>
                </View>
            )}

            {/* Blocked tasks alert */}
            {summary && summary.blocked > 0 && (
                <View style={styles.alertCard}>
                    <Text style={styles.alertIcon}>⚠️</Text>
                    <View style={styles.alertContent}>
                        <Text style={styles.alertTitle}>{summary.blocked} zablokowanych zadań</Text>
                        <Text style={styles.alertText}>Wymaga natychmiastowej uwagi</Text>
                    </View>
                </View>
            )}

            {/* Active workers */}
            <Text style={styles.sectionTitle}>👷 Aktywny zespół ({workers.length})</Text>
            <View style={styles.workersRow}>
                {workers.map(w => (
                    <View key={w.id} style={styles.workerChip}>
                        <View style={styles.workerAvatar}>
                            <Text style={styles.workerAvatarText}>
                                {w.name.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <Text style={styles.workerName} numberOfLines={1}>{w.name.split(' ')[0]}</Text>
                    </View>
                ))}
                {workers.length === 0 && (
                    <Text style={styles.emptyText}>Brak aktywnych pracowników</Text>
                )}
            </View>

            {/* Recent tasks */}
            <Text style={styles.sectionTitle}>📋 Bieżące zadania</Text>
            {recentTasks.map(task => (
                <TouchableOpacity key={task.id} style={styles.taskCard}
                    onPress={() => navigation.navigate('AdminTaskDetail', { taskId: task.id })}
                    activeOpacity={0.7}
                >
                    <View style={styles.taskHeader}>
                        <Text style={styles.taskStatus}>{statusIcon(task.status)}</Text>
                        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                    </View>
                    <View style={styles.taskMeta}>
                        {task.ship_name && <Text style={styles.taskShip}>🚢 {task.ship_name}</Text>}
                        <Text style={styles.taskStatusLabel}>{statusLabel(task.status)}</Text>
                    </View>
                </TouchableOpacity>
            ))}

            {/* Quick actions */}
            <Text style={styles.sectionTitle}>⚡ Szybkie akcje</Text>
            <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn}
                    onPress={() => navigation.navigate('AdminTasks')}>
                    <Text style={styles.actionIcon}>📋</Text>
                    <Text style={styles.actionLabel}>Wszystkie zadania</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn}
                    onPress={() => navigation.navigate('Magazyn')}>
                    <Text style={styles.actionIcon}>📦</Text>
                    <Text style={styles.actionLabel}>Magazyn</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
    greeting: { fontSize: 24, fontWeight: '700', color: colors.text },
    date: { fontSize: fonts.md, color: colors.textMuted, marginBottom: spacing.lg },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    statCard: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderLeftWidth: 3,
        padding: spacing.md,
    },
    statValue: { fontSize: 28, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 2 },

    alertCard: {
        backgroundColor: colors.accentRed + '11',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.accentRed + '33',
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    alertIcon: { fontSize: 28, marginRight: spacing.md },
    alertContent: { flex: 1 },
    alertTitle: { fontSize: fonts.md, fontWeight: '700', color: colors.accentRed },
    alertText: { fontSize: fonts.sm, color: colors.textMuted },

    sectionTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.md, marginTop: spacing.md },

    workersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    workerChip: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.full,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    workerAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.primary + '33',
        justifyContent: 'center',
        alignItems: 'center',
    },
    workerAvatarText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    workerName: { fontSize: fonts.sm, color: colors.text, fontWeight: '500' },
    emptyText: { color: colors.textDim, fontSize: fonts.sm },

    taskCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    taskHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    taskStatus: { fontSize: 14 },
    taskTitle: { flex: 1, fontSize: fonts.md, fontWeight: '600', color: colors.text },
    taskMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
    taskShip: { fontSize: fonts.sm, color: colors.textMuted },
    taskStatusLabel: { fontSize: fonts.sm, color: colors.textDim },

    actionsRow: { flexDirection: 'row', gap: spacing.sm },
    actionBtn: {
        flex: 1,
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        alignItems: 'center',
    },
    actionIcon: { fontSize: 28, marginBottom: spacing.sm },
    actionLabel: { fontSize: fonts.sm, color: colors.text, fontWeight: '500', textAlign: 'center' },
});
