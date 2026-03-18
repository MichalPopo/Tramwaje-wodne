import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { tasksApi } from '../api';
import { colors, spacing, fonts, radius } from '../theme';

const STATUS_LABELS: Record<string, string> = {
    todo: '📋 Do zrobienia',
    in_progress: '🔄 W toku',
    blocked: '🚫 Wstrzymane',
    done: '✅ Ukończone',
};

const STATUS_COLORS: Record<string, string> = {
    todo: colors.statusTodo,
    in_progress: colors.statusProgress,
    blocked: colors.statusBlocked,
    done: colors.statusDone,
};

export default function TaskDetailScreen({ route, navigation }: any) {
    const { taskId } = route.params;
    const { token } = useAuth();
    const [task, setTask] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showTimeInput, setShowTimeInput] = useState(false);
    const [hours, setHours] = useState('');
    const [note, setNote] = useState('');

    const loadTask = async () => {
        if (!token) return;
        try {
            const data = await tasksApi.get(token, taskId);
            setTask(data.task);
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadTask(); }, [taskId]);

    const changeStatus = async (newStatus: string) => {
        if (!token) return;
        try {
            const data = await tasksApi.changeStatus(token, taskId, newStatus);
            setTask(data.task);
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        }
    };

    const logTime = async () => {
        if (!token || !hours.trim()) return;
        const h = parseFloat(hours);
        if (isNaN(h) || h <= 0) {
            Alert.alert('Błąd', 'Wpisz poprawną liczbę godzin');
            return;
        }
        try {
            await tasksApi.logTime(token, taskId, h, note.trim() || undefined);
            setShowTimeInput(false);
            setHours('');
            setNote('');
            loadTask();
            Alert.alert('✅', `Zapisano ${h}h`);
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!task) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.errorText}>Nie znaleziono zadania</Text>
            </View>
        );
    }

    const statusColor = STATUS_COLORS[task.status] || colors.textDim;

    // Available status transitions
    const transitions: { label: string; status: string; color: string }[] = [];
    if (task.status === 'todo') {
        transitions.push({ label: '▶ Rozpocznij', status: 'in_progress', color: colors.statusProgress });
    }
    if (task.status === 'in_progress') {
        transitions.push({ label: '✅ Zakończ', status: 'done', color: colors.statusDone });
        transitions.push({ label: '🚫 Wstrzymaj', status: 'blocked', color: colors.statusBlocked });
    }
    if (task.status === 'blocked') {
        transitions.push({ label: '▶ Wznów', status: 'in_progress', color: colors.statusProgress });
    }
    if (task.status === 'done') {
        transitions.push({ label: '↩ Cofnij do "Do zrobienia"', status: 'todo', color: colors.statusTodo });
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Status badge */}
            <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                    {STATUS_LABELS[task.status]}
                </Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{task.title}</Text>

            {/* Meta row */}
            <View style={styles.metaRow}>
                {task.ship_name && (
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Statek</Text>
                        <Text style={styles.metaValue}>🚢 {task.ship_name}</Text>
                    </View>
                )}
                <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Priorytet</Text>
                    <Text style={[styles.metaValue, { color: colors[`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as keyof typeof colors] || colors.text }]}>
                        {task.priority}
                    </Text>
                </View>
                {task.estimated_hours && (
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Czas</Text>
                        <Text style={styles.metaValue}>
                            {task.logged_hours || 0}/{task.estimated_hours}h
                        </Text>
                    </View>
                )}
            </View>

            {/* Description */}
            {task.description && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>📝 Opis</Text>
                    <Text style={styles.descriptionText}>{task.description}</Text>
                </View>
            )}

            {/* Assignees */}
            {task.assignees?.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>👷 Przypisani</Text>
                    {task.assignees.map((a: any) => (
                        <Text key={a.id} style={styles.assigneeName}>{a.name}</Text>
                    ))}
                </View>
            )}

            {/* Time logging */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>⏱ Czas pracy</Text>
                {task.time_logs?.map((log: any) => (
                    <View key={log.id} style={styles.timeLogRow}>
                        <Text style={styles.timeLogHours}>{log.hours}h</Text>
                        <Text style={styles.timeLogNote}>{log.note || '—'}</Text>
                        <Text style={styles.timeLogDate}>
                            {new Date(log.logged_at).toLocaleDateString('pl-PL')}
                        </Text>
                    </View>
                ))}

                {!showTimeInput ? (
                    <TouchableOpacity
                        style={styles.addTimeBtn}
                        onPress={() => setShowTimeInput(true)}
                    >
                        <Text style={styles.addTimeBtnText}>+ Dodaj czas</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.timeInputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="Godziny (np. 2.5)"
                            placeholderTextColor={colors.textDim}
                            value={hours}
                            onChangeText={setHours}
                            keyboardType="numeric"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Notatka (opcjonalnie)"
                            placeholderTextColor={colors.textDim}
                            value={note}
                            onChangeText={setNote}
                        />
                        <View style={styles.timeInputButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTimeInput(false)}>
                                <Text style={styles.cancelBtnText}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={logTime}>
                                <Text style={styles.saveBtnText}>Zapisz</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* Status transitions */}
            {transitions.length > 0 && (
                <View style={styles.actionsSection}>
                    {transitions.map(t => (
                        <TouchableOpacity
                            key={t.status}
                            style={[styles.actionBtn, { borderColor: t.color }]}
                            onPress={() => changeStatus(t.status)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.actionBtnText, { color: t.color }]}>{t.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
    loadingContainer: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: colors.accentRed, fontSize: fonts.lg },

    statusBadge: {
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: radius.full,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        marginBottom: spacing.md,
    },
    statusText: { fontSize: fonts.sm, fontWeight: '600' },

    title: { fontSize: fonts.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },

    metaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    metaItem: {
        flex: 1,
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        padding: spacing.md,
    },
    metaLabel: { fontSize: fonts.sm, color: colors.textMuted, marginBottom: 2 },
    metaValue: { fontSize: fonts.md, color: colors.text, fontWeight: '600' },

    card: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    cardTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
    descriptionText: { fontSize: fonts.md, color: colors.textMuted, lineHeight: 22 },
    assigneeName: { fontSize: fonts.md, color: colors.text, marginBottom: spacing.xs },

    timeLogRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    timeLogHours: { fontSize: fonts.md, fontWeight: '700', color: colors.primary, minWidth: 40 },
    timeLogNote: { flex: 1, fontSize: fonts.sm, color: colors.textMuted },
    timeLogDate: { fontSize: fonts.sm, color: colors.textDim },

    addTimeBtn: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        alignItems: 'center',
    },
    addTimeBtnText: { color: colors.primary, fontWeight: '600' },

    timeInputContainer: { marginTop: spacing.md, gap: spacing.sm },
    input: {
        backgroundColor: colors.bgInput,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        fontSize: fonts.md,
        color: colors.text,
    },
    timeInputButtons: { flexDirection: 'row', gap: spacing.md },
    cancelBtn: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    cancelBtnText: { color: colors.textMuted },
    saveBtn: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        alignItems: 'center',
    },
    saveBtnText: { color: '#fff', fontWeight: '600' },

    actionsSection: { gap: spacing.sm, marginTop: spacing.md },
    actionBtn: {
        borderWidth: 2,
        borderRadius: radius.md,
        padding: spacing.lg,
        alignItems: 'center',
    },
    actionBtnText: { fontSize: fonts.lg, fontWeight: '700' },
});
