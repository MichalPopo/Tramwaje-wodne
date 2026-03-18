import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { getServerUrl } from '../api';
import { colors, spacing, fonts, radius } from '../theme';

const STATUS_FLOW: Record<string, string[]> = {
    pending: ['in_progress'],
    in_progress: ['completed', 'blocked'],
    blocked: ['in_progress'],
    completed: [],
};

export default function AdminTasksScreen({ navigation }: any) {
    const { token } = useAuth();
    const [tasks, setTasks] = useState<any[]>([]);
    const [filter, setFilter] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadTasks = useCallback(async () => {
        if (!token) return;
        const serverUrl = await getServerUrl();
        try {
            const params = filter !== 'all' ? `?status=${filter}` : '?limit=50';
            const res = await fetch(`${serverUrl}/api/tasks${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setTasks(data.tasks || []);
        } catch {
            // Offline
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token, filter]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        loadTasks();
    }, [loadTasks]);

    const changeStatus = async (taskId: number, newStatus: string) => {
        if (!token) return;
        const serverUrl = await getServerUrl();
        try {
            const res = await fetch(`${serverUrl}/api/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                loadTasks();
            } else {
                const err = await res.json().catch(() => ({}));
                Alert.alert('Błąd', err.error || 'Nie udało się zmienić statusu');
            }
        } catch (err: any) {
            Alert.alert('Błąd', 'Brak połączenia z serwerem');
        }
    };

    const confirmStatusChange = (taskId: number, taskTitle: string, newStatus: string) => {
        const statusLabels: Record<string, string> = {
            in_progress: 'W toku',
            completed: 'Gotowe',
            blocked: 'Zablokowane',
        };
        Alert.alert(
            'Zmień status',
            `${taskTitle}\n→ ${statusLabels[newStatus] || newStatus}`,
            [
                { text: 'Anuluj', style: 'cancel' },
                { text: 'Zmień', onPress: () => changeStatus(taskId, newStatus) },
            ]
        );
    };

    const statusIcon = (s: string) => {
        switch (s) {
            case 'pending': return '🔵';
            case 'in_progress': return '🟡';
            case 'blocked': return '🔴';
            case 'completed': return '🟢';
            default: return '⚪';
        }
    };

    const filters = [
        { key: 'all', label: 'Wszystkie' },
        { key: 'pending', label: '🔵 Oczekujące' },
        { key: 'in_progress', label: '🟡 W toku' },
        { key: 'blocked', label: '🔴 Zablokowane' },
        { key: 'completed', label: '🟢 Gotowe' },
    ];

    return (
        <View style={styles.container}>
            {/* Filter bar */}
            <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={filters}
                keyExtractor={f => f.key}
                renderItem={({ item: f }) => (
                    <TouchableOpacity
                        style={[styles.filterChip, filter === f.key && styles.filterActive]}
                        onPress={() => setFilter(f.key)}
                    >
                        <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                )}
                contentContainerStyle={styles.filterBar}
            />

            {/* Task list */}
            <FlatList
                data={tasks}
                keyExtractor={t => String(t.id)}
                renderItem={({ item: task }) => (
                    <View style={styles.taskCard}>
                        <View style={styles.taskHeader}>
                            <Text style={styles.taskStatusIcon}>{statusIcon(task.status)}</Text>
                            <View style={styles.taskInfo}>
                                <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                                <View style={styles.taskMeta}>
                                    {task.ship_name && <Text style={styles.metaText}>🚢 {task.ship_name}</Text>}
                                    <Text style={styles.metaText}>⏱ {task.estimated_hours}h</Text>
                                    {task.assignees?.length > 0 && (
                                        <Text style={styles.metaText}>
                                            👤 {task.assignees.map((a: any) => a.name?.split(' ')[0]).join(', ')}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Quick action buttons */}
                        {STATUS_FLOW[task.status]?.length > 0 && (
                            <View style={styles.actionRow}>
                                {STATUS_FLOW[task.status].map(nextStatus => (
                                    <TouchableOpacity
                                        key={nextStatus}
                                        style={[
                                            styles.actionBtn,
                                            nextStatus === 'completed' && styles.actionBtnGreen,
                                            nextStatus === 'blocked' && styles.actionBtnRed,
                                            nextStatus === 'in_progress' && styles.actionBtnBlue,
                                        ]}
                                        onPress={() => confirmStatusChange(task.id, task.title, nextStatus)}
                                    >
                                        <Text style={styles.actionBtnText}>
                                            {nextStatus === 'in_progress' && '▶ Rozpocznij'}
                                            {nextStatus === 'completed' && '✅ Gotowe'}
                                            {nextStatus === 'blocked' && '🚫 Zablokuj'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                )}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
                        tintColor={colors.primary} colors={[colors.primary]} />
                }
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>
                            {isLoading ? '⏳ Ładowanie...' : '📋 Brak zadań w tym filtrze'}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    filterBar: { padding: spacing.md, gap: spacing.sm },
    filterChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bgCard,
    },
    filterActive: { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
    filterText: { fontSize: fonts.sm, color: colors.textMuted },
    filterTextActive: { color: colors.primary, fontWeight: '600' },

    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },

    taskCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    taskStatusIcon: { fontSize: 16, marginTop: 2 },
    taskInfo: { flex: 1 },
    taskTitle: { fontSize: fonts.md, fontWeight: '600', color: colors.text },
    taskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
    metaText: { fontSize: fonts.sm, color: colors.textMuted },

    actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    actionBtn: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    actionBtnBlue: { borderColor: colors.primary + '66', backgroundColor: colors.primary + '11' },
    actionBtnGreen: { borderColor: colors.accentGreen + '66', backgroundColor: colors.accentGreen + '11' },
    actionBtnRed: { borderColor: colors.accentRed + '66', backgroundColor: colors.accentRed + '11' },
    actionBtnText: { fontSize: fonts.sm, color: colors.text, fontWeight: '500' },

    empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
    emptyText: { fontSize: fonts.lg, color: colors.textMuted },
});
