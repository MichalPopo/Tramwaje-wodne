import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, SectionList,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { tasksApi } from '../api';
import { getCachedMyTasks, cacheMyTasks } from '../db/localDb';
import { getConnectionStatus, addStatusListener } from '../sync/serverDiscovery';
import { colors, spacing, fonts, radius } from '../theme';

type GanttTask = {
    id: number; title: string; status: string; priority: string;
    ship_name?: string; estimated_hours?: number; actual_hours?: number;
    start_date?: string; end_date?: string; assignees?: { id: number; name: string }[];
};

type Section = { title: string; icon: string; data: GanttTask[] };

export default function TasksScreen({ navigation }: any) {
    const { token, user } = useAuth();
    const [sections, setSections] = useState<Section[]>([]);
    const [stats, setStats] = useState({ inProgress: 0, today: 0, blocked: 0, done: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [isOfflineData, setIsOfflineData] = useState(false);

    useEffect(() => {
        const unsub = addStatusListener(status => setIsOnline(status.isOnline));
        return unsub;
    }, []);

    const groupByDay = (tasks: GanttTask[]): Section[] => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
        const dayAfter2 = new Date(today); dayAfter2.setDate(today.getDate() + 3);

        const buckets: Record<string, { icon: string; tasks: GanttTask[] }> = {
            'Dziś': { icon: '📅', tasks: [] },
            'Jutro': { icon: '🗓️', tasks: [] },
            'Pojutrze': { icon: '📆', tasks: [] },
            'Później': { icon: '🗃️', tasks: [] },
        };

        for (const task of tasks) {
            const start = task.start_date ? new Date(task.start_date) : null;
            if (!start || start < tomorrow) buckets['Dziś'].tasks.push(task);
            else if (start < dayAfter) buckets['Jutro'].tasks.push(task);
            else if (start < dayAfter2) buckets['Pojutrze'].tasks.push(task);
            else buckets['Później'].tasks.push(task);
        }

        return Object.entries(buckets)
            .filter(([, v]) => v.tasks.length > 0)
            .map(([title, v]) => ({ title, icon: v.icon, data: v.tasks }));
    };

    const loadTasks = useCallback(async () => {
        if (!token || !user) return;
        setIsOfflineData(false);

        try {
            // Try online first
            const [myTasks, ganttData] = await Promise.all([
                tasksApi.my(token),
                tasksApi.gantt(token, { assignee_id: String(user.id) }).catch(() => null),
            ]);

            const tasks: GanttTask[] = (ganttData?.tasks || myTasks.tasks || []) as any[];

            // Cache locally for offline
            await cacheMyTasks(tasks).catch(() => {});

            const sects = groupByDay(tasks);
            setSections(sects);

            // Compute stats
            const allTasks = tasks;
            setStats({
                inProgress: allTasks.filter(t => t.status === 'in_progress').length,
                today: sects.find(s => s.title === 'Dziś')?.data.length || 0,
                blocked: allTasks.filter(t => t.status === 'blocked').length,
                done: allTasks.filter(t => t.status === 'completed').length,
            });
        } catch {
            // Offline — use cached data
            try {
                const cached = await getCachedMyTasks();
                if (cached.length > 0) {
                    setIsOfflineData(true);
                    const sects = groupByDay(cached);
                    setSections(sects);
                    setStats({
                        inProgress: cached.filter((t: any) => t.status === 'in_progress').length,
                        today: sects.find(s => s.title === 'Dziś')?.data.length || 0,
                        blocked: cached.filter((t: any) => t.status === 'blocked').length,
                        done: cached.filter((t: any) => t.status === 'completed').length,
                    });
                }
            } catch {
                // No cache either
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token, user]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        loadTasks();
    }, [loadTasks]);

    const priorityColor = (p: string) => {
        switch (p) {
            case 'critical': return colors.accentRed;
            case 'high': return '#f97316';
            case 'medium': return colors.accent;
            case 'low': return colors.accentGreen;
            default: return colors.textDim;
        }
    };

    return (
        <View style={styles.container}>
            {/* Offline banner */}
            {(!isOnline || isOfflineData) && (
                <View style={styles.offlineBanner}>
                    <Text style={styles.offlineText}>
                        {isOfflineData ? '📴 Dane offline — synchronizuj w Profilu' : '📡 Sprawdzam połączenie...'}
                    </Text>
                </View>
            )}

            {/* Stats bar */}
            <View style={styles.statsBar}>
                <View style={[styles.statBox, { borderColor: colors.primary }]}>
                    <Text style={styles.statNum}>{stats.inProgress}</Text>
                    <Text style={styles.statLabel}>W toku</Text>
                </View>
                <View style={[styles.statBox, { borderColor: colors.accent }]}>
                    <Text style={styles.statNum}>{stats.today}</Text>
                    <Text style={styles.statLabel}>Dziś</Text>
                </View>
                <View style={[styles.statBox, { borderColor: colors.accentRed }]}>
                    <Text style={styles.statNum}>{stats.blocked}</Text>
                    <Text style={styles.statLabel}>Wstrzymane</Text>
                </View>
                <View style={[styles.statBox, { borderColor: colors.accentGreen }]}>
                    <Text style={styles.statNum}>{stats.done}</Text>
                    <Text style={styles.statLabel}>Gotowe</Text>
                </View>
            </View>

            <SectionList
                sections={sections}
                keyExtractor={item => String(item.id)}
                renderSectionHeader={({ section }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionIcon}>{section.icon}</Text>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionCount}>{section.data.length}</Text>
                    </View>
                )}
                renderItem={({ item: task }) => (
                    <TouchableOpacity
                        style={styles.taskCard}
                        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority) }]} />
                        <View style={styles.taskContent}>
                            <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                            <View style={styles.taskMeta}>
                                {task.ship_name && <Text style={styles.metaText}>🚢 {task.ship_name}</Text>}
                                <Text style={styles.metaText}>⏱ /{task.estimated_hours}h</Text>
                            </View>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                )}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
                        tintColor={colors.primary} colors={[colors.primary]} />
                }
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>
                            {isLoading ? '⏳ Ładowanie...' : '🎉 Brak przypisanych zadań'}
                        </Text>
                    </View>
                }
                stickySectionHeadersEnabled={false}
            />

            {/* Report problem FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('ReportProblem')}
                activeOpacity={0.8}
            >
                <Text style={styles.fabText}>🚨</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    offlineBanner: {
        backgroundColor: colors.accent + '22',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    offlineText: { color: colors.accent, fontSize: fonts.sm, textAlign: 'center' },

    statsBar: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    statBox: {
        flex: 1,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        alignItems: 'center',
        backgroundColor: colors.bgCard,
    },
    statNum: { fontSize: fonts.xl, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl * 3 },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    sectionIcon: { fontSize: 18 },
    sectionTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.text },
    sectionCount: {
        fontSize: fonts.sm,
        color: colors.textDim,
        backgroundColor: colors.bgCard,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.full,
    },

    taskCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    priorityDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
    taskContent: { flex: 1 },
    taskTitle: { fontSize: fonts.md, fontWeight: '600', color: colors.text },
    taskMeta: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
    metaText: { fontSize: fonts.sm, color: colors.textMuted },
    chevron: { fontSize: 24, color: colors.textDim, marginLeft: spacing.sm },

    empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
    emptyText: { fontSize: fonts.lg, color: colors.textMuted },

    fab: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.accentRed,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    fabText: { fontSize: 24 },
});
