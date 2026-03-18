/**
 * Sync service — synchronizes local SQLite with server over WiFi.
 * Pull: fetch data from server → cache locally
 * Push: flush sync queue (offline mutations) → server
 * Conflict: server wins + local notification
 */
import { getServerUrl } from '../api';
import * as SecureStore from 'expo-secure-store';
import {
    cacheTasks, cacheMyTasks, cacheInventory,
    getSyncQueue, removeSyncItem, updateSyncItemError,
    getSyncQueueCount, setMeta, getMeta,
    addNotification,
} from '../db/localDb';

const TOKEN_KEY = 'tw_auth_token';

async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

async function serverRequest(endpoint: string, method = 'GET', body?: any): Promise<any> {
    const serverUrl = await getServerUrl();
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${serverUrl}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return null;
    return res.json();
}

// ========== Pull (Server → Local) ==========

export async function pullTasks(): Promise<boolean> {
    try {
        const data = await serverRequest('/api/tasks?limit=200');
        if (data?.tasks) {
            await cacheTasks(data.tasks);
        }
        return true;
    } catch {
        return false;
    }
}

export async function pullMyTasks(): Promise<boolean> {
    try {
        const data = await serverRequest('/api/tasks/my');
        if (data?.tasks) {
            await cacheMyTasks(data.tasks.map((t: any) => ({
                ...t,
                gantt_start: null,
                gantt_end: null,
            })));
        }
        // Try to get Gantt data for scheduling
        try {
            const gantt = await serverRequest('/api/tasks/gantt');
            if (gantt?.tasks) {
                // Merge Gantt scheduling info into cached tasks
                const myTaskIds = new Set(data.tasks.map((t: any) => t.id));
                const myGantt = gantt.tasks.filter((g: any) => myTaskIds.has(g.id));
                if (myGantt.length > 0) {
                    await cacheMyTasks(myGantt.map((g: any) => {
                        const original = data.tasks.find((t: any) => t.id === g.id);
                        return { ...original, ...g };
                    }));
                }
            }
        } catch {
            // Gantt fetch failed, still have basic tasks
        }
        return true;
    } catch {
        return false;
    }
}

export async function pullInventory(): Promise<boolean> {
    try {
        const data = await serverRequest('/api/inventory');
        if (data?.items) {
            await cacheInventory(data.items);
        }
        return true;
    } catch {
        return false;
    }
}

// ========== Push (Local → Server) ==========

export async function pushSyncQueue(): Promise<{ pushed: number; failed: number }> {
    const queue = await getSyncQueue();
    let pushed = 0;
    let failed = 0;

    for (const item of queue) {
        try {
            const payload = JSON.parse(item.payload);
            await serverRequest(item.endpoint, item.method, payload);
            await removeSyncItem(item.id);
            pushed++;
        } catch (err: any) {
            await updateSyncItemError(item.id, err.message || 'Unknown error');
            failed++;

            // If retried too many times, notify and remove
            if (item.retries >= 5) {
                await addNotification({
                    type: 'sync',
                    title: 'Sync nie powiódł się',
                    body: `Nie udało się wysłać: ${item.type} (${err.message})`,
                    data: { queue_id: item.id },
                });
                await removeSyncItem(item.id);
            }
        }
    }

    return { pushed, failed };
}

// ========== Full Sync ==========

export interface SyncResult {
    success: boolean;
    pulled: { tasks: boolean; myTasks: boolean; inventory: boolean };
    pushed: { count: number; failed: number };
    timestamp: string;
}

export async function fullSync(): Promise<SyncResult> {
    const timestamp = new Date().toISOString();

    // Push first (send offline changes before pulling fresh data)
    const pushResult = await pushSyncQueue();

    // Then pull fresh data
    const [tasks, myTasks, inventory] = await Promise.all([
        pullTasks(),
        pullMyTasks(),
        pullInventory(),
    ]);

    const success = tasks || myTasks || inventory; // At least one succeeded

    if (success) {
        await setMeta('last_sync', timestamp);
    }

    if (pushResult.pushed > 0) {
        await addNotification({
            type: 'sync',
            title: 'Synchronizacja zakończona',
            body: `Wysłano ${pushResult.pushed} zmian${pushResult.failed > 0 ? `, ${pushResult.failed} błędów` : ''}`,
        });
    }

    return {
        success,
        pulled: { tasks, myTasks, inventory },
        pushed: { count: pushResult.pushed, failed: pushResult.failed },
        timestamp,
    };
}

export async function getLastSyncTime(): Promise<string | null> {
    return getMeta('last_sync');
}

export async function getPendingChangesCount(): Promise<number> {
    return getSyncQueueCount();
}
