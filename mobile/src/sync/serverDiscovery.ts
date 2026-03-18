/**
 * Server discovery and connection status.
 * Monitors server availability, auto-reconnects, and provides connection state.
 */
import { getServerUrl, checkServerConnection } from '../api';
import { fullSync, getLastSyncTime, getPendingChangesCount } from './syncService';

export interface ConnectionStatus {
    isOnline: boolean;
    serverUrl: string;
    lastSync: string | null;
    pendingChanges: number;
    checking: boolean;
}

type StatusListener = (status: ConnectionStatus) => void;

let currentStatus: ConnectionStatus = {
    isOnline: false,
    serverUrl: '',
    lastSync: null,
    pendingChanges: 0,
    checking: false,
};

const listeners: Set<StatusListener> = new Set();
let checkInterval: ReturnType<typeof setInterval> | null = null;

export function getConnectionStatus(): ConnectionStatus {
    return { ...currentStatus };
}

export function addStatusListener(listener: StatusListener): () => void {
    listeners.add(listener);
    listener(currentStatus);
    return () => listeners.delete(listener);
}

function notifyListeners(): void {
    listeners.forEach(l => l({ ...currentStatus }));
}

export async function checkConnection(): Promise<boolean> {
    currentStatus.checking = true;
    notifyListeners();

    try {
        currentStatus.serverUrl = await getServerUrl();
        const ok = await checkServerConnection();
        const wasOffline = !currentStatus.isOnline;
        currentStatus.isOnline = ok;

        if (ok) {
            // Refresh sync metadata
            currentStatus.lastSync = await getLastSyncTime();
            currentStatus.pendingChanges = await getPendingChangesCount();

            // If we just came online, trigger sync
            if (wasOffline) {
                try {
                    const result = await fullSync();
                    currentStatus.lastSync = result.timestamp;
                    currentStatus.pendingChanges = await getPendingChangesCount();
                } catch {
                    // Sync failed, but we are online
                }
            }
        }

        return ok;
    } catch {
        currentStatus.isOnline = false;
        return false;
    } finally {
        currentStatus.checking = false;
        notifyListeners();
    }
}

export function startConnectionMonitor(intervalMs = 30000): void {
    if (checkInterval) return;

    // Initial check
    checkConnection();

    // Periodic checks
    checkInterval = setInterval(() => {
        checkConnection();
    }, intervalMs);
}

export function stopConnectionMonitor(): void {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

export async function manualSync(): Promise<{ success: boolean; message: string }> {
    if (!currentStatus.isOnline) {
        return { success: false, message: 'Brak połączenia z serwerem' };
    }

    try {
        const result = await fullSync();
        currentStatus.lastSync = result.timestamp;
        currentStatus.pendingChanges = await getPendingChangesCount();
        notifyListeners();

        const parts: string[] = [];
        if (result.pushed.count > 0) parts.push(`wysłano ${result.pushed.count} zmian`);
        if (result.pushed.failed > 0) parts.push(`${result.pushed.failed} błędów`);
        if (result.pulled.tasks) parts.push('pobrano zadania');
        if (result.pulled.inventory) parts.push('pobrano magazyn');

        return {
            success: result.success,
            message: parts.length > 0 ? `Sync: ${parts.join(', ')}` : 'Wszystko aktualne',
        };
    } catch (err: any) {
        return { success: false, message: err.message || 'Błąd synchronizacji' };
    }
}
