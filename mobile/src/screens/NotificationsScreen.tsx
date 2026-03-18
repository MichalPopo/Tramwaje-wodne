import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { getNotifications, markNotificationRead, getUnreadCount } from '../db/localDb';
import { colors, spacing, fonts, radius } from '../theme';

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const data = await getNotifications(100);
            setNotifications(data);
        } catch {
            // DB not ready
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handlePress = async (notification: any) => {
        if (!notification.read) {
            await markNotificationRead(notification.id);
            load();
        }
    };

    const typeIcon = (type: string) => {
        switch (type) {
            case 'deadline': return '⏰';
            case 'sync': return '🔄';
            case 'report': return '🚨';
            case 'reminder': return '📋';
            default: return '🔔';
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);

        if (diffMin < 1) return 'teraz';
        if (diffMin < 60) return `${diffMin} min temu`;
        if (diffHr < 24) return `${diffHr}h temu`;
        return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    };

    return (
        <View style={styles.container}>
            <FlatList
                data={notifications}
                keyExtractor={n => String(n.id)}
                renderItem={({ item: n }) => (
                    <TouchableOpacity
                        style={[styles.notifCard, !n.read && styles.notifUnread]}
                        onPress={() => handlePress(n)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.notifIcon}>{typeIcon(n.type)}</Text>
                        <View style={styles.notifContent}>
                            <Text style={[styles.notifTitle, !n.read && styles.notifTitleBold]}>
                                {n.title}
                            </Text>
                            {n.body && <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>}
                            <Text style={styles.notifTime}>{formatTime(n.created_at)}</Text>
                        </View>
                        {!n.read && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                )}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>🔔</Text>
                        <Text style={styles.emptyTitle}>Brak powiadomień</Text>
                        <Text style={styles.emptyText}>
                            Tutaj będą pojawiać się powiadomienia o zadaniach,
                            synchronizacji i zgłoszeniach.
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    listContent: { padding: spacing.md, paddingBottom: spacing.xxl },

    notifCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },
    notifUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
    notifIcon: { fontSize: 24, marginTop: 2 },
    notifContent: { flex: 1 },
    notifTitle: { fontSize: fonts.md, color: colors.text },
    notifTitleBold: { fontWeight: '700' },
    notifBody: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 2 },
    notifTime: { fontSize: 11, color: colors.textDim, marginTop: 4 },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        marginTop: 6,
    },

    empty: { alignItems: 'center', paddingTop: spacing.xxl * 3 },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: { fontSize: fonts.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    emptyText: { fontSize: fonts.md, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xxl },
});
