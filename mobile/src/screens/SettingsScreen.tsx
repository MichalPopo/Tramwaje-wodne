import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../AuthContext';
import {
    getConnectionStatus, addStatusListener, manualSync,
    type ConnectionStatus,
} from '../sync/serverDiscovery';
import { getSyncQueueCount } from '../db/localDb';
import { getScheduledCount } from '../notifications';
import { colors, spacing, fonts, radius } from '../theme';

export default function SettingsScreen() {
    const { user, logout } = useAuth();
    const [connStatus, setConnStatus] = useState<ConnectionStatus>(getConnectionStatus());
    const [pendingChanges, setPendingChanges] = useState(0);
    const [scheduledNotifs, setScheduledNotifs] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        const unsub = addStatusListener(setConnStatus);
        loadCounts();
        return unsub;
    }, []);

    const loadCounts = async () => {
        try {
            setPendingChanges(await getSyncQueueCount());
            setScheduledNotifs(await getScheduledCount());
        } catch { /* db not ready */ }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await manualSync();
            Alert.alert(result.success ? '✅ Synchronizacja' : '❌ Błąd', result.message);
            loadCounts();
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const formatSyncTime = (iso: string | null) => {
        if (!iso) return 'Nigdy';
        const d = new Date(iso);
        const now = new Date();
        const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
        if (diffMin < 1) return 'Właśnie teraz';
        if (diffMin < 60) return `${diffMin} min temu`;
        return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <View style={styles.container}>
            {/* Profile card */}
            <View style={styles.profileCard}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {user?.name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                </View>
                <Text style={styles.userName}>{user?.name}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                <View style={[styles.roleBadge, user?.role === 'admin' ? styles.roleAdmin : styles.roleWorker]}>
                    <Text style={styles.roleText}>
                        {user?.role === 'admin' ? '👑 Admin' : '👷 Pracownik'}
                    </Text>
                </View>
            </View>

            {/* Connection status */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📡 Status połączenia</Text>
                <View style={styles.statusRow}>
                    <View style={[styles.statusDot, connStatus.isOnline ? styles.statusOnline : styles.statusOffline]} />
                    <Text style={styles.statusText}>
                        {connStatus.checking ? 'Sprawdzam...' : connStatus.isOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
                <Text style={styles.cardText}>
                    Ostatnia sync: {formatSyncTime(connStatus.lastSync)}
                </Text>
                {pendingChanges > 0 && (
                    <Text style={styles.pendingText}>
                        📤 {pendingChanges} zmian do wysłania
                    </Text>
                )}

                <TouchableOpacity
                    style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
                    onPress={handleSync}
                    disabled={isSyncing}
                >
                    {isSyncing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <Text style={styles.syncBtnText}>🔄 Synchronizuj teraz</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* App info */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📱 Informacje</Text>
                <Text style={styles.cardText}>Zaplanowane powiadomienia: {scheduledNotifs}</Text>
                <Text style={styles.cardText}>Serwer: {connStatus.serverUrl || '(nie skonfigurowany)'}</Text>
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
                <Text style={styles.logoutText}>🚪 Wyloguj się</Text>
            </TouchableOpacity>

            <Text style={styles.version}>Tramwaje Wodne Mobile v0.2.0</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
    profileCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.xl,
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    avatar: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: colors.primary + '33',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: spacing.md,
    },
    avatarText: { fontSize: 28, fontWeight: '700', color: colors.primary },
    userName: { fontSize: fonts.xl, fontWeight: '700', color: colors.text },
    userEmail: { fontSize: fonts.md, color: colors.textMuted, marginTop: 2 },
    roleBadge: {
        marginTop: spacing.md, paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs, borderRadius: radius.full,
    },
    roleAdmin: { backgroundColor: colors.accent + '22' },
    roleWorker: { backgroundColor: colors.primary + '22' },
    roleText: { fontSize: fonts.sm, color: colors.text, fontWeight: '600' },

    card: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    cardTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    cardText: { fontSize: fonts.md, color: colors.textMuted, marginBottom: 4 },

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusOnline: { backgroundColor: colors.accentGreen },
    statusOffline: { backgroundColor: colors.accentRed },
    statusText: { fontSize: fonts.md, color: colors.text, fontWeight: '500' },
    pendingText: { fontSize: fonts.sm, color: colors.accent, marginTop: spacing.sm },

    syncBtn: {
        marginTop: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary,
        alignItems: 'center',
    },
    syncBtnDisabled: { opacity: 0.5 },
    syncBtnText: { color: colors.primary, fontSize: fonts.md, fontWeight: '600' },

    logoutBtn: {
        backgroundColor: colors.accentRed + '22',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.accentRed + '44',
        padding: spacing.lg,
        alignItems: 'center',
    },
    logoutText: { color: colors.accentRed, fontSize: fonts.lg, fontWeight: '600' },
    version: {
        textAlign: 'center', color: colors.textDim,
        fontSize: fonts.sm, marginTop: spacing.xxl,
    },
});
